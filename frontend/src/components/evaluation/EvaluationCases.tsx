import { ChevronRight, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { CaseStatus, EvaluationCase, EvaluationRun } from '../../types';
import { StatusLabel, type Tone } from '../shared/StatusLabel';
import { METRICS, formatScore, scoreFraction } from './metrics';

export const CASE_STATUS: Record<CaseStatus, { tone: Tone; label: string }> = {
  passed: { tone: 'success', label: 'Passed' },
  failed: { tone: 'warning', label: 'Failed' },
  error: { tone: 'error', label: 'Evaluator error' },
};

interface Props {
  run: EvaluationRun;
  cases: EvaluationCase[];
  onOpen: (c: EvaluationCase) => void;
}

export function EvaluationCases({ run, cases, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | CaseStatus>('all');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (status === 'all' || c.status === status) &&
        (!q || c.question.toLowerCase().includes(q) || c.answer?.toLowerCase().includes(q) || c.groundTruth?.toLowerCase().includes(q)),
    );
  }, [cases, query, status]);

  const statuses = [...new Set(cases.map((c) => c.status).filter(Boolean))] as CaseStatus[];

  return (
    <>
      <div className="toolbar">
        <div className="search-input toolbar__search">
          <Search size={14} aria-hidden="true" />
          <input className="input" type="search" placeholder="Search questions and answers" aria-label="Search test cases" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {statuses.length > 0 && (
          <select className="select toolbar__select" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {CASE_STATUS[s].label}
              </option>
            ))}
          </select>
        )}
        <span className="toolbar__count muted" aria-live="polite">
          {visible.length} of {cases.length} cases
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="table-empty">No test cases match these filters.</p>
      ) : (
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Test case results">
          <table className="data-table eval-table">
            <thead>
              <tr>
                <th scope="col" className="eval-table__q">
                  Question
                </th>
                {METRICS.map((m) => (
                  <th key={m.key} scope="col" className="num" title={m.name}>
                    {m.short}
                  </th>
                ))}
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="visually-hidden">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id} className="is-clickable" onClick={() => onOpen(c)}>
                  <td className="eval-table__q">
                    <button type="button" className="row-link" onClick={(e) => (e.stopPropagation(), onOpen(c))}>
                      {c.question}
                    </button>
                  </td>
                  {METRICS.map((m) => {
                    const v = c.scores[m.key];
                    const frac = scoreFraction(v, run.scoreRange);
                    return (
                      <td key={m.key} className="num mono">
                        <span className={frac !== null && frac < 0.6 ? 'score-low' : undefined}>{formatScore(v, run.scoreRange)}</span>
                        {v === null && <span className="visually-hidden"> (not computed)</span>}
                      </td>
                    );
                  })}
                  <td>{c.status ? <StatusLabel tone={CASE_STATUS[c.status].tone}>{CASE_STATUS[c.status].label}</StatusLabel> : <span className="muted">—</span>}</td>
                  <td className="eval-table__chev" aria-hidden="true">
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
