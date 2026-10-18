import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BP, useMediaQuery } from '../../hooks/useMediaQuery';
import { Drawer } from '../shared/Drawer';
import { ShellContext } from './ShellContext';
import { Sidebar } from './Sidebar';
import { Wordmark } from './Wordmark';

export function AppShell() {
  const persistent = useMediaQuery(BP.sidebar);
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    if (persistent) setNavOpen(false);
  }, [persistent]);

  const ctx = useMemo(() => ({ navIsDrawer: !persistent, openNav: () => setNavOpen(true) }), [persistent]);

  return (
    <ShellContext.Provider value={ctx}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="shell">
        {persistent && (
          <aside className="shell__sidebar" aria-label="Sidebar">
            <Sidebar />
          </aside>
        )}
        <main id="main" className="shell__main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      {!persistent && (
        <Drawer open={navOpen} onClose={() => setNavOpen(false)} side="left" title="Navigation" header={<Wordmark />}>
          <Sidebar inDrawer onNavigate={() => setNavOpen(false)} />
        </Drawer>
      )}
    </ShellContext.Provider>
  );
}
