import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  /** Shorter visible tooltip when the accessible label is long. Defaults to label. */
  tooltip?: string;
  children: ReactNode;
  size?: 'md' | 'lg';
  tooltipSide?: 'bottom' | 'top' | 'left';
  /** Hide the visual tooltip (e.g. when a visible label sits next to it). */
  noTooltip?: boolean;
}

/** Icon-only control: always has an accessible name and a hover/focus tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { label, tooltip, children, size = 'md', tooltipSide = 'bottom', noTooltip, className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      data-tooltip={noTooltip ? undefined : (tooltip ?? label)}
      data-tooltip-side={tooltipSide}
      className={`icon-btn ${size === 'lg' ? 'icon-btn--lg' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
