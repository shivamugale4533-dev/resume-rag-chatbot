import { Activity, FileText, FlaskConical, MessageSquare, Plus, RefreshCw } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useService } from '../../state/ServiceContext';
import { StatusLabel } from '../shared/StatusLabel';
import { ConversationList } from './ConversationList';
import { DocumentSummary } from './DocumentSummary';
import { Wordmark } from './Wordmark';

const NAV = [
  { to: '/', label: 'Ask resume', icon: MessageSquare, match: (p: string) => p === '/' || p.startsWith('/chat') },
  { to: '/resume', label: 'Resume', icon: FileText },
  { to: '/evaluation', label: 'Evaluation', icon: FlaskConical },
  { to: '/logs', label: 'Activity logs', icon: Activity },
];

export function Sidebar({ inDrawer, onNavigate }: { inDrawer?: boolean; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className={`sidebar ${inDrawer ? 'sidebar--drawer' : ''}`}>
      <div className="sidebar__top">
        {!inDrawer && <Wordmark />}
        <button
          type="button"
          className="btn btn--secondary btn--block sidebar__new"
          onClick={() => {
            onNavigate?.();
            navigate('/', { state: { focusComposer: Date.now() } });
          }}
        >
          <Plus size={16} aria-hidden="true" />
          New chat
        </button>
        <nav aria-label="Main">
          <ul className="nav">
            {NAV.map(({ to, label, icon: Icon, match }) => {
              const active = match ? match(pathname) : pathname.startsWith(to);
              return (
                <li key={to}>
                  <NavLink to={to} className={`nav__link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onNavigate} end>
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="sidebar__scroll">
        <section aria-labelledby="current-resume-heading" className="sidebar__section">
          <h2 id="current-resume-heading" className="section-label sidebar__label">
            Current resume
          </h2>
          <DocumentSummary onNavigate={onNavigate} />
        </section>
        <ConversationList onNavigate={onNavigate} />
      </div>

      <ConnectionFooter />
    </div>
  );
}

function ConnectionFooter() {
  const { connection, recheck, service } = useService();
  return (
    <div className="sidebar__footer" aria-live="polite">
      {connection === 'demo' && (
        <>
          <StatusLabel tone="warning">Demo mode</StatusLabel>
          <p className="sidebar__footnote">Fictional sample resume. No backend is contacted.</p>
        </>
      )}
      {connection === 'checking' && (
        <StatusLabel tone="neutral" busy>
          Connecting…
        </StatusLabel>
      )}
      {connection === 'connected' && (
        <>
          <StatusLabel tone="success">Connected</StatusLabel>
          <p className="sidebar__footnote mono break-anywhere">{service.baseUrl?.replace(/^https?:\/\//, '')}</p>
        </>
      )}
      {connection === 'unavailable' && (
        <div className="sidebar__unavailable">
          <StatusLabel tone="error">Backend unavailable</StatusLabel>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void recheck()}>
            <RefreshCw size={13} aria-hidden="true" />
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
