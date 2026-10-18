import { FileSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../../types';

interface Props {
  /** The answer whose evidence is shown. */
  answer: ChatMessage | null;
  /** The question that produced it. */
  question: string | null;
  selected: number | null;
  onSelect: (index: number) => void;
}

const CLAMP_CHARS = 520;

/** Body of the evidence panel; the container (inline aside, drawer or sheet) is chosen by the page. */
export function SourcePanel({ answer, question, selected, onSelect }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (selected === null || !answer) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-source-index="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selected, answer]);

  if (!answer) {
    return (
      <div className="evidence__empty">
        <FileSearch size={20} aria-hidden="true" />
        <p>Retrieved passages appear here when a question is answered. Select a citation like <span className="cite cite--static">1</span> to jump to its source.</p>
      </div>
    );
  }

  const sources = answer.sources;

  return (
    <div className="evidence__content">
      {question && (
        <div className="evidence__for">
          <span className="section-label">For the question</span>
          <p className="evidence__question">{question}</p>
        </div>
      )}

      {sources === undefined ? (
        <p className="evidence__note">The backend didn’t return source passages for this answer, so no evidence can be shown.</p>
      ) : sources.length === 0 ? (
        <p className="evidence__note">No resume passages were cited for this answer.</p>
      ) : (
        <ol ref={listRef} className="evidence__list" aria-label="Retrieved passages">
          {sources.map((s) => (
            <SourceItem key={s.index} index={s.index} text={s.text} section={s.section} page={s.page} score={s.score} active={selected === s.index} onSelect={onSelect} />
          ))}
        </ol>
      )}
    </div>
  );
}

function SourceItem({
  index,
  text,
  section,
  page,
  score,
  active,
  onSelect,
}: {
  index: number;
  text: string;
  section?: string;
  page?: number;
  score?: number;
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const long = text.length > CLAMP_CHARS;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  const location = [section, page !== undefined ? `Page ${page}` : null].filter(Boolean);

  return (
    <li className={`source ${active ? 'is-active' : ''}`} data-source-index={index} aria-current={active ? 'true' : undefined}>
      <button type="button" className="source__head" onClick={() => onSelect(index)} aria-label={`Highlight source ${index}`}>
        <span className="source__num" aria-hidden="true">
          {index}
        </span>
        <span className="source__where">{location.length ? location.join(' · ') : `Passage ${index}`}</span>
        {score !== undefined && (
          <span className="source__score mono" title="Retrieval score as reported by the backend">
            score {score.toFixed(3)}
          </span>
        )}
      </button>
      <blockquote className={`source__text ${long && !expanded ? 'is-clamped' : ''}`}>{text}</blockquote>
      {long && (
        <button type="button" className="source__more" onClick={() => setExpanded((e) => !e)} aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Show full passage'}
        </button>
      )}
    </li>
  );
}
