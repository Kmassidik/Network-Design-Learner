import type { FrameKind, Medium, SimStep } from './types';

/**
 * A frame crossing one cable. Hops carry their own start and end time, so the
 * canvas can place a packet anywhere between two devices without knowing
 * anything about the simulation.
 */
export interface PacketSegment {
  readonly linkId: string;
  readonly from: string;
  readonly to: string;
  /** The interface the frame left by, which is what the canvas prints. */
  readonly port: string;
  readonly medium: Medium;
  readonly frame: FrameKind;
  readonly startMs: number;
  readonly endMs: number;
}

/** A packet that is on a cable at the moment being drawn. */
export interface PacketAt {
  /** Index into the segment list, so each packet has a stable identity. */
  readonly index: number;
  readonly linkId: string;
  readonly frame: FrameKind;
  /** How far along the cable it is, 0 at the sender and 1 at the receiver. */
  readonly progress: number;
}

export function segmentsOf(steps: readonly SimStep[]): readonly PacketSegment[] {
  const segments: PacketSegment[] = [];
  for (const step of steps) {
    if (step.type !== 'hop') continue;
    segments.push({
      linkId: step.linkId,
      from: step.from,
      to: step.to,
      port: step.port,
      medium: step.medium,
      frame: step.frame,
      startMs: step.timeMs,
      endMs: step.timeMs + step.travelMs,
    });
  }
  return segments;
}

/** When the last frame finished crossing its cable, in ms. */
export function totalDurationMs(steps: readonly SimStep[]): number {
  let last = 0;
  for (const step of steps) {
    last = Math.max(last, step.type === 'hop' ? step.timeMs + step.travelMs : step.timeMs);
  }
  return last;
}

/**
 * How much to stretch a run so a person can watch it. Every run aims to take
 * about five seconds, so half a millisecond on a cable becomes a visible
 * journey while a one second address timeout stays watchable. The factor is
 * shown on screen, because a stretched clock must never look like a real one.
 */
export function slowMotionFactor(totalMs: number): number {
  if (totalMs <= 0) return 1;
  return Math.min(2000, Math.max(1, 5000 / totalMs));
}

/**
 * Which packets are on a cable at `timeMs`, and how far along. Frames in flight
 * take time; everything else a device does is instant, so a packet appears to
 * leave the moment the previous one lands.
 */
export function packetsAt(segments: readonly PacketSegment[], timeMs: number): readonly PacketAt[] {
  const inFlight: PacketAt[] = [];
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index] as PacketSegment;
    if (timeMs < segment.startMs || timeMs > segment.endMs) continue;
    const span = segment.endMs - segment.startMs;
    inFlight.push({
      index,
      linkId: segment.linkId,
      frame: segment.frame,
      progress: span === 0 ? 1 : (timeMs - segment.startMs) / span,
    });
  }
  return inFlight;
}
