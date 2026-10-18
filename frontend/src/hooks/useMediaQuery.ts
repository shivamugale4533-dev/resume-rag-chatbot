import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Breakpoints used across the shell. Keep in sync with layout.css. */
export const BP = {
  /** Persistent sidebar */
  sidebar: '(min-width: 1024px)',
  /** Evidence panel docked inline instead of a drawer */
  evidenceInline: '(min-width: 1360px)',
  /** Below this, evidence opens as a bottom sheet */
  mobile: '(max-width: 767px)',
};
