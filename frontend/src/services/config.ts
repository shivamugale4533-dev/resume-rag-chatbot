import type { ServiceMode } from '../types';

function parseExtensions(raw: string | undefined): string[] {
  const list = (raw ?? 'pdf,docx')
    .split(',')
    .map((s) => s.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
  return list.length ? list : ['pdf'];
}

function parseMb(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1024 * 1024) : null;
}

export const appConfig = {
  mode: (import.meta.env.VITE_DEMO_MODE === 'true' ? 'demo' : 'live') as ServiceMode,
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  fallbackAcceptedExtensions: parseExtensions(import.meta.env.VITE_ACCEPTED_FILE_TYPES),
  fallbackMaxUploadBytes: parseMb(import.meta.env.VITE_MAX_UPLOAD_MB),
  timeouts: {
    default: 15_000,
    chat: 90_000,
    upload: 180_000,
  },
};
