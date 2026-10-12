import { defaultConfig, portsFor } from './kinds';
import type { NodeConfig, NodeKind, SimNode, Topology } from './types';

/**
 * A starting layout and the lesson that goes with it. Templates are code, so a
 * template's geometry, its addresses and the text that explains them cannot
 * drift apart.
 */
export interface Preset {
  readonly id: string;
  readonly name: string;
  /** One sentence: what the student is looking at. */
  readonly summary: string;
  /** What to do first, and what to watch while doing it. */
  readonly task: string;
  /** The failure to cause, in terms of what to change and what happens next. */
  readonly failure: string;
  readonly topology: Topology;
  /** Device the ping scenario starts from. */
  readonly pingFrom: string;
  /** Device the ping scenario aims at. */
  readonly pingTo: string;
}

/**
 * A device built from the catalogue's own defaults, so a template cannot invent
 * a port list that disagrees with what the palette would hand out.
 */
function device(
  id: string,
  kind: NodeKind,
  label: string,
  x: number,
  y: number,
  serial: number,
  overrides: Partial<NodeConfig> = {},
): SimNode {
  return {
    id,
    kind,
    label,
    x,
    y,
    config: { ...defaultConfig(kind, serial), ...overrides },
  };
}

function cable(
  id: string,
  a: [string, string],
  b: [string, string],
  wiring: Topology['links'][number]['wiring'],
) {
  return { id, a: { node: a[0], port: a[1] }, b: { node: b[0], port: b[1] }, medium: 'utp' as const, wiring };
}

/**
 * Two computers and one cable, nothing in between. Every frame one sends is
 * seen by the other, which is exactly what makes the very first ping take two
 * frames of setup before any ping leaves the machine.
 */
export const TWO_PCS: Preset = {
  id: 'two-pcs',
  name: 'Two PCs on one cable',
  summary:
    'Two computers wired straight to each other on the same network. Nothing sits between them, so anything one sends arrives at the other.',
  task: 'Send a ping from PC1 to PC2. The first reply takes two frames of setup: before PC1 can send a ping it has to find out which interface owns PC2\u2019s address.',
  failure:
    'Change PC1\u2019s address to 192.168.2.1 and ping again. The ping never leaves PC1, because PC2 is now on a different network and PC1 has no gateway to reach it through. Then select the cable and change it from a crossover to a straight through one: nothing crosses it at all, because both computers transmit on the same pair.',
  topology: {
    nodes: [device('pc1', 'pc', 'PC1', 320, 260, 0), device('pc2', 'pc', 'PC2', 760, 260, 1)],
    // Two computers transmit on the same pair, so they need a crossover cable.
    links: [cable('l1', ['pc1', 'eth0'], ['pc2', 'eth0'], 'crossover')],
  },
  pingFrom: 'pc1',
  pingTo: 'pc2',
};

/**
 * The same two computers with a switch between them. The switch starts out
 * knowing nothing, so the first frame it sees it sends to everybody, and it
 * only stops doing that once it has learnt where the answer came from.
 */
export const THROUGH_A_SWITCH: Preset = {
  id: 'through-a-switch',
  name: 'Two PCs through a switch',
  summary:
    'Two computers on the same network, joined by a switch. The switch has to learn which computer is on which port before it can stop sending frames to everyone.',
  task: 'Send a ping from PC1 to PC2 and watch the switch. The first frame is repeated out of every port it can reach, and every frame after that goes out of one port only.',
  failure:
    'Send the ping twice. On the second run the switch already knows both computers, so nothing is flooded. Then give PC2 an address on another network and ping again: the switch cannot join two networks, so the ping stops at PC1.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 260, 260, 0),
      device('sw1', 'switch', 'SW1', 560, 260, 2),
      device('pc2', 'pc', 'PC2', 860, 260, 1),
    ],
    links: [
      // A computer and a switch are opposites, so straight through is right.
      cable('l1', ['pc1', 'eth0'], ['sw1', 'eth0'], 'straight'),
      cable('l2', ['sw1', 'eth1'], ['pc2', 'eth0'], 'straight'),
    ],
  },
  pingFrom: 'pc1',
  pingTo: 'pc2',
};

/**
 * Two computers one address apart that cannot reach each other, because a /25
 * cuts the network in half between them. The lesson is that the mask, not the
 * address, decides who is a neighbour, and the correction says so in the
 * reader's own numbers.
 */
export const SUBNET_SPLIT: Preset = {
  id: 'subnet-split',
  name: 'Two addresses, one mask',
  summary:
    'Two computers on one cable, one address apart, that cannot reach each other. Nothing is broken: the mask has split the network in two.',
  task: 'Press Ping and read the correction. Then fix it by changing one mask, and press Check again.',
  failure:
    'A /25 mask cuts 192.168.1.0 into 192.168.1.0 to 192.168.1.127 and 192.168.1.128 to 192.168.1.255. PC1 at 192.168.1.130 and PC2 at 192.168.1.2 are one either side of that line, so each thinks the other is on another network. Shorten the mask to /24 and they become neighbours.',
  topology: {
    nodes: [
      device('pc1', 'pc', 'PC1', 320, 260, 0, {
        ports: portsFor('pc', 0, ['192.168.1.130'], 25),
      }),
      device('pc2', 'pc', 'PC2', 760, 260, 1, {
        ports: portsFor('pc', 1, ['192.168.1.2'], 25),
      }),
    ],
    links: [cable('l1', ['pc1', 'eth0'], ['pc2', 'eth0'], 'crossover')],
  },
  pingFrom: 'pc1',
  pingTo: 'pc2',
};

export const PRESETS: readonly Preset[] = [TWO_PCS, THROUGH_A_SWITCH, SUBNET_SPLIT];

export const DEFAULT_PRESET: Preset = TWO_PCS;
