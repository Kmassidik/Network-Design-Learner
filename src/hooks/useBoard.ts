import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  canRedo,
  canUndo,
  commit,
  redo,
  replace,
  startHistory,
  undo,
  type BoardSnapshot,
  type History,
} from '../history';
import { Network } from '../sim/engine';
import type { ArpEntry, MacEntry, NodeStats } from '../sim/engine-types';
import { KIND_PREFIX, defaultConfig } from '../sim/kinds';
import type { Board } from '../sim/lesson';
import { DEFAULT_PRESET, PRESETS, type Preset } from '../sim/presets';
import {
  addressedPorts,
  sharedMediums,
  wiringFor,
  type Medium,
  type NodeConfig,
  type NodeKind,
  type SimLink,
  type SimNode,
  type Wiring,
} from '../sim/types';
import type { RunControl } from './useRun';

/** The first interface on this device with no cable in it. */
function freePort(node: SimNode, links: readonly SimLink[]): string | null {
  const used = new Set(
    links.flatMap((link) => [
      ...(link.a.node === node.id ? [link.a.port] : []),
      ...(link.b.node === node.id ? [link.b.port] : []),
    ]),
  );
  return node.config.ports.find((port) => !used.has(port.name))?.name ?? null;
}

export interface BoardHandle {
  /** What is on the board, and what of it is selected. */
  readonly nodes: readonly SimNode[];
  readonly links: readonly SimLink[];
  readonly selection: readonly string[];
  readonly nodeById: ReadonlyMap<string, SimNode>;
  readonly labelOf: (id: string) => string;
  /** Where the next ping is sent from and to, by id. */
  readonly fromId: string;
  readonly toId: string;
  readonly setFromId: (id: string) => void;
  readonly setToId: (id: string) => void;
  /** The devices those ids stand for: a deleted one falls back to the board. */
  readonly fromNode: SimNode | null;
  readonly toNode: SimNode | null;
  /** The address the ping is aimed at: the target's first interface that has one. */
  readonly targetIp: string | null;
  /** The template the board was loaded from, and the lesson that replaced it. */
  readonly preset: Preset;
  readonly activeLessonId: string | null;
  readonly loadPreset: (id: string) => void;
  /** Load a board and stand the reader on it, with nothing else carried over. */
  readonly openLesson: (board: Board) => void;
  readonly edit: (change: (current: BoardSnapshot) => BoardSnapshot, key?: string) => void;
  /** Choosing something is not an edit, so it never fills the undo stack. */
  readonly select: (ids: readonly string[]) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly addNode: (kind: NodeKind, at?: { readonly x: number; readonly y: number }) => void;
  readonly moveNodes: (
    positions: readonly { readonly id: string; readonly x: number; readonly y: number }[],
    token: number,
  ) => void;
  readonly changeConfig: (id: string, config: NodeConfig) => void;
  readonly changeLink: (id: string, change: { medium?: Medium; wiring?: Wiring }) => void;
  readonly connect: (aId: string, bId: string) => void;
  readonly deleteSelected: () => void;
  /** Throw away every address the engine has learned, so the next ping looks again. */
  readonly forgetAddresses: () => void;
  /** What the engine has learned about one device: the tables the inspector shows. */
  readonly arpTable: (id: string) => readonly ArpEntry[];
  readonly macTable: (id: string) => readonly MacEntry[];
  readonly flowCount: (id: string) => number;
  readonly statsFor: (id: string) => NodeStats | null;
  /** Bumped when the canvas has to frame the board again, and the way to bump it. */
  readonly refitToken: number;
  readonly refit: () => void;
  /** The engine the run pings through. */
  readonly engine: RefObject<Network | null>;
  /**
   * Where the run leaves the ways it can be stopped. The board is made before
   * the run, because the run reads the board, but loading a board or deleting a
   * device has to stop a run, so the board has to be able to reach it.
   */
  readonly runRef: RefObject<RunControl | null>;
}

/**
 * The board itself: the devices and the cables, what is selected, the history
 * that makes every change undoable, and the engine that runs on it. It answers
 * "what is here and what has been done to it", which is a different question
 * from what a ping does on it, and it changes for different reasons.
 */
export function useBoard(): BoardHandle {
  const [presetId, setPresetId] = useState(DEFAULT_PRESET.id);
  const preset = PRESETS.find((candidate) => candidate.id === presetId) ?? DEFAULT_PRESET;
  const [history, setHistory] = useState<History>(() =>
    startHistory({
      nodes: DEFAULT_PRESET.topology.nodes,
      links: DEFAULT_PRESET.topology.links,
      selection: [DEFAULT_PRESET.pingFrom],
    }),
  );
  const { nodes, links, selection } = history.present;
  const [fromId, setFromId] = useState(preset.pingFrom);
  const [toId, setToId] = useState(preset.pingTo);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [refitToken, setRefitToken] = useState(0);

  /* The engine is mutable state that lives outside React, so a frame-by-frame
     run never re-renders anything. */
  const engine = useRef<Network | null>(null);
  if (engine.current === null) engine.current = new Network(DEFAULT_PRESET.topology);

  const serial = useRef(preset.topology.nodes.length);
  const linkCounter = useRef(preset.topology.links.length);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const labelOf = useCallback((id: string) => nodeById.get(id)?.label ?? id, [nodeById]);

  useEffect(() => {
    engine.current?.setTopology({ nodes, links });
  }, [nodes, links]);

  /* A device that has been deleted cannot stay the source of the next ping. */
  const fromNode = nodeById.get(fromId) ?? nodes[0] ?? null;
  const toNode = nodeById.get(toId) ?? nodes[1] ?? nodes[0] ?? null;
  const targetIp = toNode === null ? null : (addressedPorts(toNode.config)[0]?.ip ?? null);

  /* The ways the run on this board can be stopped, left for the run to fill in. */
  const runRef = useRef<RunControl | null>(null);
  const resetRun = useCallback(() => runRef.current?.reset(), []);
  const clearRun = useCallback(() => runRef.current?.clear(), []);
  const notify = useCallback((message: string | null) => runRef.current?.notify(message), []);

  /**
   * A change to the board. `key` names it so that a run of related changes, a
   * drag or a typed address, becomes one undo step rather than a hundred.
   */
  const edit = useCallback(
    (change: (current: BoardSnapshot) => BoardSnapshot, key?: string) => {
      setHistory((current) => commit(current, change(current.present), key));
    },
    [],
  );

  /** Choosing something is not an edit, so it never fills the undo stack. */
  const select = useCallback((ids: readonly string[]) => {
    setHistory((current) => replace(current, { ...current.present, selection: ids }));
  }, []);

  const undoStep = useCallback(() => setHistory(undo), []);
  const redoStep = useCallback(() => setHistory(redo), []);

  /** The canvas has just changed size or the board has been replaced, so frame it again. */
  const refit = useCallback(() => setRefitToken((current) => current + 1), []);

  /** Load a board and stand the reader on it, with nothing else carried over. */
  const openLesson = useCallback(
    (board: Board) => {
      engine.current?.reset();
      serial.current = board.topology.nodes.length;
      linkCounter.current = board.topology.links.length;
      edit(() => ({
        nodes: board.topology.nodes,
        links: board.topology.links,
        selection: [board.goal.from],
      }));
      setActiveLessonId(board.id);
      setFromId(board.goal.from);
      setToId(board.goal.to);
      resetRun();
      refit();
    },
    [edit, resetRun, refit],
  );

  const loadPreset = useCallback(
    (id: string) => {
      const next = PRESETS.find((candidate) => candidate.id === id);
      if (next === undefined) return;
      engine.current?.reset();
      serial.current = next.topology.nodes.length;
      linkCounter.current = next.topology.links.length;
      setActiveLessonId(null);
      setPresetId(next.id);
      edit(() => ({
        nodes: next.topology.nodes,
        links: next.topology.links,
        selection: [next.pingFrom],
      }));
      setFromId(next.pingFrom);
      setToId(next.pingTo);
      resetRun();
    },
    [edit, resetRun],
  );

  const moveNodes = useCallback(
    (
      positions: readonly { readonly id: string; readonly x: number; readonly y: number }[],
      token: number,
    ) => {
      const byId = new Map(positions.map((item) => [item.id, item]));
      // Every report from one drag shares a key, so the whole drag is one step.
      edit(
        (current) => ({
          ...current,
          nodes: current.nodes.map((node) => {
            const moved = byId.get(node.id);
            return moved === undefined ? node : { ...node, x: moved.x, y: moved.y };
          }),
        }),
        `move:${token}`,
      );
    },
    [edit],
  );

  const changeConfig = useCallback(
    (id: string, config: NodeConfig) => {
      // Changing an address makes every stored address stale, so the next ping
      // has to look them up again.
      engine.current?.forgetAddresses();
      edit(
        (current) => ({
          ...current,
          nodes: current.nodes.map((node) => (node.id === id ? { ...node, config } : node)),
        }),
        `config:${id}`,
      );
    },
    [edit],
  );

  const changeLink = useCallback(
    (id: string, change: { medium?: Medium; wiring?: Wiring }) => {
      edit(
        (current) => ({
          ...current,
          links: current.links.map((link) => (link.id === id ? { ...link, ...change } : link)),
        }),
        `link:${id}`,
      );
    },
    [edit],
  );

  const connect = useCallback(
    (aId: string, bId: string) => {
      const a = nodeById.get(aId);
      const b = nodeById.get(bId);
      if (a === undefined || b === undefined || aId === bId) return;
      const already = links.some(
        (link) =>
          (link.a.node === aId && link.b.node === bId) || (link.a.node === bId && link.b.node === aId),
      );
      if (already) {
        notify(`${a.label} and ${b.label} already have a cable between them.`);
        return;
      }
      const aPort = freePort(a, links);
      const bPort = freePort(b, links);
      if (aPort === null || bPort === null) {
        const full = aPort === null ? a : b;
        notify(`${full.label} has a cable in every one of its ports.`);
        return;
      }
      const shared = sharedMediums(a.kind, b.kind);
      const medium = shared.includes('utp') ? 'utp' : shared[0];
      if (medium === undefined) {
        notify(`${a.label} and ${b.label} have no kind of cable in common.`);
        return;
      }
      linkCounter.current += 1;
      notify(null);
      edit((current) => ({
        ...current,
        links: [
          ...current.links,
          {
            id: `l${linkCounter.current}`,
            a: { node: aId, port: aPort },
            b: { node: bId, port: bPort },
            medium,
            // Wired the way round that works, so a cable drawn by hand behaves
            // like one a person would plug in. Changing it is how the rule shows.
            wiring: wiringFor(a.kind, b.kind),
          },
        ],
      }));
    },
    [links, nodeById, edit, notify],
  );

  const addNode = useCallback(
    (kind: NodeKind, at?: { readonly x: number; readonly y: number }) => {
      serial.current += 1;
      const id = `n${serial.current}`;
      const peers = nodes.filter((node) => node.kind === kind).length;
      const rightmost = nodes.reduce((x, node) => Math.max(x, node.x), 0);
      const topmost = nodes.reduce((y, node) => Math.min(y, node.y), 260);
      const node: SimNode = {
        id,
        kind,
        label: `${KIND_PREFIX[kind]}${peers + 1}`,
        // Placed where the reader asked for it, or beyond the last one when the
        // palette is how they asked.
        x: at?.x ?? (nodes.length === 0 ? 320 : rightmost + 300),
        y: at?.y ?? topmost,
        config: defaultConfig(kind, serial.current, peers),
      };
      edit((current) => ({
        ...current,
        nodes: [...current.nodes, node],
        selection: [node.id],
      }));
    },
    [nodes, edit],
  );

  const deleteSelected = useCallback(() => {
    if (selection.length === 0) return;
    const going = new Set(selection);
    edit((current) => ({
      nodes: current.nodes.filter((node) => !going.has(node.id)),
      links: current.links.filter(
        (link) => !going.has(link.id) && !going.has(link.a.node) && !going.has(link.b.node),
      ),
      selection: [],
    }));
    clearRun();
  }, [selection, edit, clearRun]);

  const forgetAddresses = useCallback(() => {
    engine.current?.forgetAddresses();
  }, []);

  const arpTable = useCallback((id: string) => engine.current?.arpTable(id) ?? [], []);
  const macTable = useCallback((id: string) => engine.current?.macTable(id) ?? [], []);
  const flowCount = useCallback((id: string) => engine.current?.flowCount(id) ?? 0, []);
  const statsFor = useCallback(
    (id: string): NodeStats | null => engine.current?.statsFor(id) ?? null,
    [],
  );

  return {
    nodes,
    links,
    selection,
    nodeById,
    labelOf,
    fromId,
    toId,
    setFromId,
    setToId,
    fromNode,
    toNode,
    targetIp,
    preset,
    activeLessonId,
    loadPreset,
    openLesson,
    edit,
    select,
    undo: undoStep,
    redo: redoStep,
    canUndo: canUndo(history),
    canRedo: canRedo(history),
    addNode,
    moveNodes,
    changeConfig,
    changeLink,
    connect,
    deleteSelected,
    forgetAddresses,
    arpTable,
    macTable,
    flowCount,
    statsFor,
    refitToken,
    refit,
    engine,
    runRef,
  };
}
