import { describe, expect, it } from 'vitest';
import { Network } from './engine';
import { packetsAt, segmentsOf, slowMotionFactor, totalDurationMs } from './playback';
import { TWO_PCS } from './presets';

const run = new Network(TWO_PCS.topology).ping('pc1', '192.168.1.2');
const segments = segmentsOf(run.steps);

describe('turning hops into something drawable', () => {
  it('gives every frame its own stretch of time on a cable', () => {
    // Simulated times accumulate the way floating point does, so they are
    // compared at the precision anyone would read them at.
    expect(
      segments.map(
        (segment) =>
          `${segment.frame}:${segment.startMs.toFixed(2)}-${segment.endMs.toFixed(2)}`,
      ),
    ).toEqual([
      // 0.5 ms of cable each way, plus the 0.1 ms a device spends before it answers.
      'arp-request:0.00-0.50',
      'arp-reply:0.60-1.10',
      'echo-request:1.20-1.70',
      'echo-reply:1.80-2.30',
    ]);
  });

  it('places a frame partway along the cable at the time asked for', () => {
    const halfway = packetsAt(segments, 0.25);
    expect(halfway).toHaveLength(1);
    expect(halfway[0]?.index).toBe(0);
    expect(halfway[0]?.progress).toBeCloseTo(0.5, 6);
  });

  it('shows nothing when nothing is in flight', () => {
    expect(packetsAt(segments, 0.55)).toEqual([]);
    expect(packetsAt(segments, -1)).toEqual([]);
    expect(packetsAt(segments, 99)).toEqual([]);
  });

  it('shows the frame at the far end at the moment it lands', () => {
    const arriving = packetsAt(segments, 0.5);
    expect(arriving[0]?.progress).toBe(1);
  });

  it('runs the clock to the end of the last frame', () => {
    expect(totalDurationMs(run.steps)).toBeCloseTo(2.3, 6);
  });

  it('keeps the clock running long enough to show a device giving up', () => {
    const timeout = new Network(TWO_PCS.topology).ping('pc1', '192.168.1.9');
    expect(totalDurationMs(timeout.steps)).toBe(1000);
  });
});

describe('playback speed', () => {
  it('stretches a short run so it can be watched', () => {
    expect(slowMotionFactor(2.3)).toBe(2000);
  });

  it('compresses a long wait instead of stretching it', () => {
    expect(slowMotionFactor(1000)).toBe(5);
    expect(slowMotionFactor(10_000)).toBe(1);
  });

  it('leaves an empty run alone', () => {
    expect(slowMotionFactor(0)).toBe(1);
  });
});
