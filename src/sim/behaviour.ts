import type { Frame, NodeConfig, NodeKind, Port, SimNode, SimStep } from './types';
import { cloudBehaviour } from './behaviour-cloud';
import { firewallBehaviour } from './behaviour-firewall';
import { hostBehaviour } from './behaviour-host';
import { hubBehaviour } from './behaviour-hub';
import { routerBehaviour } from './behaviour-router';
import { switchBehaviour } from './behaviour-switch';

/** A frame a device is holding until it learns which interface to send it to. */
export interface HeldFrame {
  /** The address being waited for. */
  readonly ip: string;
  /** The interface the frame will leave by once that address is known. */
  readonly port: string;
  readonly frame: Frame;
  /** When to give up waiting, in ms since the run started. */
  readonly deadlineMs: number;
}

/** Everything one device remembers between frames. */
export interface DeviceState {
  /** What this device knows about which interface owns which address. */
  readonly arp: Map<string, string>;
  /** Switches only: the interface each hardware address was last seen on. */
  readonly macTable: Map<string, string>;
  /** Firewalls only: conversations that went out, so their answers may come back. */
  readonly flows: Set<string>;
  /** Frames waiting for an address to be resolved. */
  readonly held: HeldFrame[];
}

/**
 * What a behaviour is allowed to do. A behaviour is the only place that knows
 * how a kind of device reacts; the engine owns the cables, the clock and the
 * tables, so every kind is written in the same small vocabulary.
 */
export interface BehaviourContext {
  readonly node: SimNode;
  readonly config: NodeConfig;
  /** The interface the frame arrived on. */
  readonly port: Port;
  readonly frame: Frame;
  /** When it arrived, in ms since the run started. */
  readonly timeMs: number;
  readonly state: DeviceState;
  /** Every interface on this device that has an address. */
  readonly addresses: readonly Port[];
  /** True when this device holds that address on some interface. */
  ownsAddress(ip: string): boolean;
  /** Send a frame out of a named interface. */
  send(portName: string, frame: Frame): void;
  /** Send it out of every interface except the one it came in on. */
  repeat(frame: Frame): void;
  /** Record something that happened. */
  note(step: SimStep): void;
  /**
   * Rewrite the frame for `ip` and send it. If this device does not yet know
   * which interface owns that address, the frame is held while it asks.
   */
  resolveAndSend(portName: string, ip: string, frame: Frame): void;
  /** The interface whose address sits in the same network as `ip`. */
  portForNetwork(ip: string, exceptPort?: string): Port | null;
  /** Learn a hardware address from a frame, and remember which interface it came from. */
  learnMac(mac: string, portName: string): void;
  /** Send on everything held for this address, now that an answer has arrived. */
  releaseHeld(ip: string, mac: string): void;
}

export type Behaviour = (ctx: BehaviourContext) => void;

/** One behaviour per device kind, and the reason each kind exists. */
export const BEHAVIOURS: Record<NodeKind, Behaviour> = {
  pc: hostBehaviour,
  hub: hubBehaviour,
  switch: switchBehaviour,
  router: routerBehaviour,
  firewall: firewallBehaviour,
  cloud: cloudBehaviour,
};
