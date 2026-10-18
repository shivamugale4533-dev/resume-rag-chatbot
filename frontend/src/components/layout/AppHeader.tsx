import { Menu as MenuIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '../shared/IconButton';
import { useShell } from './ShellContext';

interface Props {
  title: string;
  /** Secondary context next to the title, e.g. current resume. */
  context?: ReactNode;
  actions?: ReactNode;
}

/** Compact workspace header — leaves room for the work itself. */
export function AppHeader({ title, context, actions }: Props) {
  const { navIsDrawer, openNav } = useShell();
  return (
    <header className="app-header">
      {navIsDrawer && (
        <IconButton label="Open navigation" onClick={openNav} className="app-header__menu">
          <MenuIcon size={18} aria-hidden="true" />
        </IconButton>
      )}
      <div className="app-header__title">
        <h1>{title}</h1>
        {context && <div className="app-header__context">{context}</div>}
      </div>
      {actions && <div className="app-header__actions">{actions}</div>}
    </header>
  );
}
