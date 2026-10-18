const SENSITIVE = /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key)/i;

/** Masks values under sensitive-looking keys before details are ever rendered. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '…';
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redacted]' : redact(v, depth + 1)]),
    );
  }
  return value;
}
