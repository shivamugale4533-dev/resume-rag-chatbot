/* Explicit, opt-in demo adapter (VITE_DEMO_MODE=true). It implements the same
 * ResumeDeskService interface as the HTTP adapter so no component knows which
 * one it is talking to. It is never used as a fallback for a failing backend. */

import type {
  ChatRequest,
  ChatResponse,
  EvaluationCase,
  EvaluationRunDetail,
  LogEvent,
  LogLevel,
  MetricScores,
  ResumeDocument,
  RetrievedSource,
} from '../types';
import { METRIC_KEYS } from '../types';
import { appConfig } from './config';
import {
  DEMO_ANSWERS,
  DEMO_CHUNKS,
  DEMO_EVAL_CASES,
  DEMO_FILENAME,
  DEMO_PREVIOUS_RUN_CASES,
  chunk,
  type DemoTopic,
} from './demoData';
import { ApiError, friendlyMessage } from './errors';
import type { ResumeDeskService } from './service';

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new ApiError('aborted', friendlyMessage('aborted')));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new ApiError('aborted', friendlyMessage('aborted')));
    });
  });

const rid = () => `req_${Math.random().toString(16).slice(2, 10)}`;
const iso = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString();

/* ---------- Question routing (keyword intent + follow-up resolution) ---------- */

function detectTopic(q: string): DemoTopic | null {
  const t = q.toLowerCase();
  if (/\blanguages?\b|programming/.test(t)) return 'languages';
  if (/lead|leadership|mentor|manag/.test(t)) return 'leadership';
  if (/qualif|educat|degree|universit|certif|study|studied/.test(t)) return 'qualifications';
  if (/python|machine learning|\bml\b|project/.test(t)) return 'ml_projects';
  if (/summar|experience|background|career|overview/.test(t)) return 'experience';
  return null;
}

const FOLLOW_UP = /\b(those|these|them|they|that|it|this|the first|the second|the last|more)\b/i;

function lastUserTopic(history: ChatRequest['history']): DemoTopic | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (turn?.role === 'user') {
      const topic = detectTopic(turn.content);
      if (topic) return topic;
    }
  }
  return null;
}

function toSources(ids: string[]): RetrievedSource[] {
  return ids.map((id, i) => {
    const c = chunk(id);
    return { index: i + 1, text: c.text, section: c.section, page: c.page, chunkId: c.id };
  });
}

function keywordRetrieve(q: string): string[] {
  const words = q.toLowerCase().split(/[^a-z0-9+-]+/).filter((w) => w.length > 2);
  return DEMO_CHUNKS.map((c) => {
    const hay = `${c.text} ${c.keywords.join(' ')}`.toLowerCase();
    return { id: c.id, score: words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0) };
  })
    .filter((x) => x.score >= 2 || (words.length <= 3 && x.score >= 1))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.id);
}

function answerQuestion(req: ChatRequest): ChatResponse {
  const q = req.question;
  const own = detectTopic(q);
  const prev = lastUserTopic(req.history);
  const isFollowUp = FOLLOW_UP.test(q);

  if (isFollowUp && prev === 'languages' && /project|use|used|work/i.test(q)) {
    const a = DEMO_ANSWERS.languages_in_projects;
    return { answer: a.answer, sources: toSources(a.chunks) };
  }
  // Plural back-references ("those", "them") can't be resolved without an
  // earlier answer, even if the question also names a topic — ask, don't guess.
  if (!prev && /\b(those|these|them)\b/i.test(q)) {
    return {
      answer:
        "Could you say which part of the resume you mean? There's no earlier answer in this conversation for that to refer to yet.",
      sources: [],
      needsClarification: true,
    };
  }
  if (own) {
    const a = DEMO_ANSWERS[own];
    return { answer: a.answer, sources: toSources(a.chunks) };
  }
  if (isFollowUp && prev) {
    const ids = DEMO_ANSWERS[prev].chunks;
    const bullets = ids.map((id, i) => `- ${chunk(id).text.split('. ')[0]}. [${i + 1}]`).join('\n');
    return {
      answer: `Continuing from the previous answer, these are the passages it was based on:\n\n${bullets}\n\nAsk about a specific item if you'd like more detail.`,
      sources: toSources(ids),
    };
  }
  if (isFollowUp && !prev) {
    return {
      answer:
        "Could you say which part of the resume you mean? There's no earlier answer in this conversation for that to refer to yet.",
      sources: [],
      needsClarification: true,
    };
  }
  const ids = keywordRetrieve(q);
  if (!ids.length) {
    return {
      answer:
        "I couldn't find anything in the resume that addresses this. The document covers a summary, work experience, projects, skills, education and certifications.",
      sources: [],
    };
  }
  const quoted = ids.map((id, i) => `- **${chunk(id).section}:** ${chunk(id).text.split('. ')[0]}. [${i + 1}]`).join('\n');
  return {
    answer: `These are the passages most related to your question:\n\n${quoted}\n\nI've quoted them directly because the question doesn't map onto a single section of the resume.`,
    sources: toSources(ids),
  };
}

/* ---------- Seed logs ---------- */

function seedLogs(): LogEvent[] {
  const out: LogEvent[] = [];
  const add = (minsAgo: number, level: LogLevel, event: string, message: string, extra: Partial<LogEvent> = {}) =>
    out.push({ id: `seed-${out.length}`, timestamp: iso(minsAgo * 60_000), level, event, message, requestId: rid(), ...extra });

  add(118, 'info', 'resume.upload', `Received ${DEMO_FILENAME} (186 KB)`, { documentId: 'doc_demo_01', durationMs: 412 });
  add(118, 'info', 'document.extract', 'Extracted text from 2 pages, 6 sections', { documentId: 'doc_demo_01', durationMs: 1840 });
  add(117, 'success', 'index.build', 'Indexed 9 chunks', { documentId: 'doc_demo_01', durationMs: 2310, details: { chunk_count: 9, embedding_model: 'sample-embedding-model', chunk_size: 512 } });
  const qs = [
    ['Summarize the candidate’s most relevant experience.', 'experience'],
    ['Which projects demonstrate Python or machine learning skills?', 'ml_projects'],
    ['What evidence supports their leadership experience?', 'leadership'],
  ] as const;
  qs.forEach(([q, topic], i) => {
    const m = 96 - i * 21;
    const req = rid();
    add(m, 'info', 'request.received', 'POST /chat', { requestId: req, conversationId: `conv_demo_${i + 1}` });
    add(m, 'info', 'retrieval.executed', `Retrieved ${DEMO_ANSWERS[topic].chunks.length} passages`, {
      requestId: req,
      durationMs: 140 + i * 23,
      conversationId: `conv_demo_${i + 1}`,
      details: { query: q, top_k: 4, returned: DEMO_ANSWERS[topic].chunks },
    });
    add(m, 'success', 'answer.generated', 'Answer generated with citations', { requestId: req, durationMs: 2100 + i * 380, conversationId: `conv_demo_${i + 1}` });
  });
  add(40, 'warning', 'retrieval.executed', 'Retrieval returned no passages above threshold', {
    durationMs: 131,
    details: { query: 'Has the candidate worked with Kubernetes?', top_k: 4, returned: [] },
  });
  add(31, 'error', 'request.failed', 'POST /chat failed: language model request timed out', {
    durationMs: 90_000,
    details: { status: 504, upstream: 'llm', authorization: 'Bearer sk-demo-not-real' },
  });
  add(22, 'info', 'evaluation.started', 'Evaluation run eval_demo_02 started (8 cases)');
  add(19, 'warning', 'evaluation.case', 'Case q08: evaluator timed out on answer_correctness');
  add(18, 'success', 'evaluation.completed', 'Evaluation run eval_demo_02 completed', { durationMs: 214_000 });
  return out.reverse();
}

/* ---------- Adapter ---------- */

interface PendingUpload {
  doc: ResumeDocument;
  startedAt: number;
  willFail: boolean;
}

export function createDemoAdapter(): ResumeDeskService {
  let active: ResumeDocument | null = {
    id: 'doc_demo_01',
    filename: DEMO_FILENAME,
    contentType: 'application/pdf',
    sizeBytes: 186_412,
    uploadedAt: iso(118 * 60_000),
    status: 'indexed',
    pageCount: 2,
    sectionCount: 6,
    chunkCount: 9,
  };
  const pending = new Map<string, PendingUpload>();
  const logs = seedLogs();

  const runs: EvaluationRunDetail[] = [
    {
      id: 'eval_demo_02',
      status: 'completed',
      createdAt: iso(22 * 60_000),
      completedAt: iso(18 * 60_000),
      dataset: 'resume-qa-sample',
      caseCount: DEMO_EVAL_CASES.length,
      failedCount: DEMO_EVAL_CASES.filter((c) => c.status !== 'passed').length,
      scores: averageScores(DEMO_EVAL_CASES),
      scoreRange: [0, 1],
      isSample: true,
      cases: DEMO_EVAL_CASES,
    },
    {
      id: 'eval_demo_01',
      status: 'completed',
      createdAt: iso(3 * 24 * 3600_000),
      completedAt: iso(3 * 24 * 3600_000 - 230_000),
      dataset: 'resume-qa-sample',
      caseCount: DEMO_PREVIOUS_RUN_CASES.length,
      failedCount: 1,
      scores: averageScores(DEMO_PREVIOUS_RUN_CASES),
      scoreRange: [0, 1],
      isSample: true,
      cases: DEMO_PREVIOUS_RUN_CASES,
    },
  ];

  const log = (level: LogLevel, event: string, message: string, extra: Partial<LogEvent> = {}) =>
    logs.unshift({ id: `live-${logs.length}-${Date.now()}`, timestamp: iso(), level, event, message, requestId: rid(), ...extra });

  return {
    mode: 'demo',
    baseUrl: null,

    async getHealth() {
      return { ok: true, version: 'demo' };
    },

    async getUploadConfig() {
      return {
        acceptedExtensions: appConfig.fallbackAcceptedExtensions,
        maxUploadBytes: appConfig.fallbackMaxUploadBytes ?? 10 * 1024 * 1024,
        source: 'client-config',
      };
    },

    async getResume(signal) {
      await wait(350, signal);
      return active ? { ...active } : null;
    },

    async getResumeStatus(id, signal) {
      await wait(200, signal);
      const p = pending.get(id);
      if (!p) {
        if (active?.id === id) return { ...active };
        throw new ApiError('not_found', friendlyMessage('not_found'));
      }
      const elapsed = Date.now() - p.startedAt;
      let doc: ResumeDocument;
      if (elapsed < 1500) doc = { ...p.doc, status: 'extracting' };
      else if (p.willFail) {
        doc = { ...p.doc, status: 'failed', error: 'No extractable text was found. The file may be a scanned image or password-protected.' };
        pending.delete(id);
        log('error', 'document.extract', `Extraction failed for ${p.doc.filename}`, { documentId: id });
      } else if (elapsed < 3500) doc = { ...p.doc, status: 'indexing', pageCount: 2, sectionCount: 6 };
      else {
        doc = { ...p.doc, status: 'indexed', pageCount: 2, sectionCount: 6, chunkCount: 9 };
        active = doc;
        pending.delete(id);
        log('success', 'index.build', `Indexed ${doc.filename}`, { documentId: id, durationMs: elapsed });
      }
      if (pending.has(id)) pending.set(id, { ...p, doc: { ...p.doc, status: doc.status } });
      return doc;
    },

    async uploadResume(file, opts = {}) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!appConfig.fallbackAcceptedExtensions.includes(ext)) {
        throw new ApiError('unsupported_file', `.${ext || '?'} files are not supported.`, { status: 415 });
      }
      for (let i = 1; i <= 10; i++) {
        await wait(110, opts.signal);
        opts.onProgress?.(i / 10);
      }
      if (/upload-?fail/i.test(file.name)) {
        log('error', 'resume.upload', `Upload of ${file.name} rejected`, { details: { status: 500 } });
        throw new ApiError('server', friendlyMessage('server'), { status: 500 });
      }
      const doc: ResumeDocument = {
        id: `doc_demo_${Date.now().toString(36)}`,
        filename: file.name,
        contentType: file.type || undefined,
        sizeBytes: file.size,
        uploadedAt: iso(),
        status: 'uploaded',
      };
      pending.set(doc.id, { doc, startedAt: Date.now(), willFail: /corrupt|scan/i.test(file.name) });
      log('info', 'resume.upload', `Received ${file.name}`, { documentId: doc.id });
      return doc;
    },

    async ask(req, signal) {
      const requestId = rid();
      log('info', 'request.received', 'POST /chat', { requestId, conversationId: req.sessionId });
      await wait(900 + Math.random() * 700, signal);
      if (/simulate (an )?error/i.test(req.question)) {
        log('error', 'request.failed', 'POST /chat failed: simulated upstream error', { requestId, conversationId: req.sessionId, details: { status: 502 } });
        throw new ApiError('server', friendlyMessage('server'), { status: 502 });
      }
      const res = answerQuestion(req);
      log('info', 'retrieval.executed', `Retrieved ${res.sources?.length ?? 0} passages`, {
        requestId,
        conversationId: req.sessionId,
        details: { query: req.question, history_turns: req.history.length, returned: res.sources?.map((s) => s.chunkId) ?? [] },
      });
      log('success', 'answer.generated', res.needsClarification ? 'Asked user to clarify follow-up' : 'Answer generated', { requestId, conversationId: req.sessionId });
      return res;
    },

    async endSession() {},

    async listEvaluations(signal) {
      await wait(400, signal);
      return runs.map(({ cases: _cases, ...run }) => run);
    },

    async getEvaluation(id, signal) {
      await wait(300, signal);
      const run = runs.find((r) => r.id === id);
      if (!run) throw new ApiError('not_found', friendlyMessage('not_found'));
      return run;
    },

    async startEvaluation() {
      await wait(300);
      const id = `eval_demo_${String(runs.length + 1).padStart(2, '0')}`;
      const run: EvaluationRunDetail = {
        id,
        status: 'running',
        createdAt: iso(),
        dataset: 'resume-qa-sample',
        caseCount: DEMO_EVAL_CASES.length,
        scores: {},
        scoreRange: [0, 1],
        isSample: true,
        cases: [],
      };
      runs.unshift(run);
      log('info', 'evaluation.started', `Evaluation run ${id} started (${DEMO_EVAL_CASES.length} cases)`);
      setTimeout(() => {
        const cases: EvaluationCase[] = DEMO_EVAL_CASES.map((c) => ({ ...c, status: c.status === 'error' ? 'passed' : c.status, error: undefined, scores: { ...c.scores, answer_correctness: c.scores.answer_correctness ?? 0.88 } }));
        Object.assign(run, {
          status: 'completed',
          completedAt: iso(),
          cases,
          failedCount: cases.filter((c) => c.status !== 'passed').length,
          scores: averageScores(cases),
        });
        log('success', 'evaluation.completed', `Evaluation run ${id} completed`);
      }, 6000);
      const { cases: _c, ...summary } = run;
      return summary;
    },

    async listLogs(query, signal) {
      await wait(300, signal);
      const search = query.search?.toLowerCase();
      const filtered = logs.filter(
        (l) =>
          (!query.level || l.level === query.level) &&
          (!query.event || l.event === query.event) &&
          (!search || l.message.toLowerCase().includes(search) || l.requestId?.toLowerCase().includes(search)),
      );
      const offset = Number(query.cursor ?? 0);
      const limit = query.limit ?? 25;
      const items = filtered.slice(offset, offset + limit);
      return {
        items,
        nextCursor: offset + limit < filtered.length ? String(offset + limit) : undefined,
        eventTypes: [...new Set(logs.map((l) => l.event))].sort(),
      };
    },
  };
}

function averageScores(cases: EvaluationCase[]): MetricScores {
  const out: MetricScores = {};
  for (const key of METRIC_KEYS) {
    const vals = cases.map((c) => c.scores[key]).filter((v): v is number => typeof v === 'number');
    out[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }
  return out;
}

