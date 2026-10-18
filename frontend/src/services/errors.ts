import type { ApiErrorKind } from '../types';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  /** Technical detail for logs/devtools — never rendered as primary copy. */
  readonly detail?: string;

  constructor(kind: ApiErrorKind, message: string, opts: { status?: number; detail?: string } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = opts.status;
    this.detail = opts.detail;
  }
}

const FRIENDLY: Record<ApiErrorKind, string> = {
  network: "Can't reach the Resume Desk API. Check that the backend is running and try again.",
  timeout: 'The request took too long to respond. Try again in a moment.',
  aborted: 'The request was cancelled.',
  not_implemented: "This feature isn't available on the connected backend yet.",
  not_found: 'The requested item could not be found.',
  invalid_request: 'The request was rejected. Check the input and try again.',
  unsupported_file: 'This file type is not supported.',
  too_large: 'This file is larger than the upload limit.',
  server: 'The server ran into a problem handling this request.',
  invalid_response: 'The server returned a response the app could not read.',
};

export function friendlyMessage(kind: ApiErrorKind): string {
  return FRIENDLY[kind];
}

/** Normalises anything thrown into an ApiError so the UI has one shape to handle. */
export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof DOMException && err.name === 'AbortError') {
    return new ApiError('aborted', FRIENDLY.aborted);
  }
  if (err instanceof TypeError) {
    return new ApiError('network', FRIENDLY.network, { detail: err.message });
  }
  return new ApiError('server', FRIENDLY.server, { detail: err instanceof Error ? err.message : String(err) });
}

export function isAbort(err: unknown): boolean {
  return (
    (err instanceof ApiError && err.kind === 'aborted') ||
    (err instanceof DOMException && err.name === 'AbortError')
  );
}
