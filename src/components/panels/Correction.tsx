import type { ReactElement } from 'react';
import { GLOSSARY, READ_MORE } from '../../content/glossary';
import type { Correction as CorrectionData } from '../../sim/diagnose';

/**
 * The correction step: what stopped the packet, why, and the smallest change
 * that fixes it. It is written from the run that just happened, so the numbers
 * in it are the reader's own, and the theory sits behind a link for anyone who
 * wants it.
 */
export function Correction({ correction }: { correction: CorrectionData }): ReactElement {
  const topic = correction.topic;
  const entry = topic === null ? null : GLOSSARY[topic];
  const href = topic === null ? undefined : READ_MORE[topic];

  return (
    <section className="correction" aria-live="polite">
      <h2 className="correction-headline">{correction.headline}</h2>
      <p className="correction-detail">{correction.detail}</p>
      <p className="correction-fix">{correction.fix}</p>
      {entry === null || href === undefined ? null : (
        <a className="correction-link" href={href} target="_blank" rel="noreferrer">
          Read about {entry.term}
        </a>
      )}
    </section>
  );
}
