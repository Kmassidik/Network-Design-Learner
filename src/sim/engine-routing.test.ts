/*
 * Where a ping has to be routed: across two networks, past a firewall, through
 * a mask, and over cables that are not copper.
 */

import { describe, expect, it } from 'vitest';
import { Network } from './engine';
import { device, end, host, summarise, wire } from './engine-harness';
import type { Medium, Topology, Wiring } from './types';


describe('a router between two networks', () => {
  /** PC1 on one network, PC2 on another, and a router holding an interface on each. */
  function twoNetworks(): Topology {
    return {
      nodes: [
        host('pc1', '192.168.1.10', 24, '192.168.1.254'),
        device('r1', 'router', 'R1', [
          ['192.168.1.254', 24],
          ['192.168.2.254', 24],
        ]),
        host('pc2', '192.168.2.10', 24, '192.168.2.254'),
      ],
      links: [wire('l1', end('pc1'), end('r1', 'eth0')), wire('l2', end('r1', 'eth1'), end('pc2'))],
    };
  }

  it('carries the ping across the boundary and back', () => {
    const net = new Network(twoNetworks());
    const result = net.ping('pc1', '192.168.2.10');
    expect(result.roundTripMs).not.toBeNull();
    const steps = result.steps.map(summarise);
    expect(steps).toContain('hop:echo-request:r1.eth1->pc2');
    expect(steps).toContain('hop:echo-reply:r1.eth0->pc1');
  });

  it('is quicker the second time, because the router has looked the way up', () => {
    const net = new Network(twoNetworks());
    const first = net.ping('pc1', '192.168.2.10');
    const second = net.ping('pc1', '192.168.2.10');
    expect(second.steps.length).toBeLessThan(first.steps.length);
    // The first run pays for the router asking who owns PC2, and that happens
    // after the request has already left, so it lands inside the measurement.
    expect((first.roundTripMs ?? 0) - (second.roundTripMs ?? 0)).toBeCloseTo(1.2, 6);
  });

  it('throws a frame away when two routers point at each other', () => {
    const net = new Network({
      nodes: [
        host('pc1', '192.168.1.10', 24, '192.168.1.1'),
        device(
          'r1',
          'router',
          'R1',
          [
            ['192.168.1.1', 24],
            ['10.9.9.1', 24],
          ],
          { gateway: '10.9.9.2' },
        ),
        device('r2', 'router', 'R2', [['10.9.9.2', 24]], { gateway: '10.9.9.1' }),
      ],
      links: [wire('l1', end('pc1'), end('r1', 'eth0')), wire('l2', end('r1', 'eth1'), end('r2', 'eth0'))],
    });
    const result = net.ping('pc1', '8.8.8.8');
    const expired = result.steps
      .map(summarise)
      .filter((line) => line.endsWith(':ttl-expired'));
    // Whichever of the two the count reaches zero at, it happens exactly once.
    expect(expired).toHaveLength(1);
    expect(result.roundTripMs).toBeNull();
  });

  it('stops a broadcast at the boundary, because ARP does not cross one', () => {
    const net = new Network(twoNetworks());
    const steps = net.ping('pc1', '192.168.2.10').steps.map(summarise);
    // The router asks for PC2 on its own other interface; the first ARP never
    // reaches past it.
    expect(steps).toContain('hop:arp-request:r1.eth1->pc2');
    expect(steps.filter((line) => line.startsWith('hop:arp-request:pc1')).length).toBe(1);
  });
});

describe('a firewall between an inside and an outside', () => {
  /**
   * PC1 inside, a firewall, and behind its outer interface a hub carrying both
   * another computer and the internet cloud. A hub is the simplest honest way
   * to put two devices on one interface.
   */
  function networkWithFirewall(): Topology {
    return {
      nodes: [
        host('pc1', '192.168.1.10', 24, '192.168.1.254'),
        device(
          'fw',
          'firewall',
          'FW',
          [
            ['192.168.1.254', 24],
            ['203.0.113.1', 24],
          ],
          { gateway: '203.0.113.2', outerPort: 'eth1' },
        ),
        device('hub', 'hub', 'HUB', [], { barePorts: 3 }),
        host('outside', '203.0.113.5', 24, '203.0.113.1'),
        device('net', 'cloud', 'Internet', [['203.0.113.2', 24]]),
      ],
      links: [
        wire('l1', end('pc1'), end('fw', 'eth0')),
        wire('l2', end('fw', 'eth1'), end('hub', 'eth0')),
        wire('l3', end('hub', 'eth1'), end('outside')),
        wire('l4', end('hub', 'eth2'), end('net')),
      ],
    };
  }

  it('lets a conversation started inside be answered', () => {
    const net = new Network(networkWithFirewall());
    const result = net.ping('pc1', '203.0.113.5');
    expect(result.roundTripMs).not.toBeNull();
    expect(net.flowCount('fw')).toBeGreaterThan(0);
  });

  it('refuses the same ping when it starts outside', () => {
    const net = new Network(networkWithFirewall());
    const result = net.ping('outside', '192.168.1.10');
    expect(result.steps.map(summarise)).toContain('drop:fw:blocked');
    expect(result.roundTripMs).toBeNull();
  });

  it('refuses the answer to a conversation it never saw', () => {
    const net = new Network(networkWithFirewall());
    net.ping('outside', '192.168.1.10');
    expect(net.flowCount('fw')).toBe(0);
  });

  it('reaches the internet cloud, which answers for an address that is not here', () => {
    const net = new Network(networkWithFirewall());
    const result = net.ping('pc1', '8.8.8.8');
    expect(result.steps.map(summarise)).toContain('answered:net:8.8.8.8');
    expect(result.roundTripMs).not.toBeNull();
  });
});

describe('the cable has to fit, and be wired the right way round', () => {
  /** Two computers and one cable between them, with whatever is being tested. */
  function twoPcs(wiring: Wiring, autoMdix: boolean, medium: Medium = 'utp'): Topology {
    return {
      nodes: [
        host('pc1', '192.168.1.1', 24, '', autoMdix),
        host('pc2', '192.168.1.2', 24, '', autoMdix),
      ],
      links: [wire('l1', end('pc1'), end('pc2'), medium, wiring)],
    };
  }

  it('needs a crossover between two computers', () => {
    const net = new Network(twoPcs('straight', false));
    const result = net.ping('pc1', '192.168.1.2');
    expect(result.steps.map(summarise)).toContain('drop:pc1:wrong-wiring');
    expect(result.roundTripMs).toBeNull();
  });

  it('works when the cable is the one it needs', () => {
    const net = new Network(twoPcs('crossover', false));
    const result = net.ping('pc1', '192.168.1.2');
    expect(result.roundTripMs).toBeCloseTo(1.1, 6);
  });

  it('works either way once a port works it out for itself', () => {
    const net = new Network(twoPcs('straight', true));
    expect(net.ping('pc1', '192.168.1.2').roundTripMs).toBeCloseTo(1.1, 6);
  });

  it('needs a straight through cable between a computer and a switch', () => {
    const crossed: Topology = {
      nodes: [
        host('pc1', '192.168.1.1', 24, '', false),
        device('sw1', 'switch', 'SW1', [], { barePorts: 1, autoMdix: false }),
      ],
      links: [wire('l1', end('pc1'), end('sw1', 'eth0'), 'utp', 'crossover')],
    };
    expect(new Network(crossed).ping('pc1', '192.168.1.9').steps.map(summarise)).toContain(
      'drop:pc1:wrong-wiring',
    );
  });

  it('refuses a cable one of the two devices has no socket for', () => {
    const net = new Network(twoPcs('straight', false, 'serial'));
    const result = net.ping('pc1', '192.168.1.2');
    expect(result.steps.map(summarise)).toContain('drop:pc1:wrong-medium');
    expect(result.roundTripMs).toBeNull();
  });

  it('reports a dead cable once, not once per repeated frame', () => {
    const net = new Network(twoPcs('straight', false));
    const dead = net
      .ping('pc1', '192.168.1.2')
      .steps.filter((step) => step.type === 'dropped' && step.reason === 'wrong-wiring');
    expect(dead).toHaveLength(1);
  });
});

describe('the mask decides who is a neighbour, not the address', () => {
  /** Two computers on one cable with far apart addresses and a given mask. */
  function pair(prefix: number): Network {
    return new Network({
      nodes: [host('pc1', '192.168.11.1', prefix), host('pc2', '192.168.1.2', prefix)],
      links: [wire('l1', end('pc1'), end('pc2'))],
    });
  }

  it('treats them as neighbours when the mask is wide enough to cover both', () => {
    // 192.168.11.1/11 and 192.168.1.2/11 are both in 192.160.0.0/11, so PC1
    // asks for the card directly and the ping never needs a router.
    expect(pair(11).ping('pc1', '192.168.1.2').roundTripMs).toBeCloseTo(1.1, 6);
  });

  it('stops at the sender when the mask does not cover both', () => {
    // The same addresses with an ordinary /24 are in different networks, and
    // with no gateway set the packet has nowhere to go.
    expect(pair(24).ping('pc1', '192.168.1.2').steps.map(summarise)).toEqual([
      'drop:pc1:no-gateway',
    ]);
  });
});

describe('cables that are not copper', () => {
  /** Two computers on one cable of a given medium, both able to take it. */
  function oneCable(medium: Medium): Network {
    return new Network({
      nodes: [host('pc1', '192.168.1.1'), host('pc2', '192.168.1.2')],
      links: [wire('l1', end('pc1'), end('pc2'), medium, 'straight')],
    });
  }

  it('makes a ping slower when the cable is slower', () => {
    // 0.5 ms each way over copper against 3 ms each way over radio, measured.
    expect(oneCable('utp').ping('pc1', '192.168.1.2').roundTripMs).toBeCloseTo(1.1, 6);
    expect(oneCable('wireless').ping('pc1', '192.168.1.2').roundTripMs).toBeCloseTo(6.1, 6);
  });
});
