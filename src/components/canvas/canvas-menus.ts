import { KIND, NODE_KINDS } from '../../sim/kinds';
import { MEDIUM, sharedMediums, type SimLink, type SimNode } from '../../sim/types';
import type { MenuSection } from './ContextMenu';
import type { CanvasAction, Hit, Point } from './canvas-types';

/*
 * What each right click offers. Built here rather than inside the component so
 * that adding something to a menu is a change to a list of labels, not to the
 * gesture code: the menus were the largest single block in Canvas.tsx and they
 * change for entirely different reasons than the pointer does.
 */

/** What the menus need from the component to describe themselves. */
export interface MenuDeps {
  readonly wireMode: boolean;
  /** Start drawing a cable from this device. */
  readonly startWiring: (id: string) => void;
  /** Draw cables, or stop drawing them. */
  readonly toggleWiring: () => void;
  readonly fit: () => void;
  readonly zoom: (factor: number) => void;
  /** A point on the screen as a point on the board, for placing a device. */
  readonly toWorld: (x: number, y: number) => Point;
  readonly nodeById: (id: string) => SimNode | null;
  readonly linkById: (id: string) => SimLink | null;
  readonly onAction: (action: CanvasAction) => void;
}

/** What empty space offers: a new device where the click was, and the board itself. */
export function worldMenu(deps: MenuDeps, at: Point): readonly MenuSection[] {
  return [
    {
      title: 'Add a device',
      items: NODE_KINDS.map((kind) => ({
        label: KIND[kind].label,
        onSelect: () => {
          const point = deps.toWorld(at.x, at.y);
          deps.onAction({ kind: 'add', device: kind, x: point.x, y: point.y });
        },
      })),
    },
    ...boardMenu(deps),
  ];
}

/** What the board offers, wherever it is asked for. */
export function boardMenu(deps: MenuDeps): readonly MenuSection[] {
  return [
    {
      items: [
        {
          label: deps.wireMode ? 'Stop drawing cables' : 'Draw a cable',
          current: deps.wireMode,
          onSelect: deps.toggleWiring,
        },
        { label: 'Frame the board', onSelect: deps.fit },
      ],
    },
    {
      title: 'Zoom',
      items: [
        { label: 'Zoom in', onSelect: () => deps.zoom(1.25) },
        { label: 'Zoom out', onSelect: () => deps.zoom(1 / 1.25) },
      ],
    },
    {
      items: [
        { label: 'Forget every address', onSelect: () => deps.onAction({ kind: 'forget' }) },
        { label: 'Hide the panels', onSelect: () => deps.onAction({ kind: 'panels' }) },
      ],
    },
  ];
}

/** What a device offers, which is everything about that device. */
export function nodeMenu(deps: MenuDeps, id: string): readonly MenuSection[] {
  return [
    {
      items: [
        { label: 'Draw a cable from here', onSelect: () => deps.startWiring(id) },
        { label: 'Set as the ping source', onSelect: () => deps.onAction({ kind: 'pingFrom', id }) },
        { label: 'Set as the ping target', onSelect: () => deps.onAction({ kind: 'pingTo', id }) },
      ],
    },
    { items: [{ label: 'Delete', onSelect: () => deps.onAction({ kind: 'delete' }) }] },
  ];
}

/** What a cable offers: what it is made of, and which way round it is wired. */
export function linkMenu(
  deps: MenuDeps,
  link: SimLink,
  a: SimNode,
  b: SimNode,
): readonly MenuSection[] {
  const sections: MenuSection[] = [
    {
      title: 'Made of',
      items: sharedMediums(a.kind, b.kind).map((medium) => ({
        label: `${MEDIUM[medium].label} (${MEDIUM[medium].connector})`,
        current: link.medium === medium,
        onSelect: () => deps.onAction({ kind: 'medium', id: link.id, medium }),
      })),
    },
  ];
  if (link.medium === 'utp') {
    sections.push({
      title: 'Which way round the wires go',
      items: [
        {
          label: 'Straight through',
          current: link.wiring === 'straight',
          onSelect: () => deps.onAction({ kind: 'wiring', id: link.id, wiring: 'straight' }),
        },
        {
          label: 'Crossover',
          current: link.wiring === 'crossover',
          onSelect: () => deps.onAction({ kind: 'wiring', id: link.id, wiring: 'crossover' }),
        },
      ],
    });
  }
  sections.push({ items: [{ label: 'Delete', onSelect: () => deps.onAction({ kind: 'delete' }) }] });
  return sections;
}

/** Everything the open menu should show, decided by what was clicked. */
export function menuForHit(deps: MenuDeps, hit: Hit, at: Point): readonly MenuSection[] {
  if (hit.kind === 'node') return nodeMenu(deps, hit.id);
  if (hit.kind === 'link') {
    const link = deps.linkById(hit.id);
    if (link === null) return boardMenu(deps);
    const a = deps.nodeById(link.a.node);
    const b = deps.nodeById(link.b.node);
    if (a === null || b === null) return boardMenu(deps);
    return linkMenu(deps, link, a, b);
  }
  return worldMenu(deps, at);
}
