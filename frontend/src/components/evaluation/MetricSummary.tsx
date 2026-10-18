import { ArrowDownRight, ArrowUpRight, CircleHelp, Minus } from 'lucide-react';
import { useState } from 'react';
import type { EvaluationRun } from '../../types';
import { StatusLabel } from '../shared/StatusLabel';
import { METRICS } from './metrics';
import { ScoreBar } from './ScoreBar';

interface Props {
  run: EvaluationRun;
  /** An earlier completed run on the same dataset and scale, if one exists. */
  baseline: EvaluationRun | null;
}

export function MetricSummary({ run, baseline }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const inProgress = run.status === 'running' || run.status === 'queued';

  return (
    <div className="metrics" role="table" aria-label="RAGAS metric summary">
      <div className="metrics__row metrics__row--head" role="row">
        <span role="columnheader">Metric</span>
        <span role="columnheader">Mean score</span>
        <span role="columnheader">{baseline ? `vs ${baseline.id}` : 'Change'}</span>
        <span role="columnheader">Status</span>
      </div>
      {METRICS.map((m) => {
        const reported = m.key in run.scores;
        const value = run.scores[m.key];
        const prev = baseline?.scores[m.key];
        const delta = typeof value === 'number' && typeof prev === 'number' ? value - prev : null;
        const defId = `def-${m.key}`;
        return (
          <div key={m.key} className="metrics__group" role="rowgroup">
            <div className="metrics__row" role="row">
              <span role="rowheader" className="metrics__name">
                {m.name}
                <button
                  type="button"
                  className="metrics__help"
                  aria-expanded={open === m.key}
                  aria-controls={defId}
                  aria-label={`What is ${m.name}?`}
                  onClick={() => setOpen(open === m.key ? null : m.key)}
                >
                  <CircleHelp size={14} aria-hidden="true" />
                </button>
              </span>
              <span role="cell">
                {typeof value === 'number' ? <ScoreBar value={value} range={run.scoreRange} label={`${m.name} mean score`} /> : <span className="mono muted">—</span>}
              </span>
              <span role="cell" className="metrics__delta mono">
                {delta === null ? (
                  <span className="muted">{baseline ? '—' : 'No earlier run'}</span>
                ) : Math.abs(delta) < 0.005 ? (
                  <span className="delta delta--flat">
                    <Minus size={12} aria-hidden="true" /> 0.00
                  </span>
                ) : (
                  <span className={`delta ${delta > 0 ? 'delta--up' : 'delta--down'}`}>
                    {delta > 0 ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
                    {delta > 0 ? '+' : '−'}
                    {Math.abs(delta).toFixed(2)}
                    <span className="visually-hidden">{delta > 0 ? ' higher' : ' lower'} than the previous run</span>
                  </span>
                )}
              </span>
              <span role="cell">
                {inProgress ? (
                  <StatusLabel tone="info" busy>
                    Running
                  </StatusLabel>
                ) : typeof value === 'number' ? (
                  <StatusLabel tone="success">Measured</StatusLabel>
                ) : reported ? (
                  <StatusLabel tone="error">Not computed</StatusLabel>
                ) : (
                  <StatusLabel tone="neutral">Not reported</StatusLabel>
                )}
              </span>
            </div>
            {open === m.key && (
              <p id={defId} className="metrics__def" role="note">
                {m.definition}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
