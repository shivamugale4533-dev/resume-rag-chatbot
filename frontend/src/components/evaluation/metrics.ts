import type { MetricKey } from '../../types';

export const METRICS: { key: MetricKey; name: string; short: string; definition: string }[] = [
  {
    key: 'faithfulness',
    name: 'Faithfulness',
    short: 'Faithful.',
    definition: 'How factually consistent the answer is with the retrieved context. Claims that the context does not support lower the score.',
  },
  {
    key: 'answer_relevancy',
    name: 'Answer Relevancy',
    short: 'Relevancy',
    definition: 'How directly the answer addresses the question. Incomplete, padded or off-topic answers score lower.',
  },
  {
    key: 'context_precision',
    name: 'Context Precision',
    short: 'Ctx precision',
    definition: 'Whether the passages relevant to the question are ranked above irrelevant ones in the retrieved context.',
  },
  {
    key: 'context_recall',
    name: 'Context Recall',
    short: 'Ctx recall',
    definition: 'How much of the information in the reference answer is present in the retrieved passages.',
  },
  {
    key: 'answer_correctness',
    name: 'Answer Correctness',
    short: 'Correctness',
    definition: 'How closely the generated answer matches the reference answer, combining factual and semantic similarity.',
  },
];

/** Formats a score in the backend's own scale. No unit conversion is assumed when the range is unknown. */
export function formatScore(v: number | null | undefined, range?: [number, number]): string {
  if (v === null || v === undefined) return '—';
  if (range && range[0] === 0 && range[1] === 1) return v.toFixed(2);
  return Number.isInteger(v) ? String(v) : v.toPrecision(3);
}

/** 0–1 position for a bar, or null if the scale is unknown. */
export function scoreFraction(v: number | null | undefined, range?: [number, number]): number | null {
  if (v === null || v === undefined || !range || range[1] === range[0]) return null;
  return Math.min(1, Math.max(0, (v - range[0]) / (range[1] - range[0])));
}
