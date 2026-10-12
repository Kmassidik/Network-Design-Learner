import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { LogLine } from '../../content/narration';

/** How many lines the closed bar shows. The rest are one click away. */
const PREVIEW = 3;

/** How close to the bottom still counts as being at the bottom, in px. */
const STICKY = 8;

/**
 * What the network did. Closed it is three lines and a hairline, so the canvas
 * keeps its room; open it is a terminal: a fixed viewport that scrolls, in the
 * fixed width face, which follows the end of the run only while the reader is
 * already looking at it. Scrolling back to read a line is not punished by the
 * next line pulling the view away.
 */
export function SimLog({ lines }: { lines: readonly LogLine[] }): ReactElement {
  const [open, setOpen] = useState(false);
  const [following, setFollowing] = useState(true);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (list !== null && following) list.scrollTop = list.scrollHeight;
  }, [lines.length, open, following]);

  const onScroll = useCallback(() => {
    const list = listRef.current;
    if (list === null) return;
    setFollowing(list.scrollHeight - list.scrollTop - list.clientHeight <= STICKY);
  }, []);

  const shown = open ? lines : lines.slice(-PREVIEW);

  return (
    <div className="logbar" data-open={open}>
      <button
        type="button"
        className="logbar-head"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setFollowing(true);
        }}
      >
        <span className="logbar-title">Packet log</span>
        <span className="logbar-latest">
          {lines.length === 0
            ? 'Send a ping and every frame it takes will be listed here.'
            : `${lines.length} lines, newest is ${lines[lines.length - 1]?.timeMs.toFixed(1)} ms`}
        </span>
        <span className="logbar-chevron" aria-hidden="true">
          {open ? '\u25be' : '\u25b8'}
        </span>
      </button>
      {lines.length === 0 ? null : (
        <ol className="log" ref={listRef} tabIndex={0} onScroll={onScroll} aria-label="Packet log">
          {shown.map((line, index) => (
            <li className="log-line" key={index} data-tone={line.tone}>
              <time className="log-time num">{line.timeMs.toFixed(1)} ms</time>
              <span className="log-text">{line.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
