import { LoaderCircle } from 'lucide-react';

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <>
      <LoaderCircle size={size} className="spinner" aria-hidden="true" />
      {label && <span className="visually-hidden">{label}</span>}
    </>
  );
}
