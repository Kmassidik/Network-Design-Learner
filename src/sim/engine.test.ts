/*
 * A ping, end to end, on the small boards: one cable, one that cannot arrive,
 * a hub, a switch. Where a ping has to be routed is in engine-routing.test.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Network } from './engine';
import { TWO_PCS, THROUGH_A_SWITCH } from './presets';
import { ARP_TIMEOUT_MS } from './engine-types';
import { device, end, host, macOf, summarise, wire } from './engine-harness';
import type { NodeKind, SimStep, Topology } from './types';

describe('a ping between two PCs on one cable', () => {
  let net: Network;

  beforeEach(() => {
    net = new Network(TWO_PCS.topology);
  });

  it('asks who owns the address before it can send anything', () => {
    expect(net.ping('pc1', '192.168.1.2').steps.map(summarise)).toEqual([
      'hop:arp-request:pc1.eth0->pc2',
      'arp:pc2:192.168.1.1',
      'hop:arp-reply:pc2.eth0->pc1',
      'arp:pc1:192.168.1.2',
      'hop:echo-request:pc1.eth0->pc2',
      'hop:echo-reply:pc2.eth0->pc1',
    ]);
  });

  it('measures the round trip, and separately what the lookup cost', () => {
    const result = net.ping('pc1', '192.168.1.2');
    // 0.5 ms out, 0.1 ms to turn it around, 0.5 ms back.
    expect(result.requestSentMs).toBeCloseTo(1.2, 6);
    expect(result.replyArrivedMs).toBeCloseTo(2.3, 6);
    expect(result.roundTripMs).toBeCloseTo(1.1, 6);
    // The extra 1.2 ms is the lookup, and only the first ping pays it.
    expect(result.waitedMs).toBeCloseTo(2.3, 6);
  });

  it('leaves the lookup out of the second ping', () => {
    net.ping('pc1', '192.168.1.2');
    const second = net.ping('pc1', '192.168.1.2');
    expect(second.steps.map(summarise)).toEqual([
      'hop:echo-request:pc1.eth0->pc2',
      'hop:echo-reply:pc2.eth0->pc1',
    ]);
    expect(second.waitedMs).toBeCloseTo(1.1, 6);
  });

  it('looks the address up again after everything forgets', () => {
    net.ping('pc1', '192.168.1.2');
    net.forgetAddresses();
    expect(net.arpTable('pc1')).toEqual([]);
    const third = net.ping('pc1', '192.168.1.2');
    expect(summarise(third.steps[0] as SimStep)).toBe('hop:arp-request:pc1.eth0->pc2');
    expect(third.waitedMs).toBeCloseTo(2.3, 6);
  });

  it('answers straight away when the address is its own', () => {
    const result = net.ping('pc1', '192.168.1.1');
    expect(result.roundTripMs).toBeCloseTo(0.1, 6);
    // Nothing crossed a cable, so there is nothing to draw.
    expect(result.steps.map(summarise)).toEqual([]);
  });

  it('gives the same answer every time it is run', () => {
    const first = new Network(TWO_PCS.topology).ping('pc1', '192.168.1.2');
    const again = new Network(TWO_PCS.topology).ping('pc1', '192.168.1.2');
    expect(again.steps.map(summarise)).toEqual(first.steps.map(summarise));
  });

  it('keeps what it learned when a device is moved', () => {
    net.ping('pc1', '192.168.1.2');
    net.setTopology({
      ...TWO_PCS.topology,
      nodes: TWO_PCS.topology.nodes.map((node) =>
        node.id === 'pc2' ? { ...node, x: node.x + 40 } : node,
      ),
    });
    expect(net.arpTable('pc1')).toHaveLength(1);
  });

  it('counts the frames each device handled', () => {
    net.ping('pc1', '192.168.1.2');
    expect(net.statsFor('pc1')).toEqual({ framesSent: 2, framesReceived: 2, framesDropped: 0 });
    expect(net.statsFor('pc2')).toEqual({ framesSent: 2, framesReceived: 2, framesDropped: 0 });
  });
});

describe('a ping that cannot arrive', () => {
  it('stops at the sender when there is no gateway', () => {
    const net = new Network({
      nodes: [host('pc1', '192.168.1.1'), host('pc2', '192.168.2.2')],
      links: [wire('l1', end('pc1'), end('pc2'))],
    });
    const result = net.ping('pc1', '192.168.2.2');
    expect(result.steps.map(summarise)).toEqual(['drop:pc1:no-gateway']);
    expect(result.roundTripMs).toBeNull();
    expect(result.waitedMs).toBe(0);
  });

  it('gives up when nobody owns the address', () => {
    const net = new Network(TWO_PCS.topology);
    const result = net.ping('pc1', '192.168.1.9');
    expect(result.steps.map(summarise)).toEqual([
      'hop:arp-request:pc1.eth0->pc2',
      'arp:pc2:192.168.1.1',
      'drop:pc1:no-arp-reply',
    ]);
    expect(result.roundTripMs).toBeNull();
    expect(result.waitedMs).toBe(ARP_TIMEOUT_MS);
  });

  it('refuses an address it cannot read', () => {
    const net = new Network(TWO_PCS.topology);
    expect(() => net.ping('pc1', '192.168.1')).toThrow(/not an IPv4 address/);
    expect(() => net.ping('nobody', '192.168.1.2')).toThrow(/no device/);
    expect(() => net.ping('sw1', '192.168.1.2')).toThrow(/no device|no interface/);
  });
});

/** Three PCs and one device in the middle, which decides what everybody else sees. */
function threePcsAround(middle: NodeKind): Topology {
  return {
    nodes: [
      host('pc1', '192.168.1.1'),
      device('mid', middle, 'MID', [], { barePorts: 3 }),
      host('pc2', '192.168.1.2'),
      host('pc3', '192.168.1.3'),
    ],
    links: [
      wire('l1', end('pc1'), end('mid', 'eth0')),
      wire('l2', end('mid', 'eth1'), end('pc2')),
      wire('l3', end('mid', 'eth2'), end('pc3')),
    ],
  };
}

describe('a hub against a switch', () => {
  it('sends one computer another computer\u2019s frames when it is a hub', () => {
    const net = new Network(threePcsAround('hub'));
    net.ping('pc1', '192.168.1.2');
    // The hub repeats everything, so PC3 is handed a reply that is not for it.
    expect(net.ping('pc1', '192.168.1.2').steps.map(summarise)).toContain('drop:pc3:not-my-mac');
  });

  it('keeps one computer out of another computer\u2019s conversation when it is a switch', () => {
    const net = new Network(threePcsAround('switch'));
    net.ping('pc1', '192.168.1.2');
    const second = net.ping('pc1', '192.168.1.2');
    // The switch knows where PC1 and PC2 are, so the reply goes out of one port.
    expect(second.steps.map(summarise)).not.toContain('drop:pc3:not-my-mac');
    // PC3 still heard the broadcast on the first run, which is how it learned PC1.
    expect(net.arpTable('pc3').map((entry) => entry.ip)).toEqual(['192.168.1.1']);
  });

  it('learns which interface each address is on, and only says so once', () => {
    const net = new Network(threePcsAround('switch'));
    const learned = net
      .ping('pc1', '192.168.1.2')
      .steps.filter((step) => step.type === 'mac-cache')
      .map(summarise);
    expect(learned).toContain(`mac:mid:${macOf('pc1:0')}@eth0`);
    expect(learned).toContain(`mac:mid:${macOf('pc2:0')}@eth1`);
    expect(new Set(learned).size).toBe(learned.length);
  });
});

describe('a switch between two PCs', () => {
  it('measures a longer round trip than a single cable, because every hop is a hop', () => {
    const net = new Network(THROUGH_A_SWITCH.topology);
    const result = net.ping('pc1', '192.168.1.2');
    // Four cables of 0.5 ms, plus the switch twice and PC2 once at 0.1 ms each.
    expect(result.roundTripMs).toBeCloseTo(2.3, 6);
    // The first run also pays for two lookups, one at each end of the board.
    expect(result.waitedMs).toBeCloseTo(4.7, 6);
  });

  it('sends the first frame out of every port it can reach', () => {
    const net = new Network(THROUGH_A_SWITCH.topology);
    const first = net.ping('pc1', '192.168.1.2').steps.map(summarise);
    expect(first).toContain('hop:arp-request:sw1.eth1->pc2');
  });
});
