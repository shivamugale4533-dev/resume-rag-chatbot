import { ArrowUp } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { Spinner } from '../shared/Spinner';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text: string) => void;
  disabled?: boolean;
  /** Why the composer is disabled — shown in place of the keyboard hint. */
  disabledReason?: string;
  busy?: boolean;
}

export interface ComposerHandle {
  focus: () => void;
}

const MAX_LENGTH = 4000;

export const MessageComposer = forwardRef<ComposerHandle, Props>(function MessageComposer(
  { value, onChange, onSubmit, disabled, disabledReason, busy },
  ref,
) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }), []);

  // Auto-grow up to a cap; beyond that the textarea scrolls.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  // Keep focus in the composer after an answer arrives (desktop only).
  useEffect(() => {
    if (!busy && !disabled && document.activeElement === document.body && window.matchMedia?.('(hover: hover)').matches) {
      ta.current?.focus();
    }
  }, [busy, disabled]);

  const canSend = !disabled && !busy && value.trim().length > 0;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSend) return;
    onSubmit(value.trim());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const hintId = 'composer-hint';
  return (
    <form className={`composer ${disabled ? 'is-disabled' : ''}`} onSubmit={submit} aria-label="Ask a question">
      <div className="composer__box">
        <label htmlFor="composer-input" className="visually-hidden">
          Question about the resume
        </label>
        <textarea
          id="composer-input"
          ref={ta}
          className="composer__input"
          rows={1}
          placeholder="Ask something about this resume..."
          value={value}
          maxLength={MAX_LENGTH}
          disabled={disabled}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className="composer__send"
          disabled={!canSend}
          aria-label={busy ? 'Waiting for the answer' : 'Send question'}
          data-tooltip={busy ? undefined : 'Send'}
          data-tooltip-side="top"
        >
          {busy ? <Spinner size={16} /> : <ArrowUp size={18} aria-hidden="true" />}
        </button>
      </div>
      <p id={hintId} className="composer__hint">
        {disabled && disabledReason ? (
          disabledReason
        ) : (
          <>
            <span className="composer__keys">
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
            </span>
            <span className="composer__scope">Answers use passages retrieved from the current resume.</span>
          </>
        )}
      </p>
    </form>
  );
});
