import { AlertCircle, CheckCircle, Info, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

const ICON = {
  info: Info,
  warning: TriangleAlert,
  error: AlertCircle,
  success: CheckCircle,
};

export function Notice({
  tone,
  title,
  children,
  actions,
  live,
}: {
  tone: keyof typeof ICON;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  live?: boolean;
}) {
  const Icon = ICON[tone];
  return (
    <div className={`notice notice--${tone}`} role={live ? (tone === 'error' ? 'alert' : 'status') : undefined}>
      <Icon size={16} aria-hidden="true" />
      <div className="notice__body">
        {title && <div className="notice__title">{title}</div>}
        {children && <div className={title ? 'muted' : undefined}>{children}</div>}
        {actions && <div className="notice__actions">{actions}</div>}
      </div>
    </div>
  );
}
