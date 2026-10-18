import type { UploadState } from '../../state/ResumeContext';
import type { DocumentStatus, ResumeDocument } from '../../types';
import { StatusLabel, type Tone } from '../shared/StatusLabel';

export interface StatusInfo {
  tone: Tone;
  text: string;
  busy?: boolean;
}

/** Copy for each backend-reported processing state. Only states the backend reports are shown. */
export const PROCESSING_COPY: Record<DocumentStatus, string> = {
  uploaded: 'Processing…',
  extracting: 'Extracting text…',
  indexing: 'Preparing searchable content…',
  indexed: 'Indexed',
  failed: 'Processing failed',
};

export function uploadStatus(upload: UploadState): StatusInfo | null {
  switch (upload.phase) {
    case 'uploading':
      return {
        tone: 'info',
        busy: true,
        text: upload.progress !== null && upload.progress < 1 ? `Uploading… ${Math.round(upload.progress * 100)}%` : 'Uploading resume…',
      };
    case 'processing':
      return upload.stalled
        ? { tone: 'warning', text: 'Still processing' }
        : { tone: 'info', busy: true, text: PROCESSING_COPY[upload.doc.status] };
    case 'failed':
      return { tone: 'error', text: upload.stage === 'upload' ? 'Upload failed' : 'Processing failed' };
    default:
      return null;
  }
}

/** Status for the sidebar / header. A confirmed document is "Indexed"; anything else reflects the upload. */
export function DocumentStatusLabel({ doc, upload, boxed }: { doc?: ResumeDocument | null; upload: UploadState; boxed?: boolean }) {
  const pending = uploadStatus(upload);
  if (!doc) return pending ? <StatusLabel tone={pending.tone} busy={pending.busy} boxed={boxed}>{pending.text}</StatusLabel> : null;
  if (pending && upload.phase !== 'failed') {
    return (
      <StatusLabel tone="info" busy boxed={boxed}>
        Replacing…
      </StatusLabel>
    );
  }
  return (
    <StatusLabel tone="success" boxed={boxed}>
      Indexed
    </StatusLabel>
  );
}
