/*
 * The shapes and the timing constants the engine works with. They are here so
 * that the engine file itself is about behaviour, and so anything that only
 * needs to name an ARP entry does not have to import the engine to do it.
 */

import type { Timed } from './heap';
import type { Frame, SimLink } from './types';

/** Time a device spends looking at a frame before it can act on it, in ms. */
export const NODE_FORWARD_MS = 0.1;

/** How long the ping waits for an address to be resolved before giving up, in ms. */
export const ARP_TIMEOUT_MS = 1000;

/**
 * Safety net. A frame budget that runs out means the wiring has a loop in it.
 * A loop at layer two is not something a hop count can stop, so it has to be
 * noticed from outside the simulation.
 */
export const MAX_FRAMES = 512;

/** A frame on its way to one device, at a time it will get there. */
export interface Delivery extends Timed {
  readonly nodeId: string;
  /** The interface the frame arrives on. */
  readonly port: string;
  readonly frame: Frame;
}

/** What is plugged into one interface. A port holds one cable or none. */
export interface Attachment {
  readonly link: SimLink;
  readonly peerId: string;
  readonly peerPort: string;
}

/** Things that happened to one device, kept apart from what it learned. */
export interface Counters {
  sent: number;
  received: number;
  dropped: number;
}

export interface ArpEntry {
  readonly ip: string;
  readonly mac: string;
}

export interface MacEntry {
  readonly mac: string;
  readonly port: string;
}

export interface NodeStats {
  readonly framesSent: number;
  readonly framesReceived: number;
  readonly framesDropped: number;
}

/** One interface as a lookup key: a port name is only unique within a device. */
export function portKey(nodeId: string, portName: string): string {
  return `${nodeId}\n${portName}`;
}
