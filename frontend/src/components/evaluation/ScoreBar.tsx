import { formatScore, scoreFraction } from './metrics';

/** Compact horizontal indicator; renders only when the backend declared a score range. */
export function ScoreBar({ value, range, label }: { value: number | null | undefined; range?: [number, number]; label: string }) {
  const frac = scoreFraction(value, range);
  const text = formatScore(value, range);
  return (
    <span className="score">
      <span className="score__value mono">{text}</span>
      {frac !== null && (
        <span
          className="score__track"
          role="meter"
          aria-label={label}
          aria-valuemin={range![0]}
          aria-valuemax={range![1]}
          aria-valuenow={value!}
          aria-valuetext={text}
        >
          <span className="score__fill" style={{ width: `${frac * 100}%` }} />
        </span>
      )}
    </span>
  );
}
