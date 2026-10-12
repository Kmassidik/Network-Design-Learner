import { useId, useState, type ReactElement } from 'react';
import { GLOSSARY, type GlossaryKey } from '../../content/glossary';

/**
 * A field label with the term explained beside it. The explanation lives in the
 * glossary, so the same words are used everywhere the term appears.
 */
export function Term({ text, topic }: { text: string; topic: GlossaryKey }): ReactElement {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const entry = GLOSSARY[topic];
  return (
    <span className="tooltip">
      <span>{text}</span>
      <button
        type="button"
        className="tooltip-toggle"
        aria-label={`What is a ${entry.term}?`}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open ? (
        <span className="tooltip-panel" id={panelId} role="tooltip">
          {entry.body}
        </span>
      ) : null}
    </span>
  );
}
