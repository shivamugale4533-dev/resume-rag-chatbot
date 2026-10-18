import type {
  ChatRequest,
  ChatResponse,
  EvaluationRun,
  EvaluationRunDetail,
  HealthInfo,
  LogPage,
  LogQuery,
  ResumeDocument,
  ServiceMode,
  UploadConfig,
} from '../types';

export interface UploadOptions {
  signal?: AbortSignal;
  /** 0–1 when the transport can measure it. */
  onProgress?: (fraction: number) => void;
}

/**
 * The single boundary between UI and data. Components never call fetch directly;
 * they receive one of the adapters below through ServiceContext.
 *
 * Methods throw ApiError. kind === 'not_implemented' means the backend does not
 * expose that endpoint (404/405/501), and the UI shows an "unavailable" state.
 */
export interface ResumeDeskService {
  readonly mode: ServiceMode;
  readonly baseUrl: string | null;

  getHealth(signal?: AbortSignal): Promise<HealthInfo>;
  getUploadConfig(signal?: AbortSignal): Promise<UploadConfig>;

  /** Currently active (indexed or processing) resume, or null if none. */
  getResume(signal?: AbortSignal): Promise<ResumeDocument | null>;
  /** Status of a specific upload, used for polling while processing. */
  getResumeStatus(id: string, signal?: AbortSignal): Promise<ResumeDocument>;
  uploadResume(file: File, opts?: UploadOptions): Promise<ResumeDocument>;

  ask(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  /** Drop server-side memory for a session. Optional on the backend. */
  endSession(sessionId: string): Promise<void>;

  listEvaluations(signal?: AbortSignal): Promise<EvaluationRun[]>;
  getEvaluation(id: string, signal?: AbortSignal): Promise<EvaluationRunDetail>;
  startEvaluation(): Promise<EvaluationRun>;

  listLogs(query: LogQuery, signal?: AbortSignal): Promise<LogPage>;
}
