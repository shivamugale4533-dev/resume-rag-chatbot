import { Link } from 'react-router-dom';

export function Wordmark() {
  return (
    <Link to="/" className="wordmark" aria-label="Resume Desk — new question">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect x="0.5" y="0.5" width="19" height="19" rx="5" fill="var(--accent-primary)" />
        <path d="M6 4.5h5.5l3 3V15.5H6z" fill="var(--app-background)" />
        <path d="M8 10h4.5M8 12.5h3" stroke="var(--accent-primary)" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <span>Resume Desk</span>
    </Link>
  );
}
