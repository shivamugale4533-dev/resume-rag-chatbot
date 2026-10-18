import type {
  CaseStatus,
  ChatResponse,
  DocumentStatus,
  EvaluationCase,
  EvaluationRun,
  EvaluationStatus,
  LogEvent,
  LogLevel,
  LogPage,
  MetricScores,
  ResumeDocument,
  RetrievedSource,
  UploadConfig,
} from '../types';
import { METRIC_KEYS } from '../types';
import { appConfig } from './config';
import { ApiError, friendlyMessage, toApiError } from './errors';
import type { ResumeDeskService, UploadOptions } from './service';

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>;

function errorFromStatus(status: number, body: unknown): ApiError {
  const detail = extractDetail(body);
  if (status === 404 || status === 405 || status === 501) {
    // 404 on a collection route means the endpoint is not implemented; callers
    // that expect "resource missing" check for this explicitly.
    return new ApiError(status === 404 ? 'not_found' : 'not_implemented', friendlyMessage('not_implemented'), {
      status,
      detail,
    });
  }
  if (status === 413) return new ApiError('too_large', detail ?? friendlyMessage('too_large'), { status, detail });
  if (status === 415) return new ApiError('unsupported_file', detail ?? friendlyMessage('unsupported_file'), { status, detail });
  if (status === 400 || status === 422) {
    return new ApiError('invalid_request', detail ?? friendlyMessage('invalid_request'), { status, detail });
  }
  if (status === 408 || status === 504) return new ApiError('timeout', friendlyMessage('timeout'), { status, detail });
  return new ApiError('server', friendlyMessage('server'), { status, detail });
}

/** FastAPI uses {"detail": "..."} or {"detail": [{"msg": "..."}]}. Only short, plain strings are surfaced. */
function extractDetail(body: unknown): string | undefined {
  if (!isObj(body)) return undefined;
  const d = body.detail;
  if (typeof d === 'string' && d.length < 300) return d;
  if (Array.isArray(d) && isObj(d[0]) && typeof d[0].msg === 'string') return d[0].msg;
  return undefined;
}

async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const { timeoutMs = appConfig.timeouts.default, signal, ...rest } = init;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  try {
    const res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(rest.body && !(rest.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...rest.headers },
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        if (res.ok) throw new ApiError('invalid_response', friendlyMessage('invalid_response'));
      }
    }
    if (!res.ok) throw errorFromStatus(res.status, body);
    return body as T;
  } catch (err) {
    if (timedOut) throw new ApiError('timeout', friendlyMessage('timeout'));
    throw toApiError(err);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** XHR is used for uploads because fetch cannot report upload progress. */
function uploadWithProgress(path: string, form: FormData, opts: UploadOptions): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${appConfig.apiBaseUrl}${path}`);
    xhr.timeout = appConfig.timeouts.upload;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(errorFromStatus(xhr.status, body));
    };
    xhr.onerror = () => reject(new ApiError('network', friendlyMessage('network')));
    xhr.ontimeout = () => reject(new ApiError('timeout', friendlyMessage('timeout')));
    xhr.onabort = () => reject(new ApiError('aborted', friendlyMessage('aborted')));
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

/* ------------------------------------------------------------------ */
/* Response mapping (snake_case → domain), with light validation       */
/* ------------------------------------------------------------------ */

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const str = (v: unknown) => (typeof v === 'string' && v.length ? v : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function invalid(what: string): ApiError {
  return new ApiError('invalid_response', friendlyMessage('invalid_response'), { detail: `Unexpected ${what} payload` });
}

const DOC_STATUSES: DocumentStatus[] = ['uploaded', 'extracting', 'indexing', 'indexed', 'failed'];

function mapResume(v: unknown): ResumeDocument {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.filename !== 'string') throw invalid('resume');
  const status = DOC_STATUSES.includes(v.status as DocumentStatus) ? (v.status as DocumentStatus) : 'uploaded';
  return {
    id: v.id,
    filename: v.filename,
    contentType: str(v.content_type),
    sizeBytes: num(v.size_bytes),
    uploadedAt: str(v.uploaded_at),
    status,
    error: str(v.error),
    pageCount: num(v.page_count),
    sectionCount: num(v.section_count),
    chunkCount: num(v.chunk_count),
  };
}

function mapSources(v: unknown): RetrievedSource[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter(isObj).flatMap((s, i) => {
    const text = str(s.text) ?? str(s.content) ?? str(s.page_content);
    if (!text) return [];
    return [
      {
        index: num(s.index) ?? i + 1,
        text,
        section: str(s.section),
        page: num(s.page),
        score: num(s.score),
        chunkId: str(s.chunk_id),
      },
    ];
  });
}

function mapScores(v: unknown): MetricScores {
  const out: MetricScores = {};
  if (!isObj(v)) return out;
  for (const key of METRIC_KEYS) {
    if (key in v) out[key] = num(v[key]) ?? null;
  }
  return out;
}

const RUN_STATUSES: EvaluationStatus[] = ['queued', 'running', 'completed', 'failed'];

function mapRun(v: unknown): EvaluationRun {
  if (!isObj(v) || typeof v.id !== 'string') throw invalid('evaluation run');
  const range = Array.isArray(v.score_range) && v.score_range.length === 2 ? v.score_range.map(num) : undefined;
  return {
    id: v.id,
    status: RUN_STATUSES.includes(v.status as EvaluationStatus) ? (v.status as EvaluationStatus) : 'completed',
    createdAt: str(v.created_at) ?? '',
    completedAt: str(v.completed_at),
    dataset: str(v.dataset),
    caseCount: num(v.case_count),
    failedCount: num(v.failed_count),
    scores: mapScores(v.scores),
    scoreRange: range && range[0] !== undefined && range[1] !== undefined ? [range[0], range[1]] : undefined,
    error: str(v.error),
  };
}

function mapCase(v: unknown, i: number): EvaluationCase {
  if (!isObj(v) || typeof v.question !== 'string') throw invalid('evaluation case');
  const status = ['passed', 'failed', 'error'].includes(v.status as string) ? (v.status as CaseStatus) : undefined;
  return {
    id: str(v.id) ?? `case-${i + 1}`,
    question: v.question,
    groundTruth: str(v.ground_truth),
    answer: str(v.answer),
    contexts: Array.isArray(v.contexts) ? v.contexts.filter((c): c is string => typeof c === 'string') : undefined,
    scores: mapScores(v.scores),
    status,
    error: str(v.error),
    feedback: str(v.feedback),
  };
}

const LEVELS: LogLevel[] = ['debug', 'info', 'success', 'warning', 'error'];

function mapLog(v: unknown, i: number): LogEvent {
  if (!isObj(v)) throw invalid('log');
  const LEVEL_ALIASES: Record<string, LogLevel> = { warn: 'warning', critical: 'error', fatal: 'error' };
  const lower = String(v.level ?? 'info').toLowerCase();
  const rawLevel = LEVEL_ALIASES[lower] ?? lower;
  return {
    id: str(v.id) ?? `${str(v.timestamp) ?? 't'}-${i}`,
    timestamp: str(v.timestamp) ?? '',
    level: LEVELS.includes(rawLevel as LogLevel) ? (rawLevel as LogLevel) : 'info',
    event: str(v.event) ?? 'event',
    message: str(v.message) ?? '',
    requestId: str(v.request_id),
    durationMs: num(v.duration_ms),
    conversationId: str(v.conversation_id),
    documentId: str(v.document_id),
    details: isObj(v.details) ? v.details : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Adapter                                                             */
/* ------------------------------------------------------------------ */

export function createHttpAdapter(): ResumeDeskService {
  return {
    mode: 'live',
    baseUrl: appConfig.apiBaseUrl,

    async getHealth(signal) {
      const body = await request<unknown>('/health', { signal, timeoutMs: 6000 });
      return { ok: true, version: isObj(body) ? str(body.version) : undefined };
    },

    async getUploadConfig(signal): Promise<UploadConfig> {
      try {
        const body = await request<unknown>('/config', { signal });
        if (isObj(body) && Array.isArray(body.accepted_extensions)) {
          return {
            acceptedExtensions: body.accepted_extensions
              .filter((e): e is string => typeof e === 'string')
              .map((e) => e.replace(/^\./, '').toLowerCase()),
            maxUploadBytes: num(body.max_upload_bytes) ?? null,
            source: 'backend',
          };
        }
      } catch (err) {
        const e = toApiError(err);
        if (e.kind !== 'not_found' && e.kind !== 'not_implemented') throw e;
      }
      return {
        acceptedExtensions: appConfig.fallbackAcceptedExtensions,
        maxUploadBytes: appConfig.fallbackMaxUploadBytes,
        source: 'client-config',
      };
    },

    async getResume(signal) {
      try {
        const body = await request<unknown>('/resume', { signal });
        return body === null ? null : mapResume(body);
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'not_found') return null;
        throw err;
      }
    },

    async getResumeStatus(id, signal) {
      return mapResume(await request<unknown>(`/resume/${encodeURIComponent(id)}/status`, { signal }));
    },

    async uploadResume(file, opts = {}) {
      const form = new FormData();
      form.append('file', file, file.name);
      return mapResume(await uploadWithProgress('/resume', form, opts));
    },

    async ask(req, signal): Promise<ChatResponse> {
      const body = await request<unknown>('/chat', {
        method: 'POST',
        signal,
        timeoutMs: appConfig.timeouts.chat,
        body: JSON.stringify({ session_id: req.sessionId, question: req.question, history: req.history }),
      });
      if (!isObj(body) || typeof body.answer !== 'string') throw invalid('chat');
      return {
        answer: body.answer,
        sources: mapSources(body.sources),
        needsClarification: body.needs_clarification === true,
      };
    },

    async endSession(sessionId) {
      try {
        await request(`/chat/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      } catch {
        // Optional endpoint; the session simply expires server-side if absent.
      }
    },

    async listEvaluations(signal) {
      try {
        const body = await request<unknown>('/evaluations', { signal });
        const list = Array.isArray(body) ? body : isObj(body) && Array.isArray(body.runs) ? body.runs : null;
        if (!list) throw invalid('evaluation list');
        return list.map(mapRun);
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'not_found') {
          throw new ApiError('not_implemented', friendlyMessage('not_implemented'), { status: 404, detail: 'GET /evaluations' });
        }
        throw err;
      }
    },

    async getEvaluation(id, signal) {
      const body = await request<unknown>(`/evaluations/${encodeURIComponent(id)}`, { signal });
      const run = mapRun(body);
      const cases = isObj(body) && Array.isArray(body.cases) ? body.cases.map(mapCase) : [];
      return { ...run, cases };
    },

    async startEvaluation() {
      try {
        return mapRun(await request<unknown>('/evaluations', { method: 'POST', body: '{}', timeoutMs: 30_000 }));
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'not_found') {
          throw new ApiError('not_implemented', friendlyMessage('not_implemented'), { status: 404, detail: 'POST /evaluations' });
        }
        throw err;
      }
    },

    async listLogs(query, signal) {
      const params = new URLSearchParams();
      if (query.level) params.set('level', query.level);
      if (query.event) params.set('event', query.event);
      if (query.search) params.set('q', query.search);
      if (query.cursor) params.set('cursor', query.cursor);
      params.set('limit', String(query.limit ?? 50));
      try {
        const body = await request<unknown>(`/logs?${params}`, { signal });
        const items = Array.isArray(body) ? body : isObj(body) && Array.isArray(body.items) ? body.items : null;
        if (!items) throw invalid('logs');
        return {
          items: items.map(mapLog),
          nextCursor: isObj(body) ? str(body.next_cursor) : undefined,
          eventTypes:
            isObj(body) && Array.isArray(body.event_types)
              ? body.event_types.filter((e): e is string => typeof e === 'string')
              : undefined,
        } satisfies LogPage;
      } catch (err) {
        if (err instanceof ApiError && err.kind === 'not_found') {
          throw new ApiError('not_implemented', friendlyMessage('not_implemented'), { status: 404, detail: 'GET /logs' });
        }
        throw err;
      }
    },
  };
}
