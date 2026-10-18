import { Activity, ChevronRight, Copy, Download, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDebounced } from '../../hooks/useDebounced';
import { copyText } from '../../lib/clipboard';
import { downloadFile } from '../../lib/download';
import { formatDuration, formatFull, formatLogTime, relativeDay } from '../../lib/format';
import { redact } from '../../lib/redact';
import { ApiError, isAbort, toApiError } from '../../services';
import { useService } from '../../state/ServiceContext';
import { useToast } from '../../state/ToastContext';
import type { LogEvent, LogLevel } from '../../types';
import { AppHeader } from '../layout/AppHeader';
import { Button } from '../shared/Button';
import { IconButton } from '../shared/IconButton';
import { Notice } from '../shared/Notice';
import { Skeleton } from '../shared/Skeleton';
import { StateMessage } from '../shared/StateMessage';
import { StatusLabel, type Tone } from '../shared/StatusLabel';

const LEVELS: { value: LogLevel; label: string; tone: Tone }[] = [
  { value: 'error', label: 'Error', tone: 'error' },
  { value: 'warning', label: 'Warning', tone: 'warning' },
  { value: 'success', label: 'Success', tone: 'success' },
  { value: 'info', label: 'Info', tone: 'info' },
  { value: 'debug', label: 'Debug', tone: 'neutral' },
];
const LEVEL = Object.fromEntries(LEVELS.map((l) => [l.value, l])) as Record<LogLevel, (typeof LEVELS)[number]>;

const PAGE_SIZE = 25;

type State =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'error'; error: ApiError }
  | { kind: 'ready'; items: LogEvent[]; nextCursor?: string; eventTypes: string[] };

export function LogsPage() {
  const { service, reportFailure } = useService();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LogLevel | ''>('');
  const [event, setEvent] = useState('');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [loadingMore, setLoadingMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const debouncedSearch = useDebounced(search.trim(), 300);

  const query = useMemo(
    () => ({ search: debouncedSearch || undefined, level: level || undefined, event: event || undefined, limit: PAGE_SIZE }),
    [debouncedSearch, level, event],
  );

  useEffect(() => {
    const ac = new AbortController();
    setState((s) => (s.kind === 'ready' ? s : { kind: 'loading' }));
    setRefreshing(true);
    service
      .listLogs(query, ac.signal)
      .then((page) =>
        setState((prev) => ({
          kind: 'ready',
          items: page.items,
          nextCursor: page.nextCursor,
          eventTypes: page.eventTypes ?? (prev.kind === 'ready' ? prev.eventTypes : [...new Set(page.items.map((i) => i.event))].sort()),
        })),
      )
      .catch((err) => {
        if (isAbort(err)) return;
        reportFailure(err);
        const e = toApiError(err);
        setState(e.kind === 'not_implemented' ? { kind: 'unavailable' } : { kind: 'error', error: e });
      })
      .finally(() => {
        if (!ac.signal.aborted) setRefreshing(false);
      });
    return () => ac.abort();
  }, [service, query, reloadKey, reportFailure]);

  const loadMore = useCallback(async () => {
    if (state.kind !== 'ready' || !state.nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await service.listLogs({ ...query, cursor: state.nextCursor });
      setState((s) => (s.kind === 'ready' ? { ...s, items: [...s.items, ...page.items], nextCursor: page.nextCursor } : s));
    } catch (err) {
      reportFailure(err);
      toast.show(`Couldn’t load more events. ${toApiError(err).message}`, 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [state, service, query, toast, reportFailure]);

  const copyId = async (id: string) => {
    const ok = await copyText(id);
    toast.show(ok ? 'Request ID copied.' : "Couldn't copy to the clipboard.", ok ? 'success' : 'error');
  };

  const exportLoaded = () => {
    if (state.kind !== 'ready') return;
    const safe = state.items.map((i) => ({ ...i, details: i.details ? redact(i.details) : undefined }));
    downloadFile(`activity-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`, JSON.stringify(safe, null, 2), 'application/json');
    toast.show(`Exported ${state.items.length} events.`);
  };

  const filtersActive = Boolean(search || level || event);

  return (
    <>
      <AppHeader title="Activity logs" />
      <div className="page">
        <div className="page__inner page__inner--wide">
          <div className="page__intro">
            <div>
              <h2 className="page-title">Activity logs</h2>
              <p>Inspect requests, errors, and resume-retrieval activity.</p>
            </div>
          </div>

          {service.mode === 'demo' && state.kind !== 'unavailable' && (
            <div className="page__section-tight">
              <Notice tone="warning" title="Demo data">
                These events come from the sample adapter, plus the actions you take in this session. No server activity is shown.
              </Notice>
            </div>
          )}

          {state.kind === 'unavailable' ? (
            <StateMessage icon={<Activity size={18} />} title="Logs aren’t available on this backend">
              The connected API doesn’t expose <code>GET /logs</code>. Once it does (see <code>API_CONTRACT.md</code>), request, retrieval and error events will
              appear here.
            </StateMessage>
          ) : (
            <>
              <div className="toolbar" role="search">
                <div className="search-input toolbar__search">
                  <Search size={14} aria-hidden="true" />
                  <input className="input" type="search" placeholder="Search message or request ID" aria-label="Search logs" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <select className="select toolbar__select" aria-label="Filter by severity" value={level} onChange={(e) => setLevel(e.target.value as LogLevel | '')}>
                  <option value="">All severities</option>
                  {LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <select
                  className="select toolbar__select"
                  aria-label="Filter by event type"
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  disabled={state.kind !== 'ready' || state.eventTypes.length === 0}
                >
                  <option value="">All events</option>
                  {state.kind === 'ready' &&
                    state.eventTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                </select>
                <div className="toolbar__end">
                  {filtersActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSearch('');
                        setLevel('');
                        setEvent('');
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden="true" className={refreshing ? 'spinner' : undefined} />} onClick={() => setReloadKey((k) => k + 1)} disabled={refreshing}>
                    Refresh
                  </Button>
                  {state.kind === 'ready' && state.items.length > 0 && (
                    <IconButton label="Export loaded events as JSON" onClick={exportLoaded} tooltipSide="left">
                      <Download size={16} aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              </div>

              {state.kind === 'loading' && <LogSkeleton />}

              {state.kind === 'error' && (
                <StateMessage
                  tone="error"
                  title="Couldn’t load activity logs"
                  actions={
                    <Button variant="primary" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={() => setReloadKey((k) => k + 1)}>
                      Try again
                    </Button>
                  }
                  detail={state.error.status ? `HTTP ${state.error.status}` : undefined}
                >
                  {state.error.message}
                </StateMessage>
              )}

              {state.kind === 'ready' && state.items.length === 0 && (
                <p className="table-empty">{filtersActive ? 'No events match these filters.' : 'No activity has been recorded yet.'}</p>
              )}

              {state.kind === 'ready' && state.items.length > 0 && (
                <>
                  <div className="logs" role="table" aria-label="Activity events" aria-busy={refreshing}>
                    <div className="logs__row logs__row--head" role="row">
                      <span role="columnheader">Time</span>
                      <span role="columnheader">Level</span>
                      <span role="columnheader">Event</span>
                      <span role="columnheader">Message</span>
                      <span role="columnheader">Request</span>
                      <span role="columnheader" className="num">
                        Duration
                      </span>
                    </div>
                    {state.items.map((item) => (
                      <LogRow key={item.id} item={item} expanded={expanded === item.id} onToggle={() => setExpanded((e) => (e === item.id ? null : item.id))} onCopy={copyId} />
                    ))}
                  </div>
                  <div className="logs__footer">
                    <span className="muted">
                      Showing {state.items.length} {state.items.length === 1 ? 'event' : 'events'}
                      {state.nextCursor ? '' : ' · end of results'}
                    </span>
                    {state.nextCursor && (
                      <Button variant="secondary" size="sm" loading={loadingMore} onClick={loadMore}>
                        Load older events
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function LogRow({ item, expanded, onToggle, onCopy }: { item: LogEvent; expanded: boolean; onToggle: () => void; onCopy: (id: string) => void }) {
  const lv = LEVEL[item.level];
  const detailsId = `log-${item.id}`;
  const fields: [string, string | undefined][] = [
    ['Timestamp', formatFull(item.timestamp)],
    ['Request ID', item.requestId],
    ['Conversation', item.conversationId],
    ['Document', item.documentId],
    ['Duration', formatDuration(item.durationMs) ?? undefined],
  ];
  const details = item.details ? (redact(item.details) as Record<string, unknown>) : null;

  return (
    <div className={`logs__item ${expanded ? 'is-expanded' : ''} logs__item--${item.level}`} role="rowgroup">
      <div className="logs__row" role="row">
        <span role="cell" className="logs__time mono">
          <button type="button" className="logs__toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={onToggle}>
            <ChevronRight size={14} aria-hidden="true" className="logs__chev" />
            <span className="visually-hidden">{expanded ? 'Hide' : 'Show'} details for event at </span>
            <time dateTime={item.timestamp} title={formatFull(item.timestamp)}>
              {formatLogTime(item.timestamp)}
            </time>
          </button>
          <span className="logs__day">{relativeDay(item.timestamp)}</span>
        </span>
        <span role="cell">
          <StatusLabel tone={lv.tone} boxed>
            {lv.label}
          </StatusLabel>
        </span>
        <span role="cell" className="logs__event mono">
          {item.event}
        </span>
        <span role="cell" className="logs__msg">
          {item.message}
        </span>
        <span role="cell" className="logs__req">
          {item.requestId ? (
            <span className="logs__req-inner">
              <span className="mono">{item.requestId}</span>
              <IconButton label="Copy request ID" className="logs__copy" onClick={() => onCopy(item.requestId!)} tooltipSide="left">
                <Copy size={13} aria-hidden="true" />
              </IconButton>
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </span>
        <span role="cell" className="logs__dur mono num">
          {formatDuration(item.durationMs) ?? <span className="muted">—</span>}
        </span>
      </div>
      {expanded && (
        <div id={detailsId} className="logs__details" role="row">
          <div role="cell">
            <dl className="meta-list">
              {fields
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k} style={{ display: 'contents' }}>
                    <dt>{k}</dt>
                    <dd className="mono">{v}</dd>
                  </div>
                ))}
            </dl>
            {details && Object.keys(details).length > 0 ? (
              <>
                <p className="section-label logs__details-label">Details</p>
                <pre className="logs__json">{JSON.stringify(details, null, 2)}</pre>
                <p className="fine-print">Values under credential-like keys are redacted before display.</p>
              </>
            ) : (
              <p className="fine-print">No structured details were recorded for this event.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className="logs" aria-busy="true" aria-label="Loading activity logs">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="logs__row logs__row--skeleton">
          <Skeleton width={90} />
          <Skeleton width={60} />
          <Skeleton width={110} />
          <Skeleton width={`${50 + ((i * 17) % 40)}%`} />
        </div>
      ))}
    </div>
  );
}
