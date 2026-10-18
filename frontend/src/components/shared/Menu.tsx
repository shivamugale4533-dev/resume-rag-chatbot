import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

/** Small accessible action menu: arrow keys, Escape, click-outside, focus return. */
export function Menu({ label, icon, items, align = 'right' }: { label: string; icon: ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btn.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div style={{ position: 'relative' }} className="menu-anchor">
      <IconButton
        ref={btn}
        label={label}
        tooltip="More actions"
        tooltipSide="left"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        noTooltip={open}
      >
        {icon}
      </IconButton>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className="menu"
          style={{ top: 'calc(100% + 4px)', [align]: 0 }}
          onKeyDown={onKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
              onClick={() => {
                // Return focus to the trigger first so dialogs opened by the
                // item restore focus there when they close.
                close();
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
