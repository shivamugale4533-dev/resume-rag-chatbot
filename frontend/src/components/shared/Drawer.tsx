import { X } from 'lucide-react';
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { IconButton } from './IconButton';

interface Props {
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right' | 'bottom';
  title: string;
  /** Visually hide the header title (e.g. nav drawer that shows the wordmark instead). */
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Drawer({ open, onClose, side, title, header, children, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className={`drawer drawer--${side} ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="drawer__header" style={{ position: 'relative' }}>
          {header ? (
            <>
              <span id={titleId} className="visually-hidden">
                {title}
              </span>
              {header}
            </>
          ) : (
            <h2 id={titleId} className="drawer__title">
              {title}
            </h2>
          )}
          <IconButton label="Close" onClick={onClose} tooltipSide="left">
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
        <div className="drawer__body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
