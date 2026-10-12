import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { NODE_H, NODE_W } from '../../device-size';
import type { SimNode } from '../../sim/types';
import type { Point, View } from './canvas-types';

/** How far the wheel can take the view. */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
/** How large framing a topology will make it before it stops growing. */
const MAX_FIT = 1.8;

export interface CanvasView {
  readonly view: View;
  readonly setView: (next: View) => void;
  /** Frame the whole board, never shrinking a device below `minScale`. */
  readonly fitView: (minScale: number) => void;
  /** Zoom about the middle, for the options menu. */
  readonly zoomByButton: (factor: number) => void;
  /** A point on the screen as a point on the board. */
  readonly toWorld: (x: number, y: number) => Point;
}

/**
 * Where the view is: framing, zooming, panning and the wheel. It answers the
 * question "what part of the board is on screen", which is a different question
 * from what the pointer does with it, and it changes for different reasons.
 */
export function useCanvasView(
  nodes: readonly SimNode[],
  hostRef: RefObject<HTMLDivElement | null>,
  surfaceRef: RefObject<SVGSVGElement | null>,
  refitToken: number,
): CanvasView {
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });

  const fitView = useCallback(
    (minScale: number) => {
      const host = hostRef.current;
      if (host === null || nodes.length === 0) return;
      const bounds = host.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of nodes) {
        minX = Math.min(minX, node.x - NODE_W / 2);
        maxX = Math.max(maxX, node.x + NODE_W / 2);
        minY = Math.min(minY, node.y - NODE_H / 2);
        maxY = Math.max(maxY, node.y + NODE_H / 2);
      }
      const padding = 40;
      const k = Math.max(
        minScale,
        Math.min(
          MAX_FIT,
          (bounds.width - padding * 2) / Math.max(1, maxX - minX),
          (bounds.height - padding * 2) / Math.max(1, maxY - minY),
        ),
      );
      setView({
        k,
        x: bounds.width / 2 - ((minX + maxX) / 2) * k,
        y: bounds.height / 2 - ((minY + maxY) / 2) * k,
      });
    },
    [nodes, hostRef],
  );

  /* Frame the topology the first time, and again whenever a device is added: a
     new device is placed beyond the last one, which is off screen unless the
     view follows it. Moving a device or deleting one does not refit, because
     the reader owns the view by then. */
  const framedFor = useRef(0);
  useEffect(() => {
    if (nodes.length === 0 || nodes.length <= framedFor.current) return;
    framedFor.current = nodes.length;
    fitView(1);
  }, [nodes.length, fitView]);

  /* A refit asked for from outside, when the canvas itself has just changed size
     because the panels were hidden or shown. The latest fitView is kept in a ref
     so this runs on the request alone, not on every change to the board. */
  const latestFit = useRef(fitView);
  useEffect(() => {
    latestFit.current = fitView;
  }, [fitView]);

  useEffect(() => {
    if (refitToken === 0) return;
    latestFit.current(1);
  }, [refitToken]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((current) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
      const worldX = (px - current.x) / current.k;
      const worldY = (py - current.y) / current.k;
      return { k, x: px - worldX * k, y: py - worldY * k };
    });
  }, []);

  const zoomByButton = useCallback(
    (factor: number) => {
      const bounds = hostRef.current?.getBoundingClientRect();
      zoomAt(factor, (bounds?.width ?? 0) / 2, (bounds?.height ?? 0) / 2);
    },
    [hostRef, zoomAt],
  );

  const toWorld = useCallback(
    (x: number, y: number) => ({ x: (x - view.x) / view.k, y: (y - view.y) / view.k }),
    [view],
  );

  /* Native listener, because React registers wheel as passive and a passive
     listener may not cancel the page scroll it would otherwise cause. */
  useEffect(() => {
    const surface = surfaceRef.current;
    if (surface === null) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const bounds = surface.getBoundingClientRect();
      zoomAt(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
    };
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => surface.removeEventListener('wheel', onWheel);
  }, [surfaceRef, zoomAt]);

  return { view, setView, fitView, zoomByButton, toWorld };
}
