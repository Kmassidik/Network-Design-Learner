import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commit,
  redo,
  startHistory,
  undo,
  type BoardSnapshot,
} from './history';
import type { SimNode } from './sim/types';

/*
 * Undo is the one feature that has to be exactly right: a step missed and a
 * reader loses work, a step too many and the board jumps somewhere they never
 * were. These tests are about the rules that decide that, which are coalescing
 * and what a new change does to anything already undone.
 */

const CONFIG = { ports: [], gateway: '', outerPort: '', autoMdix: false };

/** A board standing in for one state of the app's own, with fresh arrays each time. */
function board(name: string, selection: readonly string[] = []): BoardSnapshot {
  const node: SimNode = { id: name, kind: 'pc', label: name, x: 0, y: 0, config: CONFIG };
  return { nodes: [node], links: [], selection };
}

/** What a board is called, for a readable assertion. */
function nameOf(snapshot: BoardSnapshot): string {
  return snapshot.nodes[0]?.label ?? '';
}

describe('the step-by-step record of a board', () => {
  it('starts with nothing to undo or redo', () => {
    const history = startHistory(board('a'));
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('takes a change and gives it back', () => {
    const first = board('a');
    const history = commit(startHistory(first), board('b'));
    expect(canUndo(history)).toBe(true);
    expect(undo(history).present).toBe(first);
    expect(redo(undo(history)).present).toBe(history.present);
  });

  it('ignores a change that changes nothing', () => {
    const first = board('a');
    const history = startHistory(first);
    expect(commit(history, first)).toBe(history);
  });

  it('collapses a run of changes that share a key into one step', () => {
    // A drag reports its position every few pixels and must undo in one go.
    let history = startHistory(board('start'));
    for (const step of ['1', '2', '3']) history = commit(history, board(step), 'drag:7');
    expect(history.past).toHaveLength(1);
    expect(nameOf(history.present)).toBe('3');
    expect(nameOf(undo(history).present)).toBe('start');
  });

  it('starts a new step when the key changes', () => {
    // Two drags of the same device are still two steps.
    let history = startHistory(board('start'));
    history = commit(history, board('after first drag'), 'drag:1');
    history = commit(history, board('after second drag'), 'drag:2');
    expect(history.past).toHaveLength(2);
  });

  it('never collapses a change that carries no key', () => {
    let history = startHistory(board('a'));
    history = commit(history, board('b'));
    history = commit(history, board('c'));
    expect(history.past).toHaveLength(2);
  });

  it('drops anything undone as soon as something new happens', () => {
    let history = startHistory(board('a'));
    history = commit(history, board('b'));
    history = undo(history);
    expect(canRedo(history)).toBe(true);
    history = commit(history, board('c'));
    expect(canRedo(history)).toBe(false);
  });

  it('walks back and forward through several steps', () => {
    let history = startHistory(board('a'));
    history = commit(history, board('b'));
    history = commit(history, board('c'));
    history = undo(undo(history));
    expect(nameOf(history.present)).toBe('a');
    expect(canUndo(history)).toBe(false);
    history = redo(redo(history));
    expect(nameOf(history.present)).toBe('c');
    expect(canRedo(history)).toBe(false);
  });

  it('stops at the ends rather than going anywhere', () => {
    const history = startHistory(board('a'));
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it('does not grow without limit', () => {
    let history = startHistory(board('0'));
    for (let step = 1; step <= HISTORY_LIMIT + 20; step++) {
      history = commit(history, board(String(step)));
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT);
    // The oldest steps are the ones dropped, so the recent past still works.
    expect(nameOf(history.present)).toBe(String(HISTORY_LIMIT + 20));
  });
});
