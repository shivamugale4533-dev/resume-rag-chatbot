import type { CSSProperties } from 'react';

export function Skeleton({ width = '100%', height = 14, style }: { width?: number | string; height?: number; style?: CSSProperties }) {
  return <span className="skeleton" aria-hidden="true" style={{ width, height, ...style }} />;
}
