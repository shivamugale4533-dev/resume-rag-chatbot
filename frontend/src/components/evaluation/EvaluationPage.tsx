import { Download, FlaskConical, Play, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { downloadFile, toCsv } from '../../lib/download';
import { formatDateTime, formatDuration, formatFull } from '../../lib/format';
import { ApiError, isAbort, toApiError } from '../../services';
import { useService } from '../../state/ServiceContext';
import { useToast } from '../../state/ToastContext';
import type { EvaluationCase, EvaluationRun, EvaluationRunDetail, EvaluationStatus } from '../../types';
import { METRIC_KEYS } from '../../types';
import { AppHeader } from '../layout/AppHeader';
import { Button } from '../shared/Button';
import { Drawer } from '../shared/Drawer';
import { Notice } from '../shared/Notice';
import { Skeleton } from '../shared/Skeleton';
import { StateMessage } from '../shared/StateMessage';
import { StatusLabel, type Tone } from '../shared/StatusLabel';
import { CASE_STATUS, EvaluationCases } from './EvaluationCases';
import { METRICS } from './metrics';
import { MetricSummary } from './MetricSummary';
import { ScoreBar } from './ScoreBar';

const RUN_STATUS: Record<EvaluationStatus, { tone: Tone; label: string }> = {
  queued: { tone: 'info', label: 'Queued' },
  running: { tone: 'info', label: 'Running' },
  completed: { tone: 'success', label: 'Completed' },
  failed: { tone: 'error', label: 'Failed' },
};

type ListState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; detail?: string }
  | { kind: 'error'; error: ApiError }
  | { kind: 'ready'; runs: EvaluationRun[] };

export function EvaluationPage() {
  const { service, reportFailure } = useService();
  const toast = useToast();
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvaluationRunDetail | null>(null);
  const [detailError, setDetailError] = useState<ApiError | null>(null);
  const [starting, setStarting] = useState(false);
  const [startUnavailable, setStartUnavailable] = useState(false);
  const [openCase, setOpenCase] = useState<EvaluationCase | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  /* ---- Runs ---- */
  useEffect(() => {
    const ac = new AbortController();
    setList({ kind: 'loading' });
    service
      .listEvaluations(ac.signal)
      .then((runs) => {
        const sorted = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setList({ kind: 'ready', runs: sorted });
        setSelectedId((id) => (id && sorted.some((r) => r.id === id) ? id : (sorted[0]?.id ?? null)));
      })
      .catch((err) => {
        if (isAbort(err)) return;
        reportFailure(err);
        const e = toApiError(err);
        setList(e.kind === 'not_implemented' ? { kind: 'unavailable', detail: e.detail } : { kind: 'error', error: e });
      });
    return () => ac.abort();
  }, [service, reportFailure, reloadKey]);

  /* ---- Selected run detail (+ polling while it runs) ---- */
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setDetailError(null);
    setDetail((d) => (d?.id === selectedId ? d : null));
    const load = () =>
      service
        .getEvaluation(selectedId, ac.signal)
        .then((run) => {
          setDetail({ ...run, cases: [...run.cases] });
          setList((l) => (l.kind === 'ready' ? { ...l, runs: l.runs.map((r) => (r.id === run.id ? { ...r, ...run } : r)) } : l));
          if (run.status === 'running' || run.status === 'queued') timer = setTimeout(load, 3000);
        })
        .catch((err) => {
          if (isAbort(err)) return;
          reportFailure(err);
          setDetailError(toApiError(err));
        });
    void load();
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [selectedId, service, reportFailure, detailReloadKey]);

  const runs = list.kind === 'ready' ? list.runs : [];
  const run = detail && detail.id === selectedId ? detail : null;
  const baseline = useMemo(() => {
    if (!run) return null;
    return (
      runs.find(
        (r) =>
          r.id !== run.id &&
          r.status === 'completed' &&
          r.createdAt < run.createdAt &&
          r.dataset === run.dataset &&
          JSON.stringify(r.scoreRange) === JSON.stringify(run.scoreRange),
      ) ?? null
    );
  }, [run, runs]);

  const startRun = useCallback(async () => {
    setStarting(true);
    try {
      const started = await service.startEvaluation();
      setList((l) => (l.kind === 'ready' ? { ...l, runs: [started, ...l.runs] } : { kind: 'ready', runs: [started] }));
      setSelectedId(started.id);
      toast.show('Evaluation started. Results will appear when it finishes.');
    } catch (err) {
      reportFailure(err);
      const e = toApiError(err);
      if (e.kind === 'not_implemented') setStartUnavailable(true);
      toast.show(e.kind === 'not_implemented' ? 'The backend does not support starting evaluations.' : e.message, 'error');
    } finally {
      setStarting(false);
    }
  }, [service, toast, reportFailure]);

  const exportRun = (format: 'json' | 'csv') => {
    if (!run) return;
    const base = `evaluation-${run.id}`;
    if (format === 'json') {
      downloadFile(`${base}.json`, JSON.stringify(run, null, 2), 'application/json');
    } else {
      const header = ['case_id', 'question', 'ground_truth', 'answer', ...METRIC_KEYS, 'status', 'error'];
      const rows = run.cases.map((c) => [c.id, c.question, c.groundTruth, c.answer, ...METRIC_KEYS.map((k) => c.scores[k]), c.status, c.error]);
      downloadFile(`${base}.csv`, toCsv([header, ...rows]), 'text/csv');
    }
    toast.show(`Exported ${run.id} as ${format.toUpperCase()}.`);
  };

  const anyRunning = runs.some((r) => r.status === 'running' || r.status === 'queued');
  const canStart = list.kind === 'ready' && !startUnavailable;

  return (
    <>
      <AppHeader title="Evaluation" />
      <div className="page">
        <div className="page__inner">
          <div className="page__intro">
            <div>
              <h2 className="serif-heading">RAG evaluation</h2>
              <p>Review benchmark runs and inspect how well answers are supported by retrieved context.</p>
            </div>
            {list.kind !== 'loading' && (
              <div className="page__intro-actions">
                <Button
                  variant="primary"
                  icon={<Play size={16} aria-hidden="true" />}
                  loading={starting}
                  disabled={!canStart || anyRunning}
                  onClick={startRun}
                  aria-describedby={!canStart || anyRunning ? 'run-eval-note' : undefined}
                >
                  Run evaluation
                </Button>
                {(!canStart || anyRunning) && (
                  <p id="run-eval-note" className="fine-print">
                    {anyRunning ? 'A run is already in progress.' : list.kind === 'error' ? 'Unavailable until runs load.' : 'The backend has no evaluation endpoint.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {list.kind === 'loading' && <EvalSkeleton />}

          {list.kind === 'unavailable' && (
            <StateMessage icon={<FlaskConical size={18} />} title="Evaluation isn’t available on this backend">
              The connected API doesn’t expose <code>GET /evaluations</code>, so there are no benchmark runs to show. Once the endpoint described in{' '}
              <code>API_CONTRACT.md</code> exists, runs and their five RAGAS metrics will appear here.
            </StateMessage>
          )}

          {list.kind === 'error' && (
            <StateMessage
              tone="error"
              title="Couldn’t load evaluation runs"
              actions={
                <Button variant="primary" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={() => setReloadKey((k) => k + 1)}>
                  Try again
                </Button>
              }
              detail={list.error.status ? `HTTP ${list.error.status}` : undefined}
            >
              {list.error.message}
            </StateMessage>
          )}

          {list.kind === 'ready' && runs.length === 0 && (
            <StateMessage icon={<FlaskConical size={18} />} title="No benchmark results yet">
              Run an evaluation to inspect faithfulness, relevance, and retrieval quality.
            </StateMessage>
          )}

          {list.kind === 'ready' && runs.length > 0 && (
            <>
              <div className="run-bar">
                <label className="field run-bar__select">
                  <span className="field__label">Benchmark run</span>
                  <select className="select" value={selectedId ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id} · {formatDateTime(r.createdAt)} · {RUN_STATUS[r.status].label}
                      </option>
                    ))}
                  </select>
                </label>
                {run && run.cases.length > 0 && (
                  <div className="run-bar__export">
                    <Button size="sm" variant="ghost" icon={<Download size={14} aria-hidden="true" />} onClick={() => exportRun('csv')}>
                      Export CSV
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Download size={14} aria-hidden="true" />} onClick={() => exportRun('json')}>
                      Export JSON
                    </Button>
                  </div>
                )}
              </div>

              {detailError && (
                <Notice
                  tone="error"
                  live
                  title="Couldn’t load this run"
                  actions={
                    <Button size="sm" variant="secondary" onClick={() => setDetailReloadKey((k) => k + 1)}>
                      Try again
                    </Button>
                  }
                >
                  {detailError.message}
                </Notice>
              )}

              {!run && !detailError && <EvalSkeleton compact />}

              {run && (
                <>
                  {run.isSample && (
                    <div className="page__section-tight">
                      <Notice tone="warning" title="Sample data — not measured">
                        These runs ship with demo mode to show how results are presented. They are not benchmark results from a real evaluation.
                      </Notice>
                    </div>
                  )}

                  <dl className="run-meta">
                    <div>
                      <dt>Status</dt>
                      <dd>
                        <StatusLabel tone={RUN_STATUS[run.status].tone} busy={run.status === 'running' || run.status === 'queued'}>
                          {RUN_STATUS[run.status].label}
                        </StatusLabel>
                      </dd>
                    </div>
                    <div>
                      <dt>Started</dt>
                      <dd className="mono">{formatFull(run.createdAt)}</dd>
                    </div>
                    {run.completedAt && (
                      <div>
                        <dt>Duration</dt>
                        <dd className="mono">{formatDuration(new Date(run.completedAt).getTime() - new Date(run.createdAt).getTime()) ?? '—'}</dd>
                      </div>
                    )}
                    {run.dataset && (
                      <div>
                        <dt>Test set</dt>
                        <dd className="mono">{run.dataset}</dd>
                      </div>
                    )}
                    {run.caseCount !== undefined && (
                      <div>
                        <dt>Test cases</dt>
                        <dd className="mono">{run.caseCount}</dd>
                      </div>
                    )}
                    {run.failedCount !== undefined && (
                      <div>
                        <dt>Failed or errored</dt>
                        <dd className="mono">{run.failedCount}</dd>
                      </div>
                    )}
                  </dl>

                  {run.status === 'failed' && (
                    <div className="page__section-tight">
                      <Notice tone="error" title="This evaluation run failed">
                        {run.error ?? 'The evaluator did not report a reason.'} Scores below are only those the backend returned before failing.
                      </Notice>
                    </div>
                  )}

                  <section className="page__section" aria-labelledby="metrics-heading">
                    <div className="section-heading">
                      <h2 id="metrics-heading">Metrics</h2>
                      <span className="fine-print">
                        {run.scoreRange ? `Mean across cases · scale ${run.scoreRange[0]}–${run.scoreRange[1]}` : 'Score range not reported by the backend'}
                      </span>
                    </div>
                    <MetricSummary run={run} baseline={baseline} />
                  </section>

                  <section className="page__section" aria-labelledby="cases-heading">
                    <div className="section-heading">
                      <h2 id="cases-heading">Test cases</h2>
                    </div>
                    {run.cases.length === 0 ? (
                      <p className="table-empty">
                        {run.status === 'running' || run.status === 'queued' ? 'Test-case results appear when the run completes.' : 'This run did not return individual test cases.'}
                      </p>
                    ) : (
                      <EvaluationCases run={run} cases={run.cases} onOpen={setOpenCase} />
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <Drawer open={openCase !== null} onClose={() => setOpenCase(null)} side="right" title="Test case" className="detail-drawer">
        {openCase && run && <CaseDetail c={openCase} run={run} />}
      </Drawer>
    </>
  );
}

function CaseDetail({ c, run }: { c: EvaluationCase; run: EvaluationRun }) {
  return (
    <div className="detail">
      <div className="detail__block">
        <p className="section-label">Question</p>
        <p className="detail__question">{c.question}</p>
        {c.status && (
          <div style={{ marginTop: 8 }}>
            <StatusLabel tone={CASE_STATUS[c.status].tone} boxed>
              {CASE_STATUS[c.status].label}
            </StatusLabel>
          </div>
        )}
      </div>

      {(c.error || c.feedback) && (
        <div className="detail__block">
          {c.error && <Notice tone="error" title="Evaluator error">{c.error}</Notice>}
          {c.feedback && (
            <div style={{ marginTop: c.error ? 12 : 0 }}>
              <Notice tone="info" title="Evaluator feedback">
                {c.feedback}
              </Notice>
            </div>
          )}
        </div>
      )}

      <div className="detail__block">
        <p className="section-label">Expected answer</p>
        <p className="detail__text">{c.groundTruth ?? <span className="muted">Not provided</span>}</p>
      </div>
      <div className="detail__block">
        <p className="section-label">Generated answer</p>
        <p className="detail__text">{c.answer ?? <span className="muted">Not provided</span>}</p>
      </div>

      <div className="detail__block">
        <p className="section-label">Scores</p>
        <dl className="detail__scores">
          {METRICS.map((m) => (
            <div key={m.key} className="detail__score">
              <dt title={m.definition}>{m.name}</dt>
              <dd>
                {c.scores[m.key] === null ? (
                  <span className="status status--error">Not computed</span>
                ) : m.key in c.scores ? (
                  <ScoreBar value={c.scores[m.key]} range={run.scoreRange} label={m.name} />
                ) : (
                  <span className="muted">Not reported</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="detail__block">
        <p className="section-label">Retrieved context</p>
        {c.contexts?.length ? (
          <ol className="detail__contexts">
            {c.contexts.map((ctx, i) => (
              <li key={i}>
                <span className="source__num" aria-hidden="true">
                  {i + 1}
                </span>
                <blockquote>{ctx}</blockquote>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No retrieved context was returned for this case.</p>
        )}
      </div>
    </div>
  );
}

function EvalSkeleton({ compact }: { compact?: boolean }) {
  return (
    <div aria-busy="true" aria-label="Loading evaluation results">
      {!compact && <Skeleton width={260} height={36} />}
      <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={20} />
        ))}
      </div>
    </div>
  );
}
