import { defaultConfig } from './kinds';
import {
  wiringFor,
  type LinkEnd,
  type Medium,
  type NodeConfig,
  type Port,
  type SimLink,
  type SimNode,
  type Topology,
  type Wiring,
} from './types';

/*
 * Building a board for a lesson. Both sets of lessons are written with these,
 * so a fault handed over with instructions and the same fault handed over
 * without them are built by the same code, and a change to how a device gets
 * its hardware address happens in one place rather than two.
 *
 * Everything here returns a new board rather than changing one, because a
 * lesson's `repair` has to be provably a single change.
 */

/** One device, built from the catalogue's own defaults with the given settings on top. */
export function device(
  id: string,
  kind: SimNode['kind'],
  label: string,
  x: number,
  y: number,
  serial: number,
  overrides: Partial<NodeConfig> = {},
): SimNode {
  return { id, kind, label, x, y, config: { ...defaultConfig(kind, serial), ...overrides } };
}

/**
 * A cable by device id, for boards written as literals. The wiring is given
 * rather than worked out, because a board written as a literal has no devices
 * to look at when the cable is built.
 */
export function link(
  id: string,
  a: LinkEnd,
  b: LinkEnd,
  wiring: Wiring,
  medium: Medium = 'utp',
): SimLink {
  return { id, a, b, medium, wiring };
}

/**
 * A cable between two devices, wired the way those two need it. Wiring only
 * matters for copper, but every cable is given the right one anyway, so a board
 * stays honest for a reader who turns automatic detection off.
 */
export function cable(
  id: string,
  a: SimNode,
  portA: string,
  b: SimNode,
  portB: string,
  medium: Medium = 'utp',
): SimLink {
  return link(
    id,
    { node: a.id, port: portA },
    { node: b.id, port: portB },
    wiringFor(a.kind, b.kind),
    medium,
  );
}

/**
 * The same board with one device's settings changed, and nothing else touched.
 * A repair is written with this so that it is provably one change: the goal
 * fails on the board as handed over, and passes on the board this returns.
 */
export function withConfig(
  topology: Topology,
  id: string,
  change: (config: NodeConfig) => NodeConfig,
): Topology {
  return {
    ...topology,
    nodes: topology.nodes.map((node) =>
      node.id === id ? { ...node, config: change(node.config) } : node,
    ),
  };
}

/** The same board with some of one device's settings replaced. */
export function withPatch(topology: Topology, id: string, patch: Partial<NodeConfig>): Topology {
  return withConfig(topology, id, (config) => ({ ...config, ...patch }));
}

/** The same board with one interface changed, in place. */
export function withPort(
  topology: Topology,
  id: string,
  portName: string,
  patch: Partial<Port>,
): Topology {
  return withConfig(topology, id, (config) => ({
    ...config,
    ports: config.ports.map((port) => (port.name === portName ? { ...port, ...patch } : port)),
  }));
}

/** The same board with one cable changed. */
export function withLink(topology: Topology, id: string, patch: Partial<SimLink>): Topology {
  return {
    ...topology,
    links: topology.links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
  };
}

/** The same board with one cable taken away. */
export function withoutLink(topology: Topology, id: string): Topology {
  return { ...topology, links: topology.links.filter((link) => link.id !== id) };
}
