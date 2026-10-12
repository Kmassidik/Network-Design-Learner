/*
 * The little editors the engine tests build boards with, so that a test reads
 * as the topology it describes rather than as object literals.
 */

import type {
  LinkEnd,
  Medium,
  NodeKind,
  SimLink,
  SimNode,
  SimStep,
  Wiring,
} from './types';

/** A hardware address that depends only on a name, so a test cannot invent a duplicate by accident. */
export function macOf(seed: string): string {
  let value = 7;
  for (const character of seed) value = (value * 31 + character.charCodeAt(0)) % 0xffff;
  return `02:00:00:00:${((value >> 8) & 0xff).toString(16).padStart(2, '0')}:${(value & 0xff)
    .toString(16)
    .padStart(2, '0')}`;
}

export interface DeviceOptions {
  readonly gateway?: string;
  readonly outerPort?: string;
  /** Interfaces that have no address, for a device that works below IP. */
  readonly barePorts?: number;
  /** Defaults to true, like every port made this century. */
  readonly autoMdix?: boolean;
}

/** A device with one interface per address given, in order. */
export function device(
  id: string,
  kind: NodeKind,
  label: string,
  addresses: readonly (readonly [string, number])[],
  options: DeviceOptions = {},
): SimNode {
  const count = Math.max(addresses.length, options.barePorts ?? 0);
  const ports = Array.from({ length: count }, (_, index) => {
    const given = addresses[index];
    return {
      name: `eth${index}`,
      ip: given?.[0] ?? '',
      prefix: given?.[1] ?? 24,
      mac: macOf(`${id}:${index}`),
    };
  });
  return {
    id,
    kind,
    label,
    x: 0,
    y: 0,
    config: {
      ports,
      gateway: options.gateway ?? '',
      outerPort: options.outerPort ?? '',
      autoMdix: options.autoMdix ?? true,
    },
  };
}

export function host(id: string, ip: string, prefix = 24, gateway = '', autoMdix = true): SimNode {
  return device(id, 'pc', id.toUpperCase(), [[ip, prefix]], { gateway, autoMdix });
}

export function end(node: string, port = 'eth0'): LinkEnd {
  return { node, port };
}

export function wire(
  id: string,
  a: LinkEnd,
  b: LinkEnd,
  medium: Medium = 'utp',
  wiring: Wiring = 'straight',
): SimLink {
  return { id, a, b, medium, wiring };
}

/** One line per thing that happened, in the shape a reader can check at a glance. */
export function summarise(step: SimStep): string {
  switch (step.type) {
    case 'hop':
      return `hop:${step.frame}:${step.from}.${step.port}->${step.to}`;
    case 'arp-cache':
      return `arp:${step.nodeId}:${step.ip}`;
    case 'mac-cache':
      return `mac:${step.nodeId}:${step.mac}@${step.port}`;
    case 'dropped':
      return `drop:${step.nodeId}:${step.reason}`;
    case 'answered':
      return `answered:${step.nodeId}:${step.ip}`;
    case 'looped':
      return `looped:${step.frames}`;
  }
}

