import type { ReactElement } from 'react';
import type { PingResult } from '../../sim/types';

export interface TimelineProps {
  readonly totalMs: number;
  readonly playheadMs: number;
  readonly playing: boolean;
  readonly slowdown: number;
  readonly result: PingResult | null;
  readonly onPlay: () => void;
  readonly onPause: () => void;
  readonly onRestart: () => void;
  readonly onSeek: (timeMs: number) => void;
}

/** How the compression is described. Real speed is worth saying out loud. */
function slowdownLabel(slowdown: number): string {
  if (slowdown < 1.5) return 'at real speed';
  return `${Math.round(slowdown)}\u00d7 slower than real time`;
}

/**
 * The playback clock. Every number here comes from the run that just happened,
 * and the compression is stated rather than hidden: a packet crossing a cable
 * really does take half a millisecond.
 */
export function Timeline({
  totalMs,
  playheadMs,
  playing,
  slowdown,
  result,
  onPlay,
  onPause,
  onRestart,
  onSeek,
}: TimelineProps): ReactElement {
  const idle = result === null;

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button
          type="button"
          className="btn btn-primary"
          onClick={playing ? onPause : onPlay}
          disabled={idle || totalMs === 0}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={onRestart}
          disabled={idle || totalMs === 0}
        >
          Replay
        </button>
        <input
          className="timeline-scrub"
          type="range"
          min={0}
          max={Math.max(totalMs, 0.1)}
          step={totalMs > 100 ? 1 : 0.01}
          value={Math.min(playheadMs, totalMs)}
          disabled={idle || totalMs === 0}
          aria-label="Position in the run"
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </div>

      <dl className="timeline-stats">
        <div className="stat">
          <dt>Round trip</dt>
          <dd className="num">
            {result?.roundTripMs === null || result?.roundTripMs === undefined
              ? '\u2014'
              : `${result.roundTripMs.toFixed(1)} ms`}
          </dd>
        </div>
        <div className="stat">
          <dt>Time to reply</dt>
          <dd className="num">
            {result === null ? '\u2014' : `${result.waitedMs.toFixed(1)} ms`}
          </dd>
        </div>
        <div className="stat stat-wide">
          <dt>Playback</dt>
          <dd>{idle ? 'nothing to play yet' : slowdownLabel(slowdown)}</dd>
        </div>
      </dl>
    </div>
  );
}
