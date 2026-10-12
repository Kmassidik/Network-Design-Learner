import type { ReactElement } from 'react';
import type { Board, GoalResult } from '../../sim/lesson';
import './Lessons.css';

export interface LessonsProps {
  /** Boards that name the change the reader has to make. */
  readonly guided: readonly Board[];
  /** Boards that only say what is wrong, so the reader has to find it. */
  readonly faults: readonly Board[];
  /** The board on the canvas, if it came from here. */
  readonly active: Board | null;
  /** Whether the active board's ping arrives yet. */
  readonly goal: GoalResult | null;
  readonly onOpen: (board: Board) => void;
}

/**
 * The lesson list. A guided board tells the reader what to change; a fault board
 * says only what is broken and leaves the diagnosis to them. Both are checked by
 * the simulation, so "it works" on screen is a measurement rather than a claim.
 */
export function Lessons({ guided, faults, active, goal, onOpen }: LessonsProps): ReactElement {
  const list = (boards: readonly Board[], label: string) => (
    <section className="lessons-group">
      <h3 className="lessons-group-title">{label}</h3>
      <ul className="lessons-list">
        {boards.map((board) => (
          <li key={board.id}>
            <button
              type="button"
              className="lessons-item"
              data-active={active?.id === board.id ? 'true' : undefined}
              onClick={() => onOpen(board)}
            >
              {board.title}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <section className="lessons section">
      <h2 className="rail-title">Lessons</h2>

      {active === null ? (
        <p className="muted">Pick a lesson to load its board.</p>
      ) : (
        <div className="lessons-active">
          <p className="lessons-task">{active.task}</p>
          <p className="lessons-state" data-met={goal?.met === true ? 'true' : 'false'}>
            {goal === null
              ? 'Press Check to see whether it works.'
              : goal.met
                ? 'It works. The ping arrives.'
                : 'Not yet. The correction is under the canvas.'}
          </p>
          {active.fault === '' ? null : (
            <details className="disclosure">
              <summary>What was wrong</summary>
              <div className="disclosure-body">
                <p className="muted">{active.fault}</p>
                <p className="muted">{active.point}</p>
              </div>
            </details>
          )}
        </div>
      )}

      <details className="disclosure">
        <summary>All lessons</summary>
        <div className="disclosure-body">
          {list(guided, 'Guided')}
          {list(faults, 'Find the fault')}
        </div>
      </details>
    </section>
  );
}
