import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

interface Props {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  detail?: ReactNode;
  tone?: 'neutral' | 'error';
  headingLevel?: 'h1' | 'h2' | 'h3';
}

/** Shared empty/error state: left-aligned, one clear next step. */
export function StateMessage({ icon, title, children, actions, detail, tone = 'neutral', headingLevel = 'h2' }: Props) {
  const H = headingLevel;
  return (
    <div className={`state ${tone === 'error' ? 'state--error' : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="state__icon" aria-hidden="true">
        {icon ?? <AlertCircle size={18} />}
      </div>
      <H className="state__title">{title}</H>
      {children && <div className="state__body">{children}</div>}
      {actions && <div className="state__actions">{actions}</div>}
      {detail && <div className="state__detail mono">{detail}</div>}
    </div>
  );
}
