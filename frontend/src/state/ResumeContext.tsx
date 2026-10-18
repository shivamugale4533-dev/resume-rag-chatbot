import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { fileExtension, formatBytes } from '../lib/format';
import { ApiError, isAbort, toApiError } from '../services';
import type { ApiErrorKind, ResumeDocument, UploadConfig } from '../types';
import { useService } from './ServiceContext';
import { useToast } from './ToastContext';

/* The document lifecycle. `current` only ever holds a resume the backend has
 * confirmed as indexed; anything in flight lives in `upload`. */

export type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; file: File; progress: number | null }
  | { phase: 'processing'; file?: File; doc: ResumeDocument; stalled: boolean }
  | { phase: 'failed'; file?: File; filename: string; stage: 'upload' | 'processing'; kind: ApiErrorKind | 'processing'; message: string }
  | { phase: 'done'; doc: ResumeDocument };

interface ResumeCtx {
  loadState: 'loading' | 'ready' | 'error';
  loadError: ApiError | null;
  current: ResumeDocument | null;
  config: UploadConfig | null;
  upload: UploadState;
  reload: () => void;
  validate: (file: File) => string | null;
  startUpload: (file: File) => Promise<void>;
  retryUpload: () => void;
  checkStatusAgain: () => void;
  cancelUpload: () => void;
  clearUpload: () => void;
}

const Ctx = createContext<ResumeCtx | null>(null);

const POLL_MS = 1500;
const POLL_LIMIT_MS = 3 * 60_000;

export function ResumeProvider({ children }: { children: ReactNode }) {
  const { service, reportFailure } = useService();
  const toast = useToast();
  const [loadState, setLoadState] = useState<ResumeCtx['loadState']>('loading');
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [current, setCurrent] = useState<ResumeDocument | null>(null);
  const [config, setConfig] = useState<UploadConfig | null>(null);
  const [upload, setUpload] = useState<UploadState>({ phase: 'idle' });
  const uploadAbort = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /* ---- Initial load ---- */
  useEffect(() => {
    const ac = new AbortController();
    setLoadState('loading');
    setLoadError(null);
    Promise.all([service.getResume(ac.signal), service.getUploadConfig(ac.signal)])
      .then(([doc, cfg]) => {
        setConfig(cfg);
        if (!doc) setCurrent(null);
        else if (doc.status === 'indexed') setCurrent(doc);
        else if (doc.status === 'failed') {
          setCurrent(null);
          setUpload({
            phase: 'failed',
            filename: doc.filename,
            stage: 'processing',
            kind: 'processing',
            message: doc.error ?? "We couldn't process this file. Check the file type and try again.",
          });
        } else setUpload({ phase: 'processing', doc, stalled: false });
        setLoadState('ready');
      })
      .catch((err) => {
        if (isAbort(err)) return;
        reportFailure(err);
        setLoadError(toApiError(err));
        setLoadState('error');
      });
    return () => ac.abort();
  }, [service, reportFailure, reloadKey]);

  /* ---- Status polling while processing ---- */
  const processingId = upload.phase === 'processing' && !upload.stalled ? upload.doc.id : null;
  useEffect(() => {
    if (!processingId) return;
    const ac = new AbortController();
    const started = Date.now();
    const tick = async () => {
      try {
        const doc = await service.getResumeStatus(processingId, ac.signal);
        if (doc.status === 'indexed') {
          setCurrent(doc);
          setUpload({ phase: 'done', doc });
          toast.show('Resume indexed. Ready for questions.');
          return;
        }
        if (doc.status === 'failed') {
          setUpload((u) => ({
            phase: 'failed',
            file: u.phase === 'processing' ? u.file : undefined,
            filename: doc.filename,
            stage: 'processing',
            kind: 'processing',
            message: doc.error ?? "We couldn't process this file. Check the file type and try again.",
          }));
          return;
        }
        setUpload((u) => (u.phase === 'processing' ? { ...u, doc } : u));
        if (Date.now() - started > POLL_LIMIT_MS) {
          setUpload((u) => (u.phase === 'processing' ? { ...u, stalled: true } : u));
          return;
        }
      } catch (err) {
        if (isAbort(err)) return;
        reportFailure(err);
        // Transient errors: keep polling with the same cadence until the limit.
        if (Date.now() - started > POLL_LIMIT_MS) {
          setUpload((u) => (u.phase === 'processing' ? { ...u, stalled: true } : u));
          return;
        }
      }
      pollTimer.current = setTimeout(tick, POLL_MS);
    };
    pollTimer.current = setTimeout(tick, 600);
    return () => {
      ac.abort();
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [processingId, service, toast, reportFailure]);

  /* ---- Upload ---- */
  const validate = useCallback(
    (file: File): string | null => {
      const accepted = config?.acceptedExtensions ?? [];
      const ext = fileExtension(file.name);
      if (accepted.length && !accepted.includes(ext)) {
        return `${ext ? `.${ext} files aren't` : "This file isn't"} supported. Upload a ${accepted.map((e) => e.toUpperCase()).join(' or ')} file.`;
      }
      if (config?.maxUploadBytes && file.size > config.maxUploadBytes) {
        return `This file is ${formatBytes(file.size)}. The upload limit is ${formatBytes(config.maxUploadBytes)}.`;
      }
      if (file.size === 0) return 'This file is empty.';
      return null;
    },
    [config],
  );

  const startUpload = useCallback(
    async (file: File) => {
      const problem = validate(file);
      if (problem) {
        setUpload({ phase: 'failed', file, filename: file.name, stage: 'upload', kind: 'unsupported_file', message: problem });
        return;
      }
      uploadAbort.current?.abort();
      const ac = new AbortController();
      uploadAbort.current = ac;
      setUpload({ phase: 'uploading', file, progress: null });
      try {
        const doc = await service.uploadResume(file, {
          signal: ac.signal,
          onProgress: (p) => setUpload((u) => (u.phase === 'uploading' ? { ...u, progress: p } : u)),
        });
        if (doc.status === 'indexed') {
          setCurrent(doc);
          setUpload({ phase: 'done', doc });
          toast.show('Resume indexed. Ready for questions.');
        } else if (doc.status === 'failed') {
          setUpload({
            phase: 'failed',
            file,
            filename: file.name,
            stage: 'processing',
            kind: 'processing',
            message: doc.error ?? "We couldn't process this file. Check the file type and try again.",
          });
        } else {
          setUpload({ phase: 'processing', file, doc, stalled: false });
        }
      } catch (err) {
        if (isAbort(err)) {
          setUpload({ phase: 'idle' });
          return;
        }
        reportFailure(err);
        const e = toApiError(err);
        setUpload({ phase: 'failed', file, filename: file.name, stage: 'upload', kind: e.kind, message: e.message });
      }
    },
    [service, validate, toast, reportFailure],
  );

  const retryUpload = useCallback(() => {
    if (upload.phase === 'failed' && upload.file) void startUpload(upload.file);
  }, [upload, startUpload]);

  const checkStatusAgain = useCallback(() => {
    setUpload((u) => (u.phase === 'processing' ? { ...u, stalled: false } : u));
  }, []);

  const cancelUpload = useCallback(() => {
    uploadAbort.current?.abort();
  }, []);

  const clearUpload = useCallback(() => setUpload({ phase: 'idle' }), []);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  const value = useMemo(
    () => ({ loadState, loadError, current, config, upload, reload, validate, startUpload, retryUpload, checkStatusAgain, cancelUpload, clearUpload }),
    [loadState, loadError, current, config, upload, reload, validate, startUpload, retryUpload, checkStatusAgain, cancelUpload, clearUpload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useResume(): ResumeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useResume must be used inside ResumeProvider');
  return ctx;
}

/** True while a new or replacement resume is being uploaded or processed. */
export function isBusy(u: UploadState): boolean {
  return u.phase === 'uploading' || u.phase === 'processing';
}
