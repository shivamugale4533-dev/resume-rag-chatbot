import { Check, Circle, FileText, MessageSquare, RefreshCw, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fileTypeLabel, formatBytes, formatFull } from '../../lib/format';
import { isBusy, useResume, type UploadState } from '../../state/ResumeContext';
import { useService } from '../../state/ServiceContext';
import type { DocumentStatus, ResumeDocument } from '../../types';
import { AppHeader } from '../layout/AppHeader';
import { Button } from '../shared/Button';
import { Dialog } from '../shared/Dialog';
import { Notice } from '../shared/Notice';
import { Skeleton } from '../shared/Skeleton';
import { Spinner } from '../shared/Spinner';
import { StateMessage } from '../shared/StateMessage';
import { StatusLabel } from '../shared/StatusLabel';
import { PROCESSING_COPY } from './DocumentStatus';
import { ResumeUploader, type UploaderHandle } from './ResumeUploader';

export function ResumePage() {
  const resume = useResume();
  const { service, recheck } = useService();
  const location = useLocation();
  const navigate = useNavigate();
  const uploader = useRef<UploaderHandle>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [confirmFile, setConfirmFile] = useState<File | null>(null);

  const { current, upload, config, loadState } = resume;
  const busy = isBusy(upload);

  // Sidebar "Replace resume" lands here and moves focus to the file chooser.
  const wantsReplace = (location.state as { replace?: boolean } | null)?.replace;
  useEffect(() => {
    if (wantsReplace && loadState === 'ready') {
      uploader.current?.focus();
      navigate('.', { replace: true, state: null });
    }
  }, [wantsReplace, loadState, navigate]);

  const onFile = (file: File) => {
    const problem = resume.validate(file);
    if (problem || !current) {
      void resume.startUpload(file); // validation failures are reported through upload state
      return;
    }
    setConfirmFile(file);
  };

  const confirmReplace = () => {
    if (confirmFile) void resume.startUpload(confirmFile);
    setConfirmFile(null);
  };

  return (
    <>
      <AppHeader title="Resume" />
      <div className="page">
        <div className="page__inner page__inner--narrow">
          {loadState === 'loading' && <OverviewSkeleton />}

          {loadState === 'error' && (
            <StateMessage
              tone="error"
              title="Couldn’t load the current resume"
              actions={
                <Button
                  variant="primary"
                  icon={<RefreshCw size={16} aria-hidden="true" />}
                  onClick={() => {
                    void recheck();
                    resume.reload();
                  }}
                >
                  Try again
                </Button>
              }
            >
              {resume.loadError?.message}
            </StateMessage>
          )}

          {loadState === 'ready' && (
            <>
              {service.mode === 'demo' && (
                <div className="page__section-tight">
                  <Notice tone="info" title="Demo mode">
                    Uploaded files aren’t read — answers keep using the fictional sample resume. Include “corrupt” in a filename to see a processing failure, or
                    “upload-fail” to see an upload error.
                  </Notice>
                </div>
              )}

              {current ? (
                <section className="page__section" aria-labelledby="doc-heading">
                  <DocumentOverview doc={current} replacing={busy} onReplace={() => uploader.current?.open()} />
                </section>
              ) : !busy && upload.phase !== 'failed' ? (
                <section className="page__section">
                  <h2 className="page-title">Start with a resume</h2>
                  <p className="page-lede">Upload a CV to ask questions grounded in its content.</p>
                </section>
              ) : null}

              {upload.phase !== 'idle' && (
                <section className="page__section" aria-label="Upload progress">
                  <UploadProgress upload={upload} hasCurrent={Boolean(current)} onRetry={resume.retryUpload} onChooseAnother={() => uploader.current?.open()} onCheckAgain={resume.checkStatusAgain} onCancel={resume.cancelUpload} onDismiss={resume.clearUpload} />
                </section>
              )}

              <section className="page__section" aria-labelledby="upload-heading">
                <div className="section-heading">
                  <h2 id="upload-heading">{current ? 'Replace resume' : 'Upload resume'}</h2>
                </div>
                {current && (
                  <p className="page-lede page-lede--small">
                    Replacing the resume changes the document every new answer is based on. Existing conversations stay in this session, but their citations refer to
                    the previous file.
                  </p>
                )}
                <ResumeUploader ref={uploader} config={config} disabled={busy} onFile={onFile} label={current ? 'Choose replacement' : 'Choose file'} />
                {config?.source === 'client-config' && service.mode === 'live' && (
                  <p className="fine-print">The backend doesn’t publish upload limits (GET /config), so these come from the frontend configuration.</p>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={confirmFile !== null}
        onClose={() => setConfirmFile(null)}
        title="Replace the current resume?"
        initialFocus={cancelRef}
        actions={
          <>
            <Button ref={cancelRef} onClick={() => setConfirmFile(null)}>
              Keep current resume
            </Button>
            <Button variant="primary" icon={<Upload size={16} aria-hidden="true" />} onClick={confirmReplace}>
              Replace and index
            </Button>
          </>
        }
      >
        <p>
          <strong className="break-anywhere">{confirmFile?.name}</strong> will replace <strong className="break-anywhere">{current?.filename}</strong>.
        </p>
        <p style={{ marginTop: 8 }}>
          New answers will use the new file once it has been indexed. The current resume stays active until then. Earlier conversations will be marked as using
          the previous file.
        </p>
      </Dialog>
    </>
  );
}

function OverviewSkeleton() {
  return (
    <div className="doc-overview" aria-busy="true" aria-label="Loading resume">
      <Skeleton width={120} height={12} />
      <Skeleton width="60%" height={24} style={{ marginTop: 12 }} />
      <Skeleton width="100%" height={80} style={{ marginTop: 24 }} />
    </div>
  );
}

function DocumentOverview({ doc, replacing, onReplace }: { doc: ResumeDocument; replacing: boolean; onReplace: () => void }) {
  const rows: [string, string][] = [];
  rows.push(['File type', fileTypeLabel(doc.filename, doc.contentType)]);
  const size = formatBytes(doc.sizeBytes);
  if (size) rows.push(['Size', size]);
  if (doc.uploadedAt) rows.push(['Uploaded', formatFull(doc.uploadedAt)]);
  if (doc.pageCount !== undefined) rows.push(['Pages', String(doc.pageCount)]);
  if (doc.sectionCount !== undefined) rows.push(['Sections found', String(doc.sectionCount)]);
  if (doc.chunkCount !== undefined) rows.push(['Indexed passages', String(doc.chunkCount)]);

  return (
    <div className="doc-overview">
      <div className="doc-overview__head">
        <div className="doc-overview__icon" aria-hidden="true">
          <FileText size={22} />
        </div>
        <div className="doc-overview__title">
          <p className="section-label">Current resume</p>
          <h2 id="doc-heading" className="doc-overview__name">
            {doc.filename}
          </h2>
          <div className="doc-overview__status">
            <StatusLabel tone="success" boxed>
              Indexed · ready for questions
            </StatusLabel>
          </div>
        </div>
      </div>
      <dl className="meta-list doc-overview__meta">
        {rows.map(([k, v]) => (
          <div key={k} className="meta-list__row">
            <dt>{k}</dt>
            <dd className={k === 'Uploaded' || k === 'Size' ? 'mono' : undefined}>{v}</dd>
          </div>
        ))}
        <div className="meta-list__row">
          <dt>Document ID</dt>
          <dd className="mono">{doc.id}</dd>
        </div>
      </dl>
      <div className="doc-overview__actions">
        <Link to="/" className="btn btn--primary">
          <MessageSquare size={16} aria-hidden="true" />
          Ask this resume
        </Link>
        <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={onReplace} disabled={replacing}>
          Replace resume
        </Button>
      </div>
    </div>
  );
}

/* ---------- Upload / processing lifecycle ---------- */

const STEPS: { key: 'upload' | DocumentStatus; label: string }[] = [
  { key: 'upload', label: 'Upload file' },
  { key: 'extracting', label: 'Extract text' },
  { key: 'indexing', label: 'Prepare searchable content' },
  { key: 'indexed', label: 'Ready for questions' },
];

function stepIndex(upload: UploadState): number {
  if (upload.phase === 'uploading') return 0;
  if (upload.phase === 'processing') {
    return { uploaded: 1, extracting: 1, indexing: 2, indexed: 3, failed: 1 }[upload.doc.status];
  }
  if (upload.phase === 'done') return 4;
  return -1;
}

function UploadProgress({
  upload,
  hasCurrent,
  onRetry,
  onChooseAnother,
  onCheckAgain,
  onCancel,
  onDismiss,
}: {
  upload: UploadState;
  hasCurrent: boolean;
  onRetry: () => void;
  onChooseAnother: () => void;
  onCheckAgain: () => void;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  if (upload.phase === 'failed') {
    const canRetry = Boolean(upload.file) && upload.kind !== 'unsupported_file' && upload.kind !== 'too_large';
    return (
      <Notice
        tone="error"
        live
        title={upload.stage === 'upload' ? `Couldn’t upload ${upload.filename}` : `Couldn’t process ${upload.filename}`}
        actions={
          <>
            {canRetry && (
              <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={onRetry}>
                Retry
              </Button>
            )}
            <Button size="sm" variant={canRetry ? 'ghost' : 'secondary'} icon={<Upload size={14} aria-hidden="true" />} onClick={onChooseAnother}>
              Choose another file
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          </>
        }
      >
        {upload.message}
        {hasCurrent && ' The current resume is still active.'}
      </Notice>
    );
  }

  if (upload.phase === 'done') {
    return (
      <Notice
        tone="success"
        live
        title="Resume indexed. Ready for questions."
        actions={
          <>
            <Link to="/" className="btn btn--secondary btn--sm">
              <MessageSquare size={14} aria-hidden="true" />
              Ask a question
            </Link>
            <Button size="sm" variant="ghost" icon={<X size={14} aria-hidden="true" />} onClick={onDismiss}>
              Dismiss
            </Button>
          </>
        }
      >
        <span className="break-anywhere">{upload.doc.filename}</span> is now the active resume.
      </Notice>
    );
  }

  const filename = upload.phase === 'uploading' ? upload.file.name : upload.phase === 'processing' ? upload.doc.filename : '';
  const active = stepIndex(upload);
  const stalled = upload.phase === 'processing' && upload.stalled;
  const statusText =
    upload.phase === 'uploading'
      ? upload.progress !== null && upload.progress < 1
        ? `Uploading resume… ${Math.round(upload.progress * 100)}%`
        : 'Uploading resume…'
      : upload.phase === 'processing'
        ? stalled
          ? 'Processing is taking longer than expected.'
          : PROCESSING_COPY[upload.doc.status]
        : '';

  return (
    <div className="upload-progress">
      <div className="upload-progress__head">
        <div className="min-w-0">
          <p className="section-label">{hasCurrent ? 'Replacing resume' : 'Uploading resume'}</p>
          <p className="upload-progress__file break-anywhere">{filename}</p>
        </div>
        {upload.phase === 'uploading' && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      {upload.phase === 'uploading' && upload.progress !== null && (
        <div className="progress" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(upload.progress * 100)}>
          <div className="progress__bar" style={{ width: `${upload.progress * 100}%` }} />
        </div>
      )}

      <ol className="steps" aria-label="Processing steps">
        {STEPS.map((s, i) => {
          const state = i < active ? 'done' : i === active ? (stalled ? 'stalled' : 'active') : 'todo';
          return (
            <li key={s.key} className={`step step--${state}`} aria-current={state === 'active' ? 'step' : undefined}>
              <span className="step__icon" aria-hidden="true">
                {state === 'done' ? <Check size={13} /> : state === 'active' ? <Spinner size={13} /> : <Circle size={8} />}
              </span>
              <span>{s.label}</span>
              <span className="visually-hidden">{state === 'done' ? '(complete)' : state === 'active' ? '(in progress)' : ''}</span>
            </li>
          );
        })}
      </ol>

      <p className="upload-progress__status" role="status" aria-live="polite">
        {statusText}
      </p>
      {stalled && (
        <div className="notice__actions">
          <Button size="sm" variant="secondary" icon={<RefreshCw size={14} aria-hidden="true" />} onClick={onCheckAgain}>
            Check status again
          </Button>
        </div>
      )}
      {hasCurrent && <p className="fine-print">The current resume keeps answering questions until the new one is indexed.</p>}
    </div>
  );
}
