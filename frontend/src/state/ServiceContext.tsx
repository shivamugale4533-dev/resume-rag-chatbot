import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ResumeDeskService } from '../services';
import { toApiError } from '../services';

export type ConnectionState = 'demo' | 'checking' | 'connected' | 'unavailable';

interface ServiceCtx {
  service: ResumeDeskService;
  connection: ConnectionState;
  recheck: () => Promise<void>;
  /** Components call this when a request fails at the network level. */
  reportFailure: (err: unknown) => void;
}

const Ctx = createContext<ServiceCtx | null>(null);

export function ServiceProvider({ service, children }: { service: ResumeDeskService; children: ReactNode }) {
  const [connection, setConnection] = useState<ConnectionState>(service.mode === 'demo' ? 'demo' : 'checking');
  const inflight = useRef<Promise<void> | null>(null);

  const recheck = useCallback(async () => {
    if (service.mode === 'demo') return;
    if (inflight.current) return inflight.current;
    setConnection('checking');
    inflight.current = service
      .getHealth()
      .then(() => setConnection('connected'))
      .catch(() => setConnection('unavailable'))
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, [service]);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  const reportFailure = useCallback(
    (err: unknown) => {
      if (service.mode === 'demo') return;
      const e = toApiError(err);
      if (e.kind === 'network') setConnection('unavailable');
    },
    [service.mode],
  );

  const value = useMemo(() => ({ service, connection, recheck, reportFailure }), [service, connection, recheck, reportFailure]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useService(): ServiceCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useService must be used inside ServiceProvider');
  return ctx;
}
