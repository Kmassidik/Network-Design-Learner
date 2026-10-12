import type { SimLink, SimNode } from './sim/types';

/**
 * One state of the board, which is everything an undo has to put back: the
 * devices, the cables, and what was selected at the time.
 */
export interface BoardSnapshot {
  readonly nodes: readonly SimNode[];
  readonly links: readonly SimLink[];
  readonly selection: readonly string[];
}

export interface History {
  /** States before the present one, oldest first. */
  readonly past: readonly BoardSnapshot[];
  readonly present: BoardSnapshot;
  /** States that were undone, newest first, waiting to be redone. */
  readonly future: readonly BoardSnapshot[];
  /**
   * The key of the change that produced the present. Consecutive changes with
   * the same key collapse into one step, which is what makes a drag one undo
   * rather than two hundred, and typing an address one undo rather than nine.
   */
  readonly key: string | null;
}

/** How far back a reader can go. Beyond this the oldest steps are dropped. */
export const HISTORY_LIMIT = 100;

export function startHistory(present: BoardSnapshot): History {
  return { past: [], present, future: [], key: null };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

/** True when two states are the same objects throughout, which needs no step. */
function same(a: BoardSnapshot, b: BoardSnapshot): boolean {
  return (
    a.nodes === b.nodes &&
    a.links === b.links &&
    a.selection === b.selection
  );
}

/**
 * Record a change to the board. `key` names the change so that a run of related
 * ones, a drag or a typed address, becomes a single step; a change with no key
 * is always its own step.
 */
export function commit(history: History, next: BoardSnapshot, key?: string): History {
  if (same(history.present, next)) return history;

  const collapses = key !== undefined && key === history.key && history.past.length > 0;
  if (collapses) {
    return { past: history.past, present: next, future: [], key };
  }

  const past = [...history.past, history.present];
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    // A new change makes anything undone no longer reachable, which is what
    // every editor does and what stops a redo from overwriting fresh work.
    future: [],
    key: key ?? null,
  };
}

/**
 * Change the present without adding a step. Selecting a device, or anything
 * else that is not an edit, must not fill the undo stack with states a reader
 * never made.
 */
export function replace(history: History, next: BoardSnapshot): History {
  return same(history.present, next) ? history : { ...history, present: next };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    // The next change is never part of the step being undone.
    key: null,
  };
}

export function redo(history: History): History {
  const next = history.future[0];
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    key: null,
  };
}
