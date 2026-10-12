import { describe, expect, it } from 'vitest';
import { idsInRect, rectBetween, rectIsEmpty } from './select';

/*
 * Sweeping a box over the board is how a reader picks several devices, and it
 * has to feel right in both directions and at the edges: a drag that clips the
 * corner of a device takes it, and wiping across a row takes the whole row.
 */

const BOX = { width: 176, height: 144 };
const NODES = [
  { id: 'a', x: 0, y: 0 },
  { id: 'b', x: 300, y: 0 },
  { id: 'c', x: 600, y: 0 },
];

describe('the box a reader drags over the board', () => {
  it('is the same rectangle whichever way the drag went', () => {
    const forwards = rectBetween({ x: 10, y: 20 }, { x: 110, y: 120 });
    const backwards = rectBetween({ x: 110, y: 120 }, { x: 10, y: 20 });
    expect(backwards).toEqual(forwards);
    expect(forwards).toEqual({ x: 10, y: 20, width: 100, height: 100 });
  });

  it('takes a device it only touches', () => {
    // A hair of overlap on the right hand edge of the first device.
    expect(idsInRect(NODES, { x: 88, y: 0, width: 4, height: 4 }, BOX)).toEqual(['a']);
  });

  it('takes everything a sweep across a row covers', () => {
    expect(idsInRect(NODES, rectBetween({ x: -120, y: -80 }, { x: 720, y: 80 }), BOX)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('takes nothing when the box misses', () => {
    expect(idsInRect(NODES, { x: 0, y: 400, width: 500, height: 100 }, BOX)).toEqual([]);
  });

  it('takes everything when the box is the whole board', () => {
    expect(idsInRect(NODES, { x: -1000, y: -1000, width: 3000, height: 3000 }, BOX)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('knows a box that never moved, which is a click rather than a sweep', () => {
    expect(rectIsEmpty(rectBetween({ x: 5, y: 5 }, { x: 5, y: 5 }))).toBe(true);
    expect(rectIsEmpty(rectBetween({ x: 5, y: 5 }, { x: 6, y: 5 }))).toBe(false);
  });
});
