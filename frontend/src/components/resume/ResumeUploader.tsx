import { Upload } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef, useState, type DragEvent } from 'react';
import { formatBytes } from '../../lib/format';
import type { UploadConfig } from '../../types';
import { Button } from '../shared/Button';

interface Props {
  config: UploadConfig | null;
  disabled?: boolean;
  onFile: (file: File) => void;
  label: string;
}

export interface UploaderHandle {
  focus: () => void;
  open: () => void;
}

export const ResumeUploader = forwardRef<UploaderHandle, Props>(function ResumeUploader({ config, disabled, onFile, label }, ref) {
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useImperativeHandle(ref, () => ({ focus: () => button.current?.focus(), open: () => input.current?.click() }), []);

  const exts = config?.acceptedExtensions ?? [];
  const accept = exts.map((e) => `.${e}`).join(',');
  const typeText = exts.length ? exts.map((e) => e.toUpperCase()).join(' or ') : 'Any file type';
  const sizeText = config?.maxUploadBytes ? `up to ${formatBytes(config.maxUploadBytes)}` : null;

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setDragging(false);
    if (disabled) return;
    // Only one resume is active at a time, so extra dropped files are ignored.
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div
      className={`dropzone ${dragging ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current += 1;
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) setDragging(false);
      }}
      onDrop={handleDrop}
    >
      <Upload size={20} aria-hidden="true" className="dropzone__icon" />
      <div className="dropzone__text">
        <p className="dropzone__title">{dragging ? 'Drop to upload' : 'Drag a file here, or choose one'}</p>
        <p className="dropzone__hint">
          {typeText}
          {sizeText ? ` · ${sizeText}` : ''} · One resume is active at a time
        </p>
      </div>
      <Button ref={button} variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept || undefined}
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </div>
  );
});
