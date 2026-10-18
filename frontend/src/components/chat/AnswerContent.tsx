import { Fragment, useMemo, type ReactNode } from 'react';
import { parseBlocks, type Inline } from '../../lib/markdown';
import type { RetrievedSource } from '../../types';

interface Props {
  text: string;
  sources?: RetrievedSource[];
  selectedIndex?: number | null;
  onCite?: (index: number) => void;
}

/** Renders the safe Markdown subset. Citation markers only become links when
 *  the backend actually returned a source with that index. */
export function AnswerContent({ text, sources, selectedIndex, onCite }: Props) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const byIndex = useMemo(() => new Map((sources ?? []).map((s) => [s.index, s])), [sources]);

  const inline = (nodes: Inline[], keyPrefix: string): ReactNode =>
    nodes.map((n, i) => {
      const key = `${keyPrefix}-${i}`;
      switch (n.type) {
        case 'text':
          return <Fragment key={key}>{n.value}</Fragment>;
        case 'strong':
          return <strong key={key}>{inline(n.children, key)}</strong>;
        case 'em':
          return <em key={key}>{inline(n.children, key)}</em>;
        case 'code':
          return <code key={key}>{n.value}</code>;
        case 'cite': {
          const src = byIndex.get(n.index);
          if (!src || !onCite) return <Fragment key={key}>[{n.index}]</Fragment>;
          const where = [src.section, src.page !== undefined ? `page ${src.page}` : null].filter(Boolean).join(', ');
          return (
            <button
              key={key}
              type="button"
              className="cite"
              aria-pressed={selectedIndex === n.index}
              aria-label={`Source ${n.index}${where ? `: ${where}` : ''}`}
              onClick={() => onCite(n.index)}
            >
              {n.index}
            </button>
          );
        }
      }
    });

  return (
    <div className="answer">
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case 'p':
            return <p key={key}>{inline(b.children, key)}</p>;
          case 'h':
            return (
              <p key={key} className="answer__heading">
                {inline(b.children, key)}
              </p>
            );
          case 'ul':
            return (
              <ul key={key}>
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} start={b.start}>
                {b.items.map((item, j) => (
                  <li key={j}>{inline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'pre':
            return (
              <pre key={key}>
                <code>{b.value}</code>
              </pre>
            );
        }
      })}
    </div>
  );
}
