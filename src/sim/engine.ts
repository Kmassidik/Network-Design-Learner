import { BEHAVIOURS, type BehaviourContext, type DeviceState, type HeldFrame } from './behaviour';
import { arpRequest } from './behaviour-shared';
import { MinHeap } from './heap';
import { parseIpv4, sameSubnet } from './ip';
import {
  BROADCAST_MAC,
  DEFAULT_TTL,
  MEDIUM,
  addressedPorts,
  linkCarries,
  supportsMedium,
  portAt,
  primaryPort,
  type Frame,
  type PingResult,
  type Port,
  type SimLink,
  type SimNode,
  type SimStep,
  type Topology,
} from './types';

import {
  ARP_TIMEOUT_MS,
  MAX_FRAMES,
  NODE_FORWARD_MS,
  portKey,
  type ArpEntry,
  type Attachment,
  type Counters,
  type Delivery,
  type MacEntry,
  type NodeStats,
} from './engine-types';

/**
 * The network as it actually behaves. Mutable state that lives outside React:
 * the canvas reads from it, and only the things a student changes go back into
 * React. Everything a device learns survives between pings, because that is the
 * difference between the first ping and every ping after it.
 */
export class Network {
  private readonly nodes = new Map<string, SimNode>();
  private readonly links = new Map<string, SimLink>();
  private readonly attachments = new Map<string, Attachment>();
  private readonly states = new Map<string, DeviceState>();
  private readonly counters = new Map<string, Counters>();

  private steps: SimStep[] = [];
  private sequence = 0;
  private runSource = '';
  /** Cables already reported as wired the wrong way round during this run. */
  private readonly brokenCables = new Set<string>();
  private requestSentMs: number | null = null;
  private replyArrivedMs: number | null = null;
  private gaveUpAtMs: number | null = null;
  private looped = false;

  constructor(topology: Topology) {
    this.setTopology(topology);
  }

  /**
   * Re-index against an edited topology. What devices have learned is kept: a
   * student who moves a device or plugs in another cable has not made the
   * network forget anything, and the difference between the first ping and the
   * next one is the whole point of the lesson. Anything belonging to a device
   * that is gone is dropped, because nothing can refer to it any more.
   */
  setTopology(topology: Topology): void {
    this.nodes.clear();
    this.links.clear();
    this.attachments.clear();
    for (const node of topology.nodes) this.nodes.set(node.id, node);
    for (const link of topology.links) {
      this.links.set(link.id, link);
      for (const [end, other] of [
        [link.a, link.b],
        [link.b, link.a],
      ] as const) {
        // An interface takes one cable. A topology that gives one port two
        // cables is not something a person can build with the palette, so if it
        // happens the first cable wins and the extra one is ignored, rather than
        // silently replacing what was already plugged in.
        const key = portKey(end.node, end.port);
        if (this.attachments.has(key)) continue;
        this.attachments.set(key, { link, peerId: other.node, peerPort: other.port });
      }
    }
    for (const id of [...this.states.keys()]) if (!this.nodes.has(id)) this.states.delete(id);
    for (const id of [...this.counters.keys()]) if (!this.nodes.has(id)) this.counters.delete(id);
  }

  /**
   * Send one ping and return everything that happened, measured. Repeated calls
   * are cheaper than the first, because the address lookup is remembered.
   */
  ping(srcId: string, targetIp: string): PingResult {
    const source = this.nodes.get(srcId);
    if (source === undefined) throw new Error(`no device with id ${srcId}`);
    const target = parseIpv4(targetIp);
    if (target === null) throw new Error(`${targetIp} is not an IPv4 address`);
    const port = primaryPort(source.config);
    if (port === null || port.ip === '') {
      throw new Error(`${source.label} has no interface with an address on it`);
    }
    const from = parseIpv4(port.ip);
    if (from === null) throw new Error(`${port.ip} is not an IPv4 address`);

    this.steps = [];
    this.sequence = 0;
    this.runSource = srcId;
    this.brokenCables.clear();
    this.requestSentMs = null;
    this.replyArrivedMs = null;
    this.gaveUpAtMs = null;
    this.looped = false;
    for (const state of this.states.values()) state.held.length = 0;

    const queue = new MinHeap<Delivery>();
    const request: Frame = {
      kind: 'echo-request',
      srcMac: port.mac,
      dstMac: BROADCAST_MAC,
      srcIp: port.ip,
      dstIp: targetIp,
      ttl: DEFAULT_TTL,
    };

    if (source.config.ports.some((candidate) => candidate.ip === targetIp)) {
      // Asking itself. Nothing crosses a cable, so the only cost is the device
      // looking at its own frame, and there is no hop to draw.
      this.requestSentMs = 0;
      this.replyArrivedMs = NODE_FORWARD_MS;
      return this.result(srcId, targetIp);
    }

    {
      const reachable = sameSubnet(from, target, port.prefix);
      const nextHop = reachable ? targetIp : source.config.gateway;
      if (nextHop === '' || parseIpv4(nextHop) === null) {
        this.steps.push({
          type: 'dropped',
          timeMs: 0,
          nodeId: srcId,
          reason: 'no-gateway',
          ip: targetIp,
          port: port.name,
        });
        return this.result(srcId, targetIp);
      }
      this.resolveAndSend(srcId, port.name, nextHop, request, 0, queue);
    }

    let processed = 0;
    for (;;) {
      const next = queue.pop();
      if (next === undefined) break;
      processed += 1;
      if (processed > MAX_FRAMES) {
        this.looped = true;
        this.steps.push({ type: 'looped', timeMs: next.time, frames: processed });
        break;
      }
      this.deliver(next.nodeId, next.port, next.frame, next.time, queue);
    }

    this.reportUnanswered();
    for (const state of this.states.values()) state.held.length = 0;
    return this.result(srcId, targetIp);
  }

  /** What a device knows about other addresses, in the order it learned them. */
  arpTable(nodeId: string): readonly ArpEntry[] {
    const table = this.states.get(nodeId)?.arp;
    if (table === undefined) return [];
    return [...table].map(([ip, mac]) => ({ ip, mac }));
  }

  /** A switch's table: which interface each hardware address was last seen on. */
  macTable(nodeId: string): readonly MacEntry[] {
    const table = this.states.get(nodeId)?.macTable;
    if (table === undefined) return [];
    return [...table].map(([mac, port]) => ({ mac, port }));
  }

  /** How many conversations a firewall has watched go out. */
  flowCount(nodeId: string): number {
    return this.states.get(nodeId)?.flows.size ?? 0;
  }

  statsFor(nodeId: string): NodeStats {
    const counters = this.counters.get(nodeId);
    return {
      framesSent: counters?.sent ?? 0,
      framesReceived: counters?.received ?? 0,
      framesDropped: counters?.dropped ?? 0,
    };
  }

  /** Make every device forget every address, so the next ping looks it up again. */
  forgetAddresses(): void {
    for (const state of this.states.values()) {
      state.arp.clear();
      state.macTable.clear();
      state.flows.clear();
      state.held.length = 0;
    }
  }

  /** Start over completely: every device forgets, and the frame counts go to zero. */
  reset(): void {
    this.states.clear();
    this.counters.clear();
  }

  /** The device a frame stopped at, when nothing ever answered. */
  private reportUnanswered(): void {
    if (this.replyArrivedMs !== null || this.looped) return;
    let stuck: { nodeId: string; held: HeldFrame } | null = null;
    for (const [nodeId, state] of this.states) {
      for (const held of state.held) {
        if (stuck === null || held.deadlineMs < stuck.held.deadlineMs) stuck = { nodeId, held };
      }
    }
    if (stuck === null) return;
    this.gaveUpAtMs = stuck.held.deadlineMs;
    this.steps.push({
      type: 'dropped',
      timeMs: stuck.held.deadlineMs,
      nodeId: stuck.nodeId,
      reason: 'no-arp-reply',
      ip: stuck.held.ip,
      port: stuck.held.port,
    });
  }

  private result(srcId: string, targetIp: string): PingResult {
    const { requestSentMs, replyArrivedMs } = this;
    const roundTripMs =
      requestSentMs !== null && replyArrivedMs !== null ? replyArrivedMs - requestSentMs : null;
    return {
      srcId,
      targetIp,
      steps: [...this.steps],
      requestSentMs,
      replyArrivedMs,
      roundTripMs,
      waitedMs: replyArrivedMs ?? this.gaveUpAtMs ?? 0,
    };
  }

  /**
   * Put a frame on the cable in an interface. `direct` is this device sending
   * something of its own; `repeat` is passing on somebody else's frame, which a
   * hub and a switch do and which is worth telling apart in the log.
   */
  private send(
    nodeId: string,
    portName: string,
    frame: Frame,
    departureMs: number,
    queue: MinHeap<Delivery>,
    mode: 'direct' | 'repeat',
  ): void {
    const attachment = this.attachments.get(portKey(nodeId, portName));
    if (attachment === undefined) {
      if (mode === 'direct') {
        this.steps.push({
          type: 'dropped',
          timeMs: departureMs,
          nodeId,
          reason: 'no-cable',
          ip: frame.dstIp,
          port: portName,
        });
      }
      return;
    }

    const self = this.nodes.get(nodeId);
    const peer = this.nodes.get(attachment.peerId);
    if (self === undefined || peer === undefined) return;
    if (!linkCarries(attachment.link, self, peer)) {
      // The cable cannot carry this data: either it does not fit one of the
      // ports, or it is wired the wrong way round. Said once per cable per run,
      // because a switch repeating a broadcast onto a dead cable would
      // otherwise repeat the message along with it.
      if (!this.brokenCables.has(attachment.link.id)) {
        this.brokenCables.add(attachment.link.id);
        const fits = supportsMedium(self.kind, attachment.link.medium) &&
          supportsMedium(peer.kind, attachment.link.medium);
        this.steps.push({
          type: 'dropped',
          timeMs: departureMs,
          nodeId,
          reason: fits ? 'wrong-wiring' : 'wrong-medium',
          ip: frame.dstIp,
          port: portName,
        });
      }
      return;
    }

    this.countersFor(nodeId).sent += 1;
    if (frame.kind === 'echo-request' && nodeId === this.runSource && this.requestSentMs === null) {
      this.requestSentMs = departureMs;
    }
    const travelMs = MEDIUM[attachment.link.medium].oneWayMs;
    this.steps.push({
      type: 'hop',
      timeMs: departureMs,
      from: nodeId,
      to: attachment.peerId,
      linkId: attachment.link.id,
      port: portName,
      frame: frame.kind,
      dstIp: frame.dstIp,
      srcIp: frame.srcIp,
      repeated: mode === 'repeat',
      travelMs,
      medium: attachment.link.medium,
    });
    queue.push({
      time: departureMs + travelMs,
      seq: this.sequence++,
      nodeId: attachment.peerId,
      port: attachment.peerPort,
      frame,
    });
  }

  private deliver(
    nodeId: string,
    portName: string,
    frame: Frame,
    timeMs: number,
    queue: MinHeap<Delivery>,
  ): void {
    const node = this.nodes.get(nodeId);
    const port = node === undefined ? null : portAt(node.config, portName);
    if (node === undefined || port === null) return;
    this.countersFor(nodeId).received += 1;

    const state = this.stateFor(nodeId);
    const addressed = frame.dstMac === BROADCAST_MAC || frame.dstMac === port.mac;
    if (
      addressed &&
      frame.kind === 'echo-reply' &&
      nodeId === this.runSource &&
      frame.dstIp === port.ip
    ) {
      // The measurement the whole exercise exists for. It is taken here, where
      // the frame actually lands, and not in any behaviour: a device's job is
      // not to know that somebody is timing it.
      this.replyArrivedMs = timeMs;
    }

    const ctx: BehaviourContext = {
      node,
      config: node.config,
      port,
      frame,
      timeMs,
      state,
      addresses: addressedPorts(node.config),
      ownsAddress: (ip) => node.config.ports.some((candidate) => candidate.ip === ip),
      send: (name, outgoing) =>
        this.send(nodeId, name, outgoing, timeMs + NODE_FORWARD_MS, queue, 'direct'),
      repeat: (outgoing) => {
        for (const candidate of node.config.ports) {
          if (candidate.name === portName) continue;
          if (!this.attachments.has(portKey(nodeId, candidate.name))) continue;
          this.send(nodeId, candidate.name, outgoing, timeMs + NODE_FORWARD_MS, queue, 'repeat');
        }
      },
      note: (step) => this.steps.push(step),
      resolveAndSend: (name, ip, outgoing) =>
        this.resolveAndSend(nodeId, name, ip, outgoing, timeMs + NODE_FORWARD_MS, queue),
      portForNetwork: (ip, exceptPort) => this.portForNetwork(node.config, ip, exceptPort),
      learnMac: (mac, name) => this.learnMac(nodeId, mac, name, timeMs),
      releaseHeld: (ip, mac) =>
        this.releaseHeld(nodeId, ip, mac, timeMs + NODE_FORWARD_MS, queue),
    };

    BEHAVIOURS[node.kind](ctx);
  }

  /**
   * Rewrite a frame for an address and send it. If this device does not know
   * which interface owns that address yet, the frame waits here while it asks,
   * because a frame cannot go anywhere without a hardware address on it.
   */
  private resolveAndSend(
    nodeId: string,
    portName: string,
    ip: string,
    frame: Frame,
    departureMs: number,
    queue: MinHeap<Delivery>,
  ): void {
    const node = this.nodes.get(nodeId);
    const port = node === undefined ? null : portAt(node.config, portName);
    if (node === undefined || port === null || port.ip === '') return;

    const state = this.stateFor(nodeId);
    const known = state.arp.get(ip);
    if (known !== undefined) {
      this.send(nodeId, portName, { ...frame, dstMac: known }, departureMs, queue, 'direct');
      return;
    }
    state.held.push({ ip, port: portName, frame, deadlineMs: departureMs + ARP_TIMEOUT_MS });
    this.send(nodeId, portName, arpRequest(port, ip), departureMs, queue, 'direct');
  }

  private releaseHeld(
    nodeId: string,
    ip: string,
    mac: string,
    departureMs: number,
    queue: MinHeap<Delivery>,
  ): void {
    const state = this.stateFor(nodeId);
    const released = state.held.filter((held) => held.ip === ip);
    if (released.length === 0) return;
    state.held.splice(
      0,
      state.held.length,
      ...state.held.filter((held) => held.ip !== ip),
    );
    for (const held of released) {
      this.send(nodeId, held.port, { ...held.frame, dstMac: mac }, departureMs, queue, 'direct');
    }
  }

  private learnMac(nodeId: string, mac: string, portName: string, timeMs: number): void {
    if (mac === BROADCAST_MAC) return;
    const state = this.stateFor(nodeId);
    if (state.macTable.get(mac) === portName) return;
    state.macTable.set(mac, portName);
    this.steps.push({ type: 'mac-cache', timeMs, nodeId, mac, port: portName });
  }

  /** The interface whose address sits in the same network as `ip`, if any. */
  private portForNetwork(config: SimNode['config'], ip: string, exceptPort?: string): Port | null {
    const address = parseIpv4(ip);
    if (address === null) return null;
    for (const port of config.ports) {
      if (port.ip === '' || port.name === exceptPort) continue;
      const local = parseIpv4(port.ip);
      if (local !== null && sameSubnet(local, address, port.prefix)) return port;
    }
    return null;
  }

  private stateFor(nodeId: string): DeviceState {
    let state = this.states.get(nodeId);
    if (state === undefined) {
      state = { arp: new Map(), macTable: new Map(), flows: new Set(), held: [] };
      this.states.set(nodeId, state);
    }
    return state;
  }

  private countersFor(nodeId: string): Counters {
    let counters = this.counters.get(nodeId);
    if (counters === undefined) {
      counters = { sent: 0, received: 0, dropped: 0 };
      this.counters.set(nodeId, counters);
    }
    return counters;
  }
}
