/**
 * Choosing several devices at once. The rectangle is in world units, which is
 * what the canvas draws in, so this stays free of anything to do with pixels.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The rectangle between two corners, whichever way the drag went. */
export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function rectIsEmpty(rect: Rect): boolean {
  return rect.width === 0 && rect.height === 0;
}

/**
 * The devices a rectangle touches, by the box the canvas draws for them. A drag
 * only has to reach a device, not cover it, which is how every drawing tool
 * behaves and what makes a quick sweep across a row work.
 */
export function idsInRect(
  nodes: readonly { readonly id: string; readonly x: number; readonly y: number }[],
  rect: Rect,
  box: { readonly width: number; readonly height: number },
): readonly string[] {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;
  return nodes
    .filter((node) => {
      const nodeLeft = node.x - box.width / 2;
      const nodeRight = node.x + box.width / 2;
      const nodeTop = node.y - box.height / 2;
      const nodeBottom = node.y + box.height / 2;
      return nodeLeft <= right && nodeRight >= left && nodeTop <= bottom && nodeBottom >= top;
    })
    .map((node) => node.id);
}
