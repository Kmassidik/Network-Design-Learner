import { useEffect, useRef, useState, type ReactElement } from 'react';
import './ContextMenu.css';

export interface MenuItem {
  readonly label: string;
  /** True for the option that is already in force, which is marked, not hidden. */
  readonly current?: boolean;
  readonly onSelect: () => void;
}

export interface MenuSection {
  readonly title?: string;
  readonly items: readonly MenuItem[];
}

/**
 * The right click menu. Familiar from every drawing tool, and it is what keeps
 * the canvas itself free of buttons: a device carries the actions that apply to
 * a device, a cable the ones that apply to a cable, and empty space the ones
 * that apply to the board.
 */
export function ContextMenu({
  at,
  sections,
  onClose,
}: {
  /** Where the click was, in the coordinates of the container. */
  readonly at: { readonly x: number; readonly y: number };
  readonly sections: readonly MenuSection[];
  readonly onClose: () => void;
}): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState({ x: 0, y: 0 });

  /* Keep the whole menu on screen: near an edge it moves inwards rather than
     hanging off it. Measured after the first paint, because its size depends on
     the longest label. */
  useEffect(() => {
    const menu = ref.current;
    const host = menu?.parentElement;
    if (menu === null || menu === undefined || host === null || host === undefined) return;
    const overX = at.x + menu.offsetWidth - host.clientWidth;
    const overY = at.y + menu.offsetHeight - host.clientHeight;
    setShift({ x: overX > 0 ? -overX - 4 : 0, y: overY > 0 ? -overY - 4 : 0 });
  }, [at.x, at.y]);

  useEffect(() => {
    const menu = ref.current;
    if (menu === null) return;
    const items = () => Array.from(menu.querySelectorAll('button'));
    items()[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const all = items();
      const index = all.findIndex((item) => item === document.activeElement);
      const next = event.key === 'ArrowDown' ? index + 1 : index - 1;
      all[(next + all.length) % all.length]?.focus();
    };
    // A press anywhere else closes it, including on the canvas underneath.
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && menu.contains(event.target)) return;
      onClose();
    };
    menu.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onOutside, true);
    return () => {
      menu.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onOutside, true);
    };
  }, [onClose]);

  return (
    <div
      className="context-menu"
      role="menu"
      data-chrome
      ref={ref}
      style={{ left: at.x + shift.x, top: at.y + shift.y }}
    >
      {sections.map((section, index) => (
        <div className="context-section" key={section.title ?? index}>
          {section.title === undefined ? null : (
            <p className="context-title">{section.title}</p>
          )}
          {section.items.map((item) => (
            <button
              type="button"
              role="menuitem"
              className="context-item"
              key={item.label}
              data-current={item.current === true ? 'true' : undefined}
              onClick={() => {
                item.onSelect();
                onClose();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
