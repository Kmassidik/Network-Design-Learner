import type { ReactElement } from 'react';
import { KIND, KIND_GROUPS, NODE_KINDS } from '../../sim/kinds';
import type { NodeKind } from '../../sim/types';

/**
 * The devices a student can place, grouped by the layer they work at, drawn
 * with the same pictures they will see on the canvas.
 */
export function Palette({ onAdd }: { onAdd: (kind: NodeKind) => void }): ReactElement {
  return (
    <div className="palette section">
      <h2 className="rail-title">Devices</h2>
      {KIND_GROUPS.map((group) => {
        const kinds = NODE_KINDS.filter((kind) => KIND[kind].group === group);
        if (kinds.length === 0) return null;
        return (
          <section key={group} className="palette-group">
            <h3 className="palette-group-title">{group}</h3>
            <ul className="palette-list">
              {kinds.map((kind) => (
                <li key={kind}>
                  <button
                    type="button"
                    className="palette-item"
                    title={KIND[kind].role}
                    onClick={() => onAdd(kind)}
                  >
                    <img className="palette-symbol" src={`/symbols/${KIND[kind].symbol}`} alt="" />
                    <span className="palette-label">{KIND[kind].label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="field-hint">
        Right click the board for its menu. Drag on empty space to pick several devices at once, or
        hold shift while clicking them.
      </p>
    </div>
  );
}
