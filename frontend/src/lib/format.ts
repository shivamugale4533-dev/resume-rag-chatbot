export function formatBytes(bytes?: number): string | null {
  if (bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m?.[1]?.toLowerCase() ?? '';
}

export function fileTypeLabel(name: string, contentType?: string): string {
  const ext = fileExtension(name);
  if (ext) return ext.toUpperCase();
  if (contentType?.includes('pdf')) return 'PDF';
  return 'File';
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

function parse(iso?: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTime(iso?: string): string {
  const d = parse(iso);
  return d ? timeFmt.format(d) : '—';
}

export function formatDateTime(iso?: string): string {
  const d = parse(iso);
  return d ? dateTimeFmt.format(d) : '—';
}

export function formatFull(iso?: string): string {
  const d = parse(iso);
  return d ? fullFmt.format(d) : '—';
}

/** Log timestamps: HH:MM:SS.mmm in local time, monospaced in the UI. */
export function formatLogTime(iso?: string): string {
  const d = parse(iso);
  if (!d) return '—';
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

export function formatDuration(ms?: number): string | null {
  if (ms === undefined) return null;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function relativeDay(iso?: string): string {
  const d = parse(iso);
  if (!d) return '';
  const today = new Date();
  const diff = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(d);
}
