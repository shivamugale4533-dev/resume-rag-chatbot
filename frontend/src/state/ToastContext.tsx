import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { IconButton } from '../components/shared/IconButton';

type ToastTone = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON = { success: CheckCircle, error: AlertCircle, info: Info };

/** Transient confirmation only — persistent states are always shown inline too. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (message: string, tone: ToastTone = 'success') => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-2), { id, tone, message }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICON[t.tone];
          return (
            <div key={t.id} className={`toast toast--${t.tone}`}>
              <Icon size={16} aria-hidden="true" />
              <span className="toast__text">{t.message}</span>
              <IconButton label="Dismiss notification" noTooltip onClick={() => dismiss(t.id)}>
                <X size={14} aria-hidden="true" />
              </IconButton>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
