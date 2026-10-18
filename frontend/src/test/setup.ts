import '@testing-library/jest-dom/vitest';

// jsdom gaps used by the UI.
Element.prototype.scrollIntoView = function () {};
Element.prototype.scrollTo = function () {} as typeof Element.prototype.scrollTo;

// Desktop layout for tests: min-width queries match, max-width queries don't.
window.matchMedia = ((query: string) => ({
  matches: query.includes('min-width') || query.includes('hover: hover'),
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;
