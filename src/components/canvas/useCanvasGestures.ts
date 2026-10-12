import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { NODE_H, NODE_W } from '../../device-size';
import { idsInRect, rectBetween, rectIsEmpty, type Point, type Rect } from '../../sim/select';
import type { SimNode } from '../../sim/types';
import type { Hit, View } from './canvas-types';

/** How far the pointer must travel before a press becomes a move. */
const PROMOTE_PX = 4;
/** Anything inside this is interface, not canvas, and must not start a gesture. */
const CHROME = 'button, input, select, textarea, a, [data-chrome]';

type Gesture =
  | {
      readonly pointerId: number;
      readonly mode: 'pan';
      /** What the press landed on, resolved before any capture retargets events. */
      readonly hit: Hit;
      readonly startX: number;
      readonly startY: number;
      readonly viewX: number;
      readonly viewY: number;
      moved: boolean;
      captured: boolean;
    }
  | {
      readonly pointerId: number;
      readonly mode: 'drag';
      /** Every device being moved, where it was when the drag started. */
      readonly origin: readonly { readonly id: string; readonly x: number; readonly y: number }[];
      /** Names this drag, so every report from it becomes one undo step. */
      readonly token: number;
      readonly startX: number;
      readonly startY: number;
      moved: boolean;
      captured: boolean;
    }
  | {
      /** A press in wiring mode. It stays a press however far the pointer
       * travels, because a hand that moves by a few pixels while clicking must
       * not turn "pick this device" into "drag this device" and lose the cable.
       */
      readonly pointerId: number;
      readonly mode: 'press';
      readonly nodeId: string;
      readonly startX: number;
      readonly startY: number;
    }
  | {
      /** A sweep across empty space, gathering everything it touches. */
      readonly pointerId: number;
      readonly mode: 'marquee';
      /** Where it started, on the board. */
      readonly from: Point;
      readonly startX: number;
      readonly startY: number;
      /** True when shift was held, which adds to the selection instead of replacing it. */
      readonly additive: boolean;
      moved: boolean;
      captured: boolean;
    };

/**
 * Resolve a press to a device or a cable in one place. Every hit target carries
 * `data-hit` and `data-id`, so the canvas never has to guess from geometry and
 * the two can never disagree.
 */
function hitTest(target: EventTarget | null): Hit {
  if (!(target instanceof Element)) return { kind: 'world' };
  const marked = target.closest('[data-hit]');
  const id = marked?.getAttribute('data-id');
  const kind = marked?.getAttribute('data-hit');
  if (id !== undefined && id !== null && (kind === 'node' || kind === 'link')) return { kind, id };
  return { kind: 'world' };
}

/** Everything the pointer needs to know about the board it is working on. */
export interface GestureDeps {
  readonly nodes: readonly SimNode[];
  readonly view: View;
  readonly setView: (next: View) => void;
  readonly selectedIds: readonly string[];
  readonly onSelectionChange: (ids: readonly string[]) => void;
  readonly onMoveNodes: (
    positions: readonly { readonly id: string; readonly x: number; readonly y: number }[],
    token: number,
  ) => void;
  readonly onConnect: (from: string, to: string) => void;
  readonly wireMode: boolean;
  readonly wireFrom: string | null;
  readonly setWireMode: (on: boolean) => void;
  readonly setWireFrom: (id: string | null) => void;
  /** A press on the board closes any open menu. */
  readonly clearMenu: () => void;
  readonly hostRef: RefObject<HTMLDivElement | null>;
  readonly surfaceRef: RefObject<SVGSVGElement | null>;
}

/** What the pointer is doing, for the board to draw. */
export interface Gestures {
  readonly hovered: { readonly kind: 'node' | 'link'; readonly id: string } | null;
  readonly wirePoint: Point | null;
  readonly marquee: Rect | null;
  readonly panning: boolean;
  readonly spaceHeld: boolean;
  /** The pointer left the board: nothing is under it any more. */
  readonly clearHover: () => void;
  readonly onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onContextMenu: (
    event: ReactPointerEvent<SVGSVGElement>,
    openMenu: (at: { x: number; y: number }, hit: Hit) => void,
  ) => void;
}

/**
 * The gesture machine: what a press, a drag and a lift mean on the board. It
 * owns the transient state a gesture leaves behind (hover, the rubber band of a
 * half drawn cable, the sweep box) and reports everything it cannot decide by
 * itself back through `deps`.
 */
export function useCanvasGestures(deps: GestureDeps): Gestures {
  const {
    nodes,
    view,
    setView,
    selectedIds,
    onSelectionChange,
    onMoveNodes,
    onConnect,
    wireMode,
    wireFrom,
    setWireMode,
    setWireFrom,
    clearMenu,
    hostRef,
    surfaceRef,
  } = deps;

  const gestureRef = useRef<Gesture | null>(null);
  /** What the pointer is over, so the board answers a mouse before it is clicked. */
  const [hovered, setHovered] = useState<{ kind: 'node' | 'link'; id: string } | null>(null);
  /** Where the pointer is while a cable is being drawn, in world units. */
  const [wirePoint, setWirePoint] = useState<Point | null>(null);
  /** True while the space bar is held, which turns a drag into a pan. */
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** The box being swept across the board, in world units. */
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [panning, setPanning] = useState(false);
  /** Counts drags, so each one is a separate step in the undo history. */
  const dragCount = useRef(0);

  /** A point on the screen as a point on the board. */
  const toWorld = (x: number, y: number) => ({ x: (x - view.x) / view.k, y: (y - view.y) / view.k });

  /* The space bar turns any drag into a pan, which is what every drawing tool
     does, and the middle button pans without it. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof Element && event.target.closest('input, textarea, select') !== null;
      if (typing) return;
      if (event.code === 'Space') setSpaceHeld(event.type === 'keydown');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  /* Escape abandons a cable that is being drawn, so the wiring mode never
     traps the reader in a mode they cannot leave. */
  useEffect(() => {
    if (wireFrom === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setWireFrom(null);
        setWireMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wireFrom, setWireFrom, setWireMode]);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.target instanceof Element && event.target.closest(CHROME) !== null) return;
    const hit = hitTest(event.target);
    clearMenu();

    // The middle button pans, and so does any drag while space is held, which is
    // what every drawing tool does. Neither of them picks anything up.
    if (event.button === 1 || spaceHeld) {
      gestureRef.current = {
        pointerId: event.pointerId,
        mode: 'pan',
        hit,
        startX: event.clientX,
        startY: event.clientY,
        viewX: view.x,
        viewY: view.y,
        moved: false,
        captured: false,
      };
      return;
    }

    /** Shift, ctrl or cmd adds to the selection rather than replacing it. */
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;

    if (hit.kind === 'node') {
      const next = !additive
        ? selectedIds.includes(hit.id)
          ? selectedIds
          : [hit.id]
        : selectedIds.includes(hit.id)
          ? selectedIds.filter((id) => id !== hit.id)
          : [...selectedIds, hit.id];
      onSelectionChange(next);

      if (wireMode) {
        gestureRef.current = {
          pointerId: event.pointerId,
          mode: 'press',
          nodeId: hit.id,
          startX: event.clientX,
          startY: event.clientY,
        };
        return;
      }

      // The whole selection moves together, so a drag has to know where every
      // device in it started.
      const group = nodes.filter((node) => next.includes(node.id));
      dragCount.current += 1;
      gestureRef.current = {
        pointerId: event.pointerId,
        mode: 'drag',
        origin: group.map((node) => ({ id: node.id, x: node.x, y: node.y })),
        token: dragCount.current,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        captured: false,
      };
      return;
    }

    if (hit.kind === 'link') {
      onSelectionChange(additive ? [...selectedIds, hit.id] : [hit.id]);
    }

    // Empty space, or a cable: a click clears the selection, a sweep gathers
    // whatever it touches.
    const bounds = surfaceRef.current?.getBoundingClientRect();
    gestureRef.current = {
      pointerId: event.pointerId,
      mode: 'marquee',
      from: toWorld(event.clientX - (bounds?.left ?? 0), event.clientY - (bounds?.top ?? 0)),
      startX: event.clientX,
      startY: event.clientY,
      additive,
      moved: false,
      captured: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null) {
      // Nothing is being dragged, so this is the board answering the pointer:
      // which device or cable is under it, and where a half drawn cable would
      // end if it were clicked now.
      const hit = hitTest(event.target);
      const next = hit.kind === 'world' ? null : { kind: hit.kind, id: hit.id };
      setHovered((current) =>
        current?.kind === next?.kind && current?.id === next?.id ? current : next,
      );
      if (wireMode && wireFrom !== null) {
        const bounds = surfaceRef.current?.getBoundingClientRect();
        if (bounds !== undefined) {
          setWirePoint({
            x: (event.clientX - bounds.left - view.x) / view.k,
            y: (event.clientY - bounds.top - view.y) / view.k,
          });
        }
      }
      return;
    }
    if (gesture.mode === 'press') return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.moved && Math.abs(dx) < PROMOTE_PX && Math.abs(dy) < PROMOTE_PX) return;
    if (!gesture.captured) {
      gesture.captured = true;
      // Capture only once the press is certainly a move: taking it on
      // pointerdown is what stops the browser's own click from ever arriving.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer can be gone already, which is not worth reporting.
      }
    }
    gesture.moved = true;

    if (gesture.mode === 'marquee') {
      const bounds = surfaceRef.current?.getBoundingClientRect();
      setMarquee(
        rectBetween(
          gesture.from,
          toWorld(event.clientX - (bounds?.left ?? 0), event.clientY - (bounds?.top ?? 0)),
        ),
      );
      return;
    }
    if (gesture.mode === 'drag') {
      onMoveNodes(
        gesture.origin.map((item) => ({
          id: item.id,
          x: item.x + dx / view.k,
          y: item.y + dy / view.k,
        })),
        gesture.token,
      );
      return;
    }
    setPanning(true);
    setView({ x: gesture.viewX + dx, y: gesture.viewY + dy, k: view.k });
  };

  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    setPanning(false);

    if (gesture.mode === 'press') {
      // Where the pointer came up decides the other end, so a drag from one
      // device onto another draws the cable in one movement, while a plain
      // click falls back to picking them one at a time.
      const released = hitTest(event.target);
      const from = gesture.nodeId;
      const onto = released.kind === 'node' ? released.id : from;
      if (onto !== from) {
        onConnect(from, onto);
        setWireFrom(null);
        return;
      }
      if (wireFrom === null) setWireFrom(from);
      else if (wireFrom === from) setWireFrom(null);
      else {
        onConnect(wireFrom, from);
        setWireFrom(null);
      }
      return;
    }

    if (gesture.mode === 'marquee') {
      setMarquee(null);
      const bounds = surfaceRef.current?.getBoundingClientRect();
      const box = rectBetween(
        gesture.from,
        toWorld(event.clientX - (bounds?.left ?? 0), event.clientY - (bounds?.top ?? 0)),
      );
      if (!gesture.moved || rectIsEmpty(box)) {
        // A click on empty space, which clears the selection rather than
        // sweeping anything.
        if (!gesture.additive) onSelectionChange([]);
        return;
      }
      const swept = idsInRect(nodes, box, { width: NODE_W, height: NODE_H });
      onSelectionChange(gesture.additive ? [...new Set([...selectedIds, ...swept])] : swept);
      return;
    }

    // A click on a device or a cable was dealt with on the way down.
    if (gesture.moved) return;
  };

  const clearHover = () => {
    setHovered(null);
    setWirePoint(null);
  };

  const onContextMenu = (
    event: ReactPointerEvent<SVGSVGElement>,
    openMenu: (at: { x: number; y: number }, hit: Hit) => void,
  ) => {
    event.preventDefault();
    if (event.target instanceof Element && event.target.closest(CHROME) !== null) return;
    const bounds = hostRef.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const hit = hitTest(event.target);
    // Right clicking an object picks it up, the way a drawing tool does, so the
    // menu and the selection are never about two different things.
    if (hit.kind === 'node' || hit.kind === 'link') onSelectionChange([hit.id]);
    gestureRef.current = null;
    setPanning(false);
    openMenu(at, hit);
  };

  return {
    hovered,
    wirePoint,
    marquee,
    panning,
    spaceHeld,
    clearHover,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onContextMenu,
  };
}
