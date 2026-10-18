/* Domain types shared by the UI and both service adapters.
 * Field names are camelCase here; the HTTP adapter maps the snake_case
 * FastAPI payloads documented in API_CONTRACT.md onto these shapes. */

export type ServiceMode = 'live' | 'demo';

/* ---------- Resume ---------- */

export type DocumentStatus = 'uploaded' | 'extracting' | 'indexing' | 'indexed' | 'failed';

export interface ResumeDocument {
  id: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  status: DocumentStatus;
  /** Human-readable failure reason supplied by the backend. */
  error?: string;
  pageCount?: number;
  sectionCount?: number;
  chunkCount?: number;
}

export interface UploadConfig {
  /** Lower-case extensions without the dot, e.g. ["pdf", "docx"]. */
  acceptedExtensions: string[];
  /** null = no limit known to the client. */
  maxUploadBytes: number | null;
  /** Where the constraints came from, so the UI can be honest about them. */
  source: 'backend' | 'client-config';
}

/* ---------- Chat ---------- */

export interface RetrievedSource {
  /** 1-based position used by inline citation markers like [1]. */
  index: number;
  text: string;
  section?: string;
  page?: number;
  /** Raw retrieval score exactly as returned; no unit is assumed. */
  score?: number;
  chunkId?: string;
}

export type MessageRole = 'user' | 'assistant';

export interface ChatTurn {
  role: MessageRole;
  content: string;
}

export interface ChatRequest {
  sessionId: string;
  question: string;
  /** Prior turns of this conversation only, oldest first. */
  history: ChatTurn[];
}

export interface ChatResponse {
  answer: string;
  /** undefined = backend did not report sources; [] = it reported none. */
  sources?: RetrievedSource[];
  /** True when the backend asks the user to clarify an ambiguous follow-up. */
  needsClarification?: boolean;
}

export interface MessageError {
  kind: ApiErrorKind;
  message: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status: 'done' | 'pending' | 'error';
  sources?: RetrievedSource[];
  error?: MessageError;
}

export interface Conversation {
  id: string;
  /** Identifier sent to the backend so follow-ups share memory. */
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** The resume this conversation was answered against. */
  resumeId: string | null;
  resumeFilename: string | null;
  messages: ChatMessage[];
}

/* ---------- Evaluation ---------- */

export const METRIC_KEYS = [
  'faithfulness',
  'answer_relevancy',
  'context_precision',
  'context_recall',
  'answer_correctness',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

/** null = metric not computed / evaluator failed. Missing key = not reported. */
export type MetricScores = Partial<Record<MetricKey, number | null>>;

export type EvaluationStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface EvaluationRun {
  id: string;
  status: EvaluationStatus;
  createdAt: string;
  completedAt?: string;
  dataset?: string;
  caseCount?: number;
  failedCount?: number;
  scores: MetricScores;
  /** Inclusive score range declared by the backend, e.g. [0, 1]. */
  scoreRange?: [number, number];
  error?: string;
  /** True only for bundled demo data. */
  isSample?: boolean;
}

export type CaseStatus = 'passed' | 'failed' | 'error';

export interface EvaluationCase {
  id: string;
  question: string;
  groundTruth?: string;
  answer?: string;
  contexts?: string[];
  scores: MetricScores;
  status?: CaseStatus;
  error?: string;
  feedback?: string;
}

export interface EvaluationRunDetail extends EvaluationRun {
  cases: EvaluationCase[];
}

/* ---------- Logs ---------- */

export type LogLevel = 'debug' | 'info' | 'success' | 'warning' | 'error';

export interface LogEvent {
  id: string;
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  requestId?: string;
  durationMs?: number;
  conversationId?: string;
  documentId?: string;
  details?: Record<string, unknown>;
}

export interface LogQuery {
  level?: LogLevel;
  event?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}

export interface LogPage {
  items: LogEvent[];
  nextCursor?: string;
  /** Event types the backend can emit, for the filter menu. */
  eventTypes?: string[];
}

/* ---------- Errors / health ---------- */

export type ApiErrorKind =
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'not_implemented'
  | 'not_found'
  | 'invalid_request'
  | 'unsupported_file'
  | 'too_large'
  | 'server'
  | 'invalid_response';

export interface HealthInfo {
  ok: boolean;
  version?: string;
}
