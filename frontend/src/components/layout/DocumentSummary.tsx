import { FileText, RefreshCw, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { fileTypeLabel, formatBytes } from '../../lib/format';
import { useResume } from '../../state/ResumeContext';
import { Skeleton } from '../shared/Skeleton';
import { DocumentStatusLabel } from '../resume/DocumentStatus';

/** Compact "current resume" block for the sidebar. */
export function DocumentSummary({ onNavigate }: { onNavigate?: () => void }) {
  const { loadState, current, upload } = useResume();
  const navigate = useNavigate();

  if (loadState === 'loading') {
    return (
      <div className="doc-summary" aria-busy="true">
        <Skeleton width="80%" />
        <Skeleton width="45%" height={12} style={{ marginTop: 8 }} />
      </div>
    );
  }

  const inFlight = upload.phase === 'uploading' || upload.phase === 'processing';
  const inFlightName = upload.phase === 'uploading' ? upload.file.name : upload.phase === 'processing' ? upload.doc.filename : null;

  if (!current) {
    return (
      <div className="doc-summary">
        {inFlight && inFlightName ? (
          <>
            <div className="doc-summary__file">
              <FileText size={16} aria-hidden="true" />
              <span className="doc-summary__name">{inFlightName}</span>
            </div>
            <DocumentStatusLabel upload={upload} />
          </>
        ) : (
          <>
            <p className="doc-summary__empty">No resume uploaded yet.</p>
            <Link to="/resume" className="btn btn--secondary btn--sm" onClick={onNavigate}>
              <Upload size={14} aria-hidden="true" />
              Upload resume
            </Link>
          </>
        )}
      </div>
    );
  }

  const meta = [fileTypeLabel(current.filename, current.contentType), formatBytes(current.sizeBytes)].filter(Boolean).join(' · ');

  return (
    <div className="doc-summary">
      <Link to="/resume" className="doc-summary__file doc-summary__link" onClick={onNavigate}>
        <FileText size={16} aria-hidden="true" />
        <span className="doc-summary__name">{current.filename}</span>
      </Link>
      <div className="doc-summary__meta">
        <span className="mono">{meta}</span>
        <DocumentStatusLabel doc={current} upload={upload} />
      </div>
      {!inFlight && (
        <button
          type="button"
          className="doc-summary__replace"
          onClick={() => {
            onNavigate?.();
            navigate('/resume', { state: { replace: true } });
          }}
        >
          <RefreshCw size={13} aria-hidden="true" />
          Replace resume
        </button>
      )}
    </div>
  );
}
