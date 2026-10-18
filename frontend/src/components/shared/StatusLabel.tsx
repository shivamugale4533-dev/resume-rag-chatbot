import { AlertCircle, CheckCircle, CircleDashed, Clock, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Spinner } from './Spinner';

export type Tone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const ICONS: Record<Tone, ReactNode> = {
  success: <CheckCircle size={14} aria-hidden="true" />,
  warning: <TriangleAlert size={14} aria-hidden="true" />,
  error: <AlertCircle size={14} aria-hidden="true" />,
  info: <Info size={14} aria-hidden="true" />,
  neutral: <CircleDashed size={14} aria-hidden="true" />,
};

/** Status is always conveyed by text + icon, never by colour alone. */
export function StatusLabel({
  tone,
  children,
  boxed,
  busy,
  icon,
}: {
  tone: Tone;
  children: ReactNode;
  boxed?: boolean;
  busy?: boolean;
  icon?: 'clock' | 'none';
}) {
  const glyph = busy ? <Spinner size={13} /> : icon === 'clock' ? <Clock size={14} aria-hidden="true" /> : icon === 'none' ? null : ICONS[tone];
  return (
    <span className={`status status--${tone} ${boxed ? 'status--boxed' : ''}`}>
      {glyph}
      {children}
    </span>
  );
}
