import type { BehaviourContext } from './behaviour';
import { BROADCAST_MAC, DEFAULT_TTL, type DropReason, type Frame, type Port } from './types';

/**
 * Small pieces every behaviour is built from. They are here rather than in each
 * behaviour so that answering an ARP request means the same thing on a PC, a
 * router, a firewall and the cloud.
 */

/** Whether an interface should open this frame at all. */
export function isAddressedTo(frame: Frame, port: Port): boolean {
  return frame.dstMac === BROADCAST_MAC || frame.dstMac === port.mac;
}

/** An answer to "who owns this address?", sent straight back to the asker. */
export function arpReply(port: Port, claimIp: string, asking: Frame): Frame {
  return {
    kind: 'arp-reply',
    srcMac: port.mac,
    dstMac: asking.srcMac,
    // The interface claims the address that was asked about. For the internet
    // cloud that is any address at all, which is what makes it the way out.
    srcIp: claimIp,
    dstIp: asking.srcIp,
    ttl: DEFAULT_TTL,
  };
}

/** The question. It goes to every device on the cable at once. */
export function arpRequest(port: Port, forIp: string): Frame {
  return {
    kind: 'arp-request',
    srcMac: port.mac,
    dstMac: BROADCAST_MAC,
    srcIp: port.ip,
    dstIp: forIp,
    ttl: DEFAULT_TTL,
  };
}

export function echoReply(port: Port, asking: Frame): Frame {
  return {
    kind: 'echo-reply',
    srcMac: port.mac,
    dstMac: asking.srcMac,
    srcIp: port.ip,
    dstIp: asking.srcIp,
    ttl: DEFAULT_TTL,
  };
}

/**
 * Remember an address. Only an address that is new or has moved is worth a line
 * in the log: repeating the same entry every frame would bury everything else.
 */
export function learn(ctx: BehaviourContext, ip: string, mac: string, from: 'request' | 'reply'): void {
  if (ctx.state.arp.get(ip) === mac) return;
  ctx.state.arp.set(ip, mac);
  ctx.note({
    type: 'arp-cache',
    timeMs: ctx.timeMs,
    nodeId: ctx.node.id,
    ip,
    mac,
    learnedFrom: from,
  });
}

/** A frame that arrived and went no further, recorded with where it stopped. */
export function noteDropped(
  ctx: BehaviourContext,
  reason: DropReason,
  ip: string,
  portName?: string,
): void {
  ctx.note({
    type: 'dropped',
    timeMs: ctx.timeMs,
    nodeId: ctx.node.id,
    reason,
    ip,
    ...(portName === undefined ? {} : { port: portName }),
  });
}
