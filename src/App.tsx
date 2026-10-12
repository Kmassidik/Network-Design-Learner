import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { Canvas } from './components/canvas/Canvas';
import type { CanvasAction } from './components/canvas/canvas-types';
import { Correction } from './components/panels/Correction';
import { Inspector } from './components/panels/Inspector';
import { Lessons } from './components/panels/Lessons';
import { Palette } from './components/panels/Palette';
import { SimLog } from './components/playback/SimLog';
import { Timeline } from './components/playback/Timeline';
import { useBoard } from './hooks/useBoard';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';
import { useRun } from './hooks/useRun';
import { parseIpv4, sameSubnet } from './sim/ip';
import { checkGoal } from './sim/lesson';
import { FAULTS } from './sim/lessons-faults';
import { GUIDED } from './sim/lessons-guided';
import { PRESETS } from './sim/presets';
import { primaryPort } from './sim/types';
import './App.css';

/**
 * The shell: the topbar, the two rails and the stage, and the wiring between the
 * board, the run on it and the panels that show both. It draws and it hands
 * actions on; everything else lives in a hook of its own.
 */
export function App(): ReactElement {
  const [focus, setFocus] = useState(false);
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const reducedMotion = usePrefersReducedMotion();

  const boardHandle = useBoard();
  const {
    nodes,
    links,
    selection,
    nodeById,
    labelOf,
    fromNode,
    toNode,
    targetIp,
    preset,
    activeLessonId,
    setFromId,
    setToId,
    loadPreset,
    openLesson,
    select,
    undo,
    redo,
    canUndo,
    canRedo,
    addNode,
    moveNodes,
    connect,
    changeConfig,
    changeLink,
    deleteSelected,
    forgetAddresses,
    arpTable,
    macTable,
    flowCount,
    statsFor,
    refitToken,
    refit,
  } = boardHandle;
  const {
    run,
    playing,
    playheadMs,
    seek,
    notice,
    correction,
    visibleLines,
    caption,
    start,
    play,
    pause,
    restart,
    seekTo,
    onTick,
    onFinish,
    discard,
    clear,
  } = useRun({ board: boardHandle, reducedMotion });

  useEffect(() => {
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
  }, [dark]);

  const selectedNodes = nodes.filter((node) => selection.includes(node.id));
  const selectedLinks = links.filter((link) => selection.includes(link.id));
  /** The inspector shows one thing at a time, and counts when it is more. */
  const singleNode =
    selectedNodes.length === 1 && selectedLinks.length === 0 ? (selectedNodes[0] ?? null) : null;
  const singleLink =
    selectedLinks.length === 1 && selectedNodes.length === 0 ? (selectedLinks[0] ?? null) : null;
  const selectionCount = selectedNodes.length + selectedLinks.length;

  /**
   * The devices the selected one can reach without a router. This is the mask
   * doing its work, and it is worth showing: two addresses that look nothing
   * alike are neighbours when the mask is wide enough to cover both.
   */
  const related = useMemo(() => {
    if (singleNode === null) return [];
    const shown = primaryPort(singleNode.config);
    if (shown === null) return [];
    const address = parseIpv4(shown.ip);
    if (address === null) return [];
    return nodes.filter((other) => {
      if (other.id === singleNode.id) return false;
      const candidate = primaryPort(other.config);
      if (candidate === null) return false;
      const otherAddress = parseIpv4(candidate.ip);
      return otherAddress !== null && sameSubnet(address, otherAddress, shown.prefix);
    });
  }, [nodes, singleNode]);

  const neighbours = related.map((node) => node.label);
  const relatedIds = related.map((node) => node.id);

  const allBoards = useMemo(() => [...GUIDED, ...FAULTS], []);
  const activeLesson = allBoards.find((candidate) => candidate.id === activeLessonId) ?? null;

  /**
   * Whether the open board's ping arrives yet. Recomputed after every change to
   * the board, in the simulation's own terms, and on a network of its own so
   * that asking the question never disturbs the one on screen.
   */
  const goalResult = useMemo(
    () => (activeLesson === null ? null : checkGoal({ nodes, links }, activeLesson.goal)),
    [activeLesson, nodes, links],
  );

  /**
   * Hide everything that is not the board. The canvas has just changed size, so
   * it is told to frame the topology again rather than leaving it off centre.
   */
  const togglePanels = useCallback(() => {
    setFocus((current) => !current);
    refit();
  }, [refit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof Element && event.target.closest('input, textarea, select') !== null;
      if (typing) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || event.key === 'Y')) {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === 'f' || event.key === 'F') {
        togglePanels();
        return;
      }
      if (event.key === 'Escape' && focus) {
        setFocus(false);
        return;
      }
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (selection.length === 0) return;
      event.preventDefault();
      deleteSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection, deleteSelected, focus, togglePanels, undo, redo]);

  /** Everything the canvas menus ask for, in one place. */
  const onCanvasAction = useCallback(
    (action: CanvasAction) => {
      switch (action.kind) {
        case 'add':
          addNode(action.device, { x: action.x, y: action.y });
          return;
        case 'delete':
          deleteSelected();
          return;
        case 'pingFrom':
        case 'pingTo':
          if (action.kind === 'pingFrom') setFromId(action.id);
          else setToId(action.id);
          select([action.id]);
          return;
        case 'medium':
          changeLink(action.id, { medium: action.medium });
          return;
        case 'wiring':
          changeLink(action.id, { wiring: action.wiring });
          return;
        case 'forget':
          forgetAddresses();
          discard();
          return;
        case 'panels':
          togglePanels();
          return;
      }
    },
    [
      addNode,
      deleteSelected,
      changeLink,
      togglePanels,
      setFromId,
      setToId,
      select,
      forgetAddresses,
      discard,
    ],
  );

  return (
    <div className="app" data-focus={focus}>
      <header className="topbar">
        <div className="brand">
          <h1>Network Design Learner</h1>
          <p className="brand-sub">
            {nodes.length} devices, {links.length} cables
          </p>
        </div>
        <div className="topbar-actions">
          <label className="topbar-field">
            <span className="field-label">Template</span>
            <select
              className="select"
              value={preset.id}
              onChange={(event) => loadPreset(event.target.value)}
            >
              {PRESETS.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="btn" onClick={redo} disabled={!canRedo}>
            Redo
          </button>
          <button type="button" className="btn" onClick={() => setDark(!dark)}>
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </header>

      <div className="body">
        <aside className="rail rail-left">
          <Palette onAdd={addNode} />
        </aside>

        <main className="stage">
          <div className="stage-canvas">
            <Canvas
              nodes={nodes}
              links={links}
              selectedIds={selection}
              onSelectionChange={select}
              onMoveNodes={moveNodes}
              onConnect={connect}
              segments={run?.segments ?? []}
              relatedIds={relatedIds}
              totalMs={run?.totalMs ?? 0}
              playing={playing}
              slowdown={run?.slowdown ?? 1}
              seek={seek}
              refitToken={refitToken}
              onAction={onCanvasAction}
              onTick={onTick}
              onFinish={onFinish}
            />
            {/*
             * The two controls that have to survive hiding the panels: running
             * the scenario, and getting the panels back. Everything else lives
             * in a rail that can go away.
             */}
            <div className="stage-tools" data-chrome>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => start(true)}
                disabled={targetIp === null}
              >
                {targetIp === null ? 'Nowhere to ping' : `Ping ${targetIp}`}
              </button>
              {/*
               * The same run without the animation, so a reader can change one
               * thing, check, and be told what is still wrong. Watching the
               * frames is what Ping is for, and the timeline can replay either.
               */}
              <button
                type="button"
                className="btn"
                onClick={() => start(false)}
                disabled={targetIp === null}
              >
                Check
              </button>
            </div>
            {focus && caption !== null ? (
              <p className="stage-caption" data-tone={caption.tone} data-chrome>
                <span className="num">{caption.timeMs.toFixed(1)} ms</span> {caption.text}
              </p>
            ) : null}
          </div>
          {notice === null ? null : <p className="notice">{notice}</p>}
          {correction === null ? null : <Correction correction={correction} />}
          <Timeline
            totalMs={run?.totalMs ?? 0}
            playheadMs={playheadMs}
            playing={playing}
            slowdown={run?.slowdown ?? 1}
            result={run?.result ?? null}
            onPlay={play}
            onPause={pause}
            onRestart={restart}
            onSeek={seekTo}
          />
        </main>

        <aside className="rail rail-right">
          <Lessons
            guided={GUIDED}
            faults={FAULTS}
            active={activeLesson}
            goal={goalResult}
            onOpen={openLesson}
          />

          <Inspector
            node={singleNode}
            link={singleLink}
            selectionCount={selectionCount}
            onDeleteSelection={deleteSelected}
            labelOf={labelOf}
            nodeOf={(id) => nodeById.get(id) ?? null}
            neighbours={neighbours}
            arp={singleNode === null ? [] : arpTable(singleNode.id)}
            macs={singleNode === null ? [] : macTable(singleNode.id)}
            flows={singleNode === null ? 0 : flowCount(singleNode.id)}
            stats={singleNode === null ? null : statsFor(singleNode.id)}
            onChangeConfig={changeConfig}
            onChangeLink={changeLink}
            onClearAddresses={() => {
              forgetAddresses();
              clear();
            }}
          />

          {activeLesson === null ? (
            <section className="lesson section">
              <h2 className="rail-title">This template</h2>
              <p className="muted">{preset.task}</p>
              <details className="disclosure">
                <summary>Then break it</summary>
                <div className="disclosure-body">
                  <p className="muted">{preset.failure}</p>
                </div>
              </details>
            </section>
          ) : null}
          <section className="scenario section">
            <h2 className="rail-title">Scenario</h2>
            <div className="scenario-row">
              <label className="field">
                <span className="field-label">From</span>
                <select
                  className="select"
                  value={fromNode?.id ?? ''}
                  onChange={(event) => setFromId(event.target.value)}
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">To</span>
                <select
                  className="select"
                  value={toNode?.id ?? ''}
                  onChange={(event) => setToId(event.target.value)}
                >
                  {nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="field-hint">
              The ping button sits on the canvas, so it stays reachable while the panels are hidden.
            </p>
          </section>
        </aside>
      </div>

      <SimLog lines={visibleLines} />
    </div>
  );
}
