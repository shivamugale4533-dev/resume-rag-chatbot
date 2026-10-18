import { useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  /** Element to focus first — typically the safe (cancel) action. */
  initialFocus?: RefObject<HTMLElement>;
  role?: 'dialog' | 'alertdialog';
}

export function Dialog({ open, onClose, title, children, actions, initialFocus, role = 'dialog' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useFocusTrap(ref, open, onClose, initialFocus);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" onClick={onClose} aria-hidden="true" />
      <div ref={ref} className="dialog" role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId}>
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <div id={bodyId} className="dialog__body">
          {children}
        </div>
        <div className="dialog__actions">{actions}</div>
      </div>
    </>,
    document.body,
  );
}
