import { describe, expect, it } from 'vitest';
import { correct } from './diagnose';
import { Network } from './engine';
import { SUBNET_SPLIT, TWO_PCS } from './presets';
import type { LinkEnd, NodeKind, SimLink, SimNode, Topology } from './types';

/*
 * The correction is the teaching step, so it is tested like the simulation is:
 * given a board and a run, it must name the one thing that stopped the packet,
 * in that board's own numbers, and point at the right reading.
 */

function macOf(seed: string): string {
  let value = 7;
  for (const character of seed) value = (value * 31 + character.charCodeAt(0)) % 0xffff;
  return `02:00:00:00:${((value >> 8) & 0xff).toString(16).padStart(2, '0')}:${(value & 0xff)
    .toString(16)
    .padStart(2, '0')}`;
}

interface Options {
  readonly gateway?: string;
  readonly outerPort?: string;
  readonly barePorts?: number;
  readonly autoMdix?: boolean;
}

function device(
  id: string,
  kind: NodeKind,
  addresses: readonly (readonly [string, number])[],
  options: Options = {},
): SimNode {
  const count = Math.max(addresses.length, options.barePorts ?? 0);
  return {
    id,
    kind,
    label: id.toUpperCase(),
    x: 0,
    y: 0,
    config: {
      ports: Array.from({ length: count }, (_, index) => ({
        name: `eth${index}`,
        ip: addresses[index]?.[0] ?? '',
        prefix: addresses[index]?.[1] ?? 24,
        mac: macOf(`${id}:${index}`),
      })),
      gateway: options.gateway ?? '',
      outerPort: options.outerPort ?? '',
      autoMdix: options.autoMdix ?? true,
    },
  };
}

function pc(id: string, ip: string, prefix = 24, options: Options = {}): SimNode {
  return device(id, 'pc', [[ip, prefix]], options);
}

function end(node: string, port = 'eth0'): LinkEnd {
  return { node, port };
}

function wire(
  id: string,
  a: LinkEnd,
  b: LinkEnd,
  medium: SimLink['medium'] = 'utp',
  wiring: SimLink['wiring'] = 'straight',
): SimLink {
  return { id, a, b, medium, wiring };
}

describe('what a reader is told when the ping does not arrive', () => {
  it('names the mask when the two addresses are in different networks', () => {
    const net = new Network(SUBNET_SPLIT.topology);
    const correction = correct(net.ping('pc1', '192.168.1.2'), SUBNET_SPLIT.topology);
    expect(correction?.topic).toBe('subnet-mask');
    // The reader's own numbers, not a general explanation.
    expect(correction?.detail).toContain('192.168.1.130/25');
    expect(correction?.detail).toContain('192.168.1.128/25');
    expect(correction?.fix).toMatch(/widen the mask/i);
  });

  it('says nothing at all when the ping arrives', () => {
    const net = new Network(TWO_PCS.topology);
    expect(correct(net.ping('pc1', '192.168.1.2'), TWO_PCS.topology)).toBeNull();
  });

  it('points at the wiring rule when a cable passes nothing', () => {
    const topology: Topology = {
      nodes: [pc('pc1', '192.168.1.1', 24, { autoMdix: false }), pc('pc2', '192.168.1.2', 24, { autoMdix: false })],
      links: [wire('l1', end('pc1'), end('pc2'), 'utp', 'straight')],
    };
    const correction = correct(new Network(topology).ping('pc1', '192.168.1.2'), topology);
    expect(correction?.topic).toBe('auto-mdix');
    expect(correction?.headline).toMatch(/nothing crosses this cable/i);
  });

  it('names the missing socket when the cable does not fit', () => {
    const topology: Topology = {
      nodes: [pc('pc1', '192.168.1.1'), pc('pc2', '192.168.1.2')],
      links: [wire('l1', end('pc1'), end('pc2'), 'serial')],
    };
    const correction = correct(new Network(topology).ping('pc1', '192.168.1.2'), topology);
    expect(correction?.topic).toBe('port');
    expect(correction?.headline).toMatch(/does not fit/i);
  });

  it('names the direction the conversation started in when a firewall refuses', () => {
    const topology: Topology = {
      nodes: [
        pc('inside', '192.168.1.10', 24, { gateway: '192.168.1.254' }),
        device('fw', 'firewall', [
          ['192.168.1.254', 24],
          ['203.0.113.1', 24],
        ], { gateway: '203.0.113.2', outerPort: 'eth1' }),
        pc('outside', '203.0.113.5', 24, { gateway: '203.0.113.1' }),
      ],
      links: [
        wire('l1', end('inside'), end('fw', 'eth0')),
        wire('l2', end('fw', 'eth1'), end('outside')),
      ],
    };
    const correction = correct(new Network(topology).ping('outside', '192.168.1.10'), topology);
    expect(correction?.topic).toBe('firewall-state');
    expect(correction?.fix).toMatch(/from the inside/i);
  });

  it('names the hop count when two routers hand a packet back and forth', () => {
    const topology: Topology = {
      nodes: [
        pc('pc1', '192.168.1.10', 24, { gateway: '192.168.1.1' }),
        device('r1', 'router', [
          ['192.168.1.1', 24],
          ['10.9.9.1', 24],
        ], { gateway: '10.9.9.2' }),
        device('r2', 'router', [['10.9.9.2', 24]], { gateway: '10.9.9.1' }),
      ],
      links: [wire('l1', end('pc1'), end('r1', 'eth0')), wire('l2', end('r1', 'eth1'), end('r2', 'eth0'))],
    };
    const correction = correct(new Network(topology).ping('pc1', '8.8.8.8'), topology);
    expect(correction?.headline).toMatch(/hop count ran out/i);
    expect(correction?.topic).toBe('gateway');
  });

  it('names the wiring when a loop keeps a broadcast going for ever', () => {
    // Two hubs cabled to each other. A hop count cannot stop this, because
    // nothing at layer two is counting, so the run runs out of frame budget.
    const topology: Topology = {
      nodes: [
        pc('pc1', '192.168.1.1'),
        device('h1', 'hub', [], { barePorts: 3 }),
        device('h2', 'hub', [], { barePorts: 2 }),
      ],
      links: [
        wire('l1', end('pc1'), end('h1', 'eth0')),
        wire('l2', end('h1', 'eth1'), end('h2', 'eth0')),
        wire('l3', end('h2', 'eth1'), end('h1', 'eth2')),
      ],
    };
    const correction = correct(new Network(topology).ping('pc1', '192.168.1.9'), topology);
    expect(correction?.headline).toMatch(/never stops going round/i);
    expect(correction?.fix).toMatch(/break the loop/i);
  });

  it('names the unanswered question when nobody owns the address', () => {
    const net = new Network(TWO_PCS.topology);
    const correction = correct(net.ping('pc1', '192.168.1.9'), TWO_PCS.topology);
    expect(correction?.topic).toBe('arp');
    expect(correction?.headline).toContain('192.168.1.9');
  });

  it('ignores the drops a shared cable makes when they are not the cause', () => {
    // A hub hands PC3 a reply that is not for it, which is a drop, and the ping
    // still works. A reader must not be told that was the problem.
    const topology: Topology = {
      nodes: [
        pc('pc1', '192.168.1.1'),
        device('hub', 'hub', [], { barePorts: 3 }),
        pc('pc2', '192.168.1.2'),
        pc('pc3', '192.168.1.3'),
      ],
      links: [
        wire('l1', end('pc1'), end('hub', 'eth0')),
        wire('l2', end('hub', 'eth1'), end('pc2')),
        wire('l3', end('hub', 'eth2'), end('pc3')),
      ],
    };
    const net = new Network(topology);
    net.ping('pc1', '192.168.1.2');
    const result = net.ping('pc1', '192.168.1.2');
    expect(result.steps.some((step) => step.type === 'dropped')).toBe(true);
    expect(result.roundTripMs).not.toBeNull();
    expect(correct(result, topology)).toBeNull();
  });
});
