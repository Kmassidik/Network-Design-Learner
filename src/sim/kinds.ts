import { BROADCAST_MAC, type NodeConfig, type NodeKind, type Port } from './types';

export interface KindSpec {
  readonly label: string;
  /** Palette section this kind is listed under. */
  readonly group: string;
  /** How many interfaces the kind has. */
  readonly portCount: number;
  /** Picture in `public/symbols`, third-party, see md/ASSETS.md. */
  readonly symbol: string;
  /** One line for the palette: what this device does that the others do not. */
  readonly role: string;
}

export const KIND: Record<NodeKind, KindSpec> = {
  pc: {
    label: 'PC',
    group: 'End devices',
    portCount: 1,
    symbol: 'computer.svg',
    role: 'A host. It starts and answers traffic, and never passes anything on.',
  },
  hub: {
    label: 'Hub',
    group: 'LAN',
    portCount: 8,
    symbol: 'hub.svg',
    role: 'Repeats every frame out of every other port. It reads nothing and knows nothing.',
  },
  switch: {
    label: 'Switch',
    group: 'LAN',
    portCount: 8,
    symbol: 'ethernet_switch.svg',
    role: 'Learns which address lives on which port, then sends frames to one port instead of all of them.',
  },
  router: {
    label: 'Router',
    group: 'Routing',
    portCount: 4,
    symbol: 'router.svg',
    role: 'Joins networks. It holds one address per interface and forwards between them.',
  },
  firewall: {
    label: 'Firewall',
    group: 'Security',
    portCount: 2,
    symbol: 'firewall.svg',
    role: 'Sits between an inside and an outside. It refuses anything arriving from the outside that did not go out first.',
  },
  cloud: {
    label: 'Internet cloud',
    group: 'WAN',
    portCount: 1,
    symbol: 'cloud.svg',
    role: 'Everything beyond your network. It answers for addresses that are not on the board at all.',
  },
};

export const NODE_KINDS: readonly NodeKind[] = ['pc', 'hub', 'switch', 'router', 'firewall', 'cloud'];

/** How a device of each kind is named when it is placed by hand. */
export const KIND_PREFIX: Record<NodeKind, string> = {
  pc: 'PC',
  hub: 'HUB',
  switch: 'SW',
  router: 'R',
  firewall: 'FW',
  cloud: 'NET',
};

/** Palette sections, in the order they are shown. */
export const KIND_GROUPS: readonly string[] = ['End devices', 'LAN', 'Routing', 'Security', 'WAN'];

/** Interface names, in the order a device hands them out. */
export function portNames(kind: NodeKind): readonly string[] {
  return Array.from({ length: KIND[kind].portCount }, (_, index) => `eth${index}`);
}

/** Interfaces with the addresses given, one per port, all sharing one mask. */
export function portsFor(
  kind: NodeKind,
  serial: number,
  addresses: readonly string[],
  prefix: number,
): readonly Port[] {
  return portNames(kind).map((name, index) => ({
    name,
    ip: addresses[index] ?? '',
    prefix,
    mac: macFor(serial, index),
  }));
}

/** Two hex digits, for building hardware addresses. */
function hex2(value: number): string {
  return value.toString(16).padStart(2, '0');
}

/**
 * The hardware address of one interface. `serial` is unique across the whole
 * board and `port` counts from zero within the device, so no two interfaces in
 * one topology can share an address.
 */
function macFor(serial: number, port: number): string {
  return `02:00:00:00:${hex2(serial + 1)}:${hex2(port + 1)}`;
}

function barePorts(kind: NodeKind, serial: number): readonly Port[] {
  return portNames(kind).map((name, index) => ({
    name,
    ip: '',
    prefix: 24,
    mac: macFor(serial, index),
  }));
}

function withAddresses(
  kind: NodeKind,
  serial: number,
  address: (port: number) => string,
): readonly Port[] {
  return portNames(kind).map((name, index) => ({
    name,
    ip: address(index),
    prefix: 24,
    mac: macFor(serial, index),
  }));
}

/**
 * A starting configuration that works on its own, and that fits with the other
 * defaults: a PC and a firewall on the same small network, a firewall and a
 * cloud on the same outside network, and a router already holding one network
 * per interface.
 *
 * `serial` is unique across the whole board and decides the hardware addresses,
 * so no two interfaces can collide. `ordinal` is how many devices of this kind
 * were there already, which is the number in the device's name, and it decides
 * the addresses, so the second computer placed is PC2 at 192.168.1.2 rather
 * than at some number from a different counter. Two devices of the same kind
 * can still be given colliding addresses by hand, which is a real fault to find
 * rather than a hidden one.
 */
export function defaultConfig(kind: NodeKind, serial: number, ordinal = serial): NodeConfig {
  const base = { gateway: '', outerPort: '', autoMdix: true };
  switch (kind) {
    case 'pc':
      return { ...base, ports: withAddresses(kind, serial, () => `192.168.1.${ordinal + 1}`) };
    case 'hub':
    case 'switch':
      return { ...base, ports: barePorts(kind, serial) };
    case 'router':
      return {
        ...base,
        // One network per interface, starting at 192.168.10.0 so that a router
        // dropped onto a board does not land on top of a computer's address,
        // and each router takes its own block of four.
        ports: withAddresses(kind, serial, (port) => `192.168.${10 + ordinal * 4 + port}.1`),
      };
    case 'firewall':
      return {
        ...base,
        // eth0 faces the people, eth1 faces the internet.
        ports: withAddresses(kind, serial, (port) => (port === 0 ? '192.168.1.254' : '203.0.113.1')),
        gateway: '203.0.113.2',
        outerPort: 'eth1',
      };
    case 'cloud':
      return { ...base, ports: withAddresses(kind, serial, () => '203.0.113.2') };
  }
}

/** True when this kind holds addresses at all. A hub and a switch do not. */
export function hasAddresses(kind: NodeKind): boolean {
  return kind !== 'hub' && kind !== 'switch';
}

/** A hardware address of all ones, used when a frame has no destination yet. */
export const BROADCAST = BROADCAST_MAC;
