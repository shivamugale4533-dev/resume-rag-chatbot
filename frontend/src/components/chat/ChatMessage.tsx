import { AlertCircle, Check, Copy, PanelRight, Pencil, RefreshCw } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { copyText } from '../../lib/clipboard';
import { formatTime } from '../../lib/format';
import { toPlainText } from '../../lib/markdown';
import { useToast } from '../../state/ToastContext';
import type { ChatMessage as Message } from '../../types';
import { Button } from '../shared/Button';
import { Spinner } from '../shared/Spinner';
import { AnswerContent } from './AnswerContent';

export function UserMessage({ message }: { message: Message }) {
  return (
    <div className="msg msg--user" data-message-id={message.id}>
      <h3 className="visually-hidden">Your question</h3>
      <p className="msg--user__text">{message.content}</p>
    </div>
  );
}

interface AssistantProps {
  message: Message;
  isLatest: boolean;
  isEvidenceActive: boolean;
  selectedSource: number | null;
  onCite: (messageId: string, index: number) => void;
  onShowSources: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  onEdit: (messageId: string) => void;
  retryDisabled?: boolean;
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  isLatest,
  isEvidenceActive,
  selectedSource,
  onCite,
  onShowSources,
  onRetry,
  onEdit,
  retryDisabled,
}: AssistantProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  if (message.status === 'pending') return <PendingAnswer />;

  if (message.status === 'error') {
    return (
      <div className="msg msg--assistant msg--error" data-message-id={message.id} role="alert">
        <AlertCircle size={16} aria-hidden="true" />
        <div>
          <p className="msg--error__title">Couldn’t get an answer</p>
          <p className="muted">{message.error?.message ?? 'Something went wrong.'}</p>
          <div className="msg--error__actions">
            <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={() => onRetry(message.id)} disabled={retryDisabled}>
              Retry
            </Button>
            <Button size="sm" variant="ghost" icon={<Pencil size={14} aria-hidden="true" />} onClick={() => onEdit(message.id)} disabled={retryDisabled}>
              Edit question
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sources = message.sources;
  const count = sources?.length ?? 0;

  const copy = async () => {
    let text = toPlainText(message.content);
    if (count) {
      text +=
        '\n\nSources\n' +
        sources!
          .map((s) => {
            const where = [s.section, s.page !== undefined ? `p. ${s.page}` : null].filter(Boolean).join(', ');
            return `[${s.index}]${where ? ` ${where} —` : ''} ${s.text}`;
          })
          .join('\n');
    }
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      toast.show(count ? 'Answer copied with its sources.' : 'Answer copied.');
    } else toast.show("Couldn't copy to the clipboard.", 'error');
  };

  return (
    <article
      className={`msg msg--assistant ${isLatest ? 'is-latest' : ''} ${isEvidenceActive ? 'is-evidence-active' : ''}`}
      data-message-id={message.id}
      aria-label="Answer"
    >
      <AnswerContent
        text={message.content}
        sources={sources}
        selectedIndex={isEvidenceActive ? selectedSource : null}
        onCite={(i) => onCite(message.id, i)}
      />
      <div className="msg__footer">
        <span className="msg__meta mono">
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          {sources === undefined ? null : count === 0 ? <span> · No passages cited</span> : null}
        </span>
        <div className="msg__actions">
          {count > 0 && (
            <button type="button" className="msg__action" onClick={() => onShowSources(message.id)} aria-pressed={isEvidenceActive}>
              <PanelRight size={14} aria-hidden="true" />
              {count} {count === 1 ? 'source' : 'sources'}
            </button>
          )}
          <button type="button" className="msg__action" onClick={copy}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </article>
  );
});

function PendingAnswer() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="msg msg--assistant msg--pending" role="status" aria-live="polite">
      <Spinner size={15} />
      <span>{slow ? 'Still working — longer answers can take a little while.' : 'Searching the resume and drafting an answer…'}</span>
    </div>
  );
}
