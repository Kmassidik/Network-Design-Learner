/**
 * Anything the heap can order. `seq` breaks ties so two events scheduled for
 * the same millisecond still run in the order they were created, which is what
 * keeps a run reproducible.
 */
export interface Timed {
  time: number;
  seq: number;
}

/** Min-heap ordered by `time`, then by `seq`. */
export class MinHeap<T extends Timed> {
  private readonly items: T[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    const items = this.items;
    items.push(item);
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      const child = at(items, index);
      const above = at(items, parent);
      if (!before(child, above)) break;
      items[index] = above;
      items[parent] = child;
      index = parent;
    }
  }

  pop(): T | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (last === undefined) return undefined;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = 2 * index + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && before(at(items, left), at(items, smallest))) smallest = left;
        if (right < items.length && before(at(items, right), at(items, smallest))) smallest = right;
        if (smallest === index) break;
        const held = at(items, index);
        items[index] = at(items, smallest);
        items[smallest] = held;
        index = smallest;
      }
    }
    return top;
  }
}

function before(a: Timed, b: Timed): boolean {
  return a.time !== b.time ? a.time < b.time : a.seq < b.seq;
}

/**
 * The heap never leaves holes, so every index it asks for is in range. The
 * accessor is what tells the compiler that, without a cast at each use.
 */
function at<T>(items: readonly T[], index: number): T {
  return items[index] as T;
}
