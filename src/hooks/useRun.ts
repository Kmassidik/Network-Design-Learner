import { useCallback, useEffect, useState } from 'react';
import { describeResult, describeSteps, type LogLine } from '../content/narration';
import { correct, type Correction as CorrectionData } from '../sim/diagnose';
import { parseIpv4 } from '../sim/ip';
import { segmentsOf, slowMotionFactor, totalDurationMs, type PacketSegment } from '../sim/playback';
import { primaryPort, type PingResult } from '../sim/types';
import type { BoardHandle } from './useBoard';

/** Everything one ping produced, kept together so the canvas and the log cannot disagree. */
export interface Run {
  readonly result: PingResult;
  readonly segments: readonly PacketSegment[];
  readonly totalMs: number;
  readonly slowdown: number;
  readonly lines: readonly LogLine[];
}

/**
 * What the board asks of the run that is on it. The board is made before the
 * run, because the run reads the board; but a board that is replaced by a
 * lesson or a template, or that loses the device a run was about, has to be
 * able to stop that run, and the board's own refusals are said where a failed
 * ping's are, under the canvas.
 */
export interface RunControl {
  /** A board was loaded: nothing of the run on screen belongs on this one. */
  readonly reset: () => void;
  /** The run no longer describes the board: it stops being shown. */
  readonly clear: () => void;
  /** Say something to the reader, in the place a failed ping says it, or nothing to clear it. */
  readonly notify: (message: string | null) => void;
}

export interface RunOptions {
  /** The board being pinged. The run reads it and never writes to it. */
  readonly board: BoardHandle;
  readonly reducedMotion: boolean;
}

export interface RunHandle {
  /** The ping that was last sent, with the frames, the clock and the log of it. */
  readonly run: Run | null;
  readonly playing: boolean;
  readonly playheadMs: number;
  /** A seek target plus a token, so the canvas clock restarts on every seek. */
  readonly seek: { readonly ms: number; readonly token: number };
  /** What the last attempt refused to do, or was refused for. */
  readonly notice: string | null;
  /** What stopped the run, in this board's own numbers. */
  readonly correction: CorrectionData | null;
  /** The run's log lines up to the playhead. */
  readonly visibleLines: readonly LogLine[];
  /** The newest of those, shown on the canvas while the panels are hidden. */
  readonly caption: LogLine | null;
  /** Send the ping the scenario describes. `animate` false runs it whole. */
  readonly start: (animate: boolean) => void;
  readonly play: () => void;
  readonly pause: () => void;
  readonly restart: () => void;
  readonly seekTo: (timeMs: number) => void;
  /** Ten times a second from the canvas clock, while a run is animating. */
  readonly onTick: (timeMs: number) => void;
  readonly onFinish: () => void;
  /** A board was loaded: the run, the notice and the playhead all go back to nothing. */
  readonly reset: () => void;
  /** The board changed under the run: it can no longer be shown. */
  readonly clear: () => void;
  /** The addresses are forgotten, so the diagnosis of them is too. */
  readonly discard: () => void;
  /** Say something under the canvas, or nothing to take back what was said. */
  readonly notify: (message: string | null) => void;
}

/**
 * A ping and its aftermath: the run itself, the frames the canvas plays, the log
 * the reader reads and what the diagnosis made of it. It answers "what happened
 * the last time the reader asked", which is a different question from what is on
 * the board and changes for different reasons.
 */
export function useRun({ board, reducedMotion }: RunOptions): RunHandle {
  const { engine, nodes, links, fromNode, toNode, targetIp, labelOf, runRef } = board;
  const [run, setRun] = useState<Run | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [seek, setSeek] = useState({ ms: 0, token: 0 });
  const [notice, setNotice] = useState<string | null>(null);
  const [correction, setCorrection] = useState<CorrectionData | null>(null);

  /* A correction describes the board it was written about. As soon as anything
     on the board changes it is out of date, so it goes, and the reader is
     invited to check again rather than told something that is no longer true. */
  useEffect(() => {
    setCorrection(null);
  }, [nodes, links]);

  const notify = useCallback((message: string | null) => setNotice(message), []);

  const start = useCallback(
    (animate: boolean) => {
      const net = engine.current;
      if (net === null || fromNode === null || toNode === null) {
        setNotice('Place two devices and connect them before sending a ping.');
        return;
      }
      if (fromNode.id === toNode.id) {
        setNotice('Pick two different devices.');
        return;
      }
      const fromPort = primaryPort(fromNode.config);
      if (fromPort === null || fromPort.ip === '' || parseIpv4(fromPort.ip) === null) {
        setNotice(`${fromNode.label} has no usable address on any interface yet.`);
        return;
      }
      if (targetIp === null) {
        setNotice(`${toNode.label} has no address at all, so there is nothing to send a ping to.`);
        return;
      }

      let result: PingResult;
      try {
        result = net.ping(fromNode.id, targetIp);
      } catch (error) {
        // The engine is the authority on what it will and will not run. If it
        // refuses, the reader is told why instead of a button appearing to do
        // nothing at all.
        setNotice(error instanceof Error ? error.message : String(error));
        return;
      }
      const totalMs = totalDurationMs(result.steps);
      setNotice(null);
      // The correction step: what stopped it, in this board's own numbers.
      setCorrection(correct(result, { nodes, links }));
      setRun({
        result,
        segments: segmentsOf(result.steps),
        totalMs,
        slowdown: slowMotionFactor(totalMs),
        lines: [...describeSteps(result.steps, labelOf), describeResult(result, labelOf)],
      });
      const showWholeRun = !animate || reducedMotion;
      setSeek((current) => ({ ms: showWholeRun ? totalMs : 0, token: current.token + 1 }));
      setPlayheadMs(showWholeRun ? totalMs : 0);
      setPlaying(animate && !reducedMotion && totalMs > 0);
    },
    [engine, nodes, links, fromNode, toNode, targetIp, labelOf, reducedMotion],
  );

  const onTick = useCallback((timeMs: number) => setPlayheadMs(timeMs), []);
  const onFinish = useCallback(() => setPlaying(false), []);

  const seekTo = useCallback((timeMs: number) => {
    setPlayheadMs(timeMs);
    setSeek((current) => ({ ms: timeMs, token: current.token + 1 }));
  }, []);

  const play = useCallback(() => {
    if (run === null) return;
    if (playheadMs >= run.totalMs) seekTo(0);
    setPlaying(true);
  }, [run, playheadMs, seekTo]);

  const pause = useCallback(() => setPlaying(false), []);

  const restart = useCallback(() => {
    seekTo(0);
    setPlaying(true);
  }, [seekTo]);

  const reset = useCallback(() => {
    setRun(null);
    setPlaying(false);
    setPlayheadMs(0);
    setSeek((current) => ({ ms: 0, token: current.token + 1 }));
    setNotice(null);
  }, []);

  const clear = useCallback(() => {
    setRun(null);
    setPlaying(false);
  }, []);

  const discard = useCallback(() => {
    setRun(null);
    setPlaying(false);
    setCorrection(null);
  }, []);

  /* A board is replaced or emptied without this run being able to hear about it,
     so the run puts the ways it can be stopped where the board looks for them. */
  useEffect(() => {
    runRef.current = { reset, clear, notify };
    return () => {
      runRef.current = null;
    };
  }, [runRef, reset, clear, notify]);

  const visibleLines = run === null ? [] : run.lines.filter((line) => line.timeMs <= playheadMs + 1e-9);
  /** The newest line of the run, shown on the canvas while the panels are hidden. */
  const caption = visibleLines[visibleLines.length - 1] ?? null;

  return {
    run,
    playing,
    playheadMs,
    seek,
    notice,
    correction,
    visibleLines,
    caption,
    start,
    play,
    pause,
    restart,
    seekTo,
    onTick,
    onFinish,
    reset,
    clear,
    discard,
    notify,
  };
}
