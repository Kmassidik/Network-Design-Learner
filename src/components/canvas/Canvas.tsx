import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from 'react';
import { packetsAt, type PacketSegment } from '../../sim/playback';
import { linkCarries, type SimLink, type SimNode } from '../../sim/types';
import { ContextMenu, type MenuSection } from './ContextMenu';
import { LinkView, NodeView } from './canvas-views';
import type { CanvasAction } from './canvas-types';
import { boardMenu, menuForHit, type MenuDeps } from './canvas-menus';
import { useCanvasGestures } from './useCanvasGestures';
import { useCanvasView } from './useCanvasView';
import './Canvas.css';

export interface CanvasProps {
  readonly nodes: readonly SimNode[];
  readonly links: readonly SimLink[];
  /** Everything currently chosen: devices and cables together. */
  readonly selectedIds: readonly string[];
  /** The whole selection, after a click, a shift click or a sweep. */
  readonly onSelectionChange: (ids: readonly string[]) => void;
  /** New positions for every device being dragged, with a token per drag so the shell can record one step. */
  readonly onMoveNodes: (
    positions: readonly { readonly id: string; readonly x: number; readonly y: number }[],
    token: number,
  ) => void;
  readonly onConnect: (a: string, b: string) => void;
  readonly segments: readonly PacketSegment[];
  /** Devices the selected one can reach without a router. */
  readonly relatedIds: readonly string[];
  /** Where the run ends on the clock, in ms. */
  readonly totalMs: number;
  readonly playing: boolean;
  readonly slowdown: number;
  /** A seek target plus a token that changes on every seek, so the clock restarts. */
  readonly seek: { readonly ms: number; readonly token: number };
  /** Bumped by the shell when the canvas changes size, to frame it again. */
  readonly refitToken: number;
  /** What the menus ask the shell to do. */
  readonly onAction: (action: CanvasAction) => void;
  readonly onTick: (timeMs: number) => void;
  readonly onFinish: () => void;
}

export function Canvas({
  nodes,
  links,
  selectedIds,
  onSelectionChange,
  onMoveNodes,
  onConnect,
  segments,
  relatedIds,
  totalMs,
  playing,
  slowdown,
  seek,
  refitToken,
  onAction,
  onTick,
  onFinish,
}: CanvasProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<SVGSVGElement | null>(null);
  const packetEls = useRef<(SVGCircleElement | null)[]>([]);
  const [wireMode, setWireMode] = useState(false);
  const [wireFrom, setWireFrom] = useState<string | null>(null);
  /** The open right click menu, in the coordinates of the container. */
  const [menu, setMenu] = useState<{
    readonly x: number;
    readonly y: number;
    readonly sections: readonly MenuSection[];
  } | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  /** The device a half drawn cable starts from, if there is one. */
  const wireSource = wireFrom === null ? null : (nodeById.get(wireFrom) ?? null);

  const { view, setView, fitView, zoomByButton, toWorld } = useCanvasView(
    nodes,
    hostRef,
    surfaceRef,
    refitToken,
  );

  const gestures = useCanvasGestures({
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
    clearMenu: () => setMenu(null),
    hostRef,
    surfaceRef,
  });

  /** Everything the menus need to describe themselves. */
  const menuDeps: MenuDeps = {
    wireMode,
    startWiring: (id) => {
      setWireMode(true);
      setWireFrom(id);
    },
    toggleWiring: () => {
      setWireMode(!wireMode);
      setWireFrom(null);
    },
    fit: () => fitView(0.4),
    zoom: zoomByButton,
    toWorld,
    nodeById: (id) => nodeById.get(id) ?? null,
    linkById: (id) => links.find((candidate) => candidate.id === id) ?? null,
    onAction,
  };

  /** The options button, which offers the board itself rather than a thing on it. */
  const openBoardMenu = (button: HTMLButtonElement) => {
    const bounds = hostRef.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    const rect = button.getBoundingClientRect();
    setMenu({
      x: rect.right - bounds.left - 200,
      y: rect.top - bounds.top - 8,
      sections: boardMenu(menuDeps),
    });
  };

  /* The playback clock. The playhead is painted onto the packet elements
     directly: the canvas is the only thing that has to update every frame, and
     the log and the scrubber are told about it ten times a second. */
  useEffect(() => {
    const paint = (timeMs: number) => {
      const elements = packetEls.current;
      for (const element of elements) element?.setAttribute('opacity', '0');
      for (const packet of packetsAt(segments, timeMs)) {
        const element = elements[packet.index];
        const segment = segments[packet.index];
        if (element === null || element === undefined || segment === undefined) continue;
        const from = nodeById.get(segment.from);
        const to = nodeById.get(segment.to);
        if (from === undefined || to === undefined) continue;
        element.setAttribute(
          'transform',
          `translate(${from.x + (to.x - from.x) * packet.progress} ${from.y + (to.y - from.y) * packet.progress})`,
        );
        element.setAttribute('opacity', '1');
      }
    };

    paint(seek.ms);
    if (!playing || totalMs === 0) return;

    let frame = 0;
    const startedWall = performance.now();
    const startedSim = seek.ms;
    let reportedAt = startedWall;
    const step = (now: number) => {
      const timeMs = Math.min(startedSim + (now - startedWall) / slowdown, totalMs);
      paint(timeMs);
      if (now - reportedAt > 100) {
        reportedAt = now;
        onTick(timeMs);
      }
      if (timeMs >= totalMs) {
        onTick(totalMs);
        onFinish();
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [segments, nodeById, totalMs, playing, slowdown, seek, onTick, onFinish]);

  const grid = (
    <defs>
      <pattern id="cv-grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path className="cv-grid-line" d="M 40 0 L 0 0 0 40" fill="none" />
      </pattern>
    </defs>
  );

  return (
    <div className="cv" ref={hostRef}>
      <svg
        className="cv-surface"
        ref={surfaceRef}
        data-panning={gestures.panning}
        data-pan={gestures.spaceHeld ? 'ready' : undefined}
        data-wire={wireMode ? 'on' : undefined}
        aria-label={`Network canvas: ${nodes.length} devices, ${links.length} cables`}
        onPointerDown={gestures.onPointerDown}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.onPointerUp}
        onPointerCancel={gestures.onPointerUp}
        onContextMenu={(event: ReactPointerEvent<SVGSVGElement>) =>
          gestures.onContextMenu(event, (at, hit) =>
            setMenu({ ...at, sections: menuForHit(menuDeps, hit, at) }),
          )
        }
        onPointerLeave={() => gestures.clearHover()}
      >
        {grid}
        <rect
          className="cv-backdrop"
          data-hit="world"
          x={-4000}
          y={-4000}
          width={8000}
          height={8000}
          fill="url(#cv-grid)"
        />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {links.map((link) => {
            const from = nodeById.get(link.a.node);
            const to = nodeById.get(link.b.node);
            if (from === undefined || to === undefined) return null;
            return (
              <LinkView
                key={link.id}
                link={link}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                selected={selectedIds.includes(link.id)}
                hovered={gestures.hovered?.kind === 'link' && gestures.hovered.id === link.id}
                carries={linkCarries(link, from, to)}
              />
            );
          })}
          {/*
           * The cable being drawn. Without it, wiring mode gives the pointer no
           * answer at all: you click a device and then move the mouse over a
           * board that looks exactly as it did before.
           */}
          {wireSource !== null && gestures.wirePoint !== null ? (
            <line
              className="cv-rubber"
              x1={wireSource.x}
              y1={wireSource.y}
              x2={gestures.wirePoint.x}
              y2={gestures.wirePoint.y}
            />
          ) : null}
          {segments.map((segment, index) => (
            <circle
              key={`${segment.linkId}-${index}`}
              className="cv-packet"
              data-frame={segment.frame}
              r={7}
              opacity={0}
              ref={(element) => {
                packetEls.current[index] = element;
              }}
            />
          ))}
          {nodes.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              selected={selectedIds.includes(node.id)}
              hovered={gestures.hovered?.kind === 'node' && gestures.hovered.id === node.id}
              wiring={wireFrom === node.id}
              related={relatedIds.includes(node.id)}
            />
          ))}
          {/* On top of the devices, so a sweep reads as a region rather than as
              something the devices are hiding. */}
          {gestures.marquee === null ? null : (
            <rect
              className="cv-marquee"
              x={gestures.marquee.x}
              y={gestures.marquee.y}
              width={gestures.marquee.width}
              height={gestures.marquee.height}
            />
          )}
        </g>
      </svg>

      {/*
       * The only chrome the board keeps: where the zoom is, and one button for
       * everything else. Cables, framing and zooming are in its menu, and so are
       * the actions on a particular device or cable, which are reached by right
       * clicking the thing itself.
       */}
      <div className="cv-tools" data-chrome>
        <span className="cv-zoom num">{Math.round(view.k * 100)}%</span>
        <button
          type="button"
          className="cv-tool"
          aria-label="Board options"
          aria-haspopup="menu"
          aria-expanded={menu !== null}
          onClick={(event) => openBoardMenu(event.currentTarget)}
        >
          &#8943;
        </button>
      </div>

      {menu === null ? null : (
        <ContextMenu
          at={{ x: menu.x, y: menu.y }}
          sections={menu.sections}
          onClose={() => setMenu(null)}
        />
      )}

      {wireMode ? (
        <p className="cv-hint" data-chrome>
          {wireFrom === null
            ? 'Click a device, or drag from one device to another. Escape cancels.'
            : 'Click the second device. Escape cancels.'}
        </p>
      ) : null}
    </div>
  );
}
