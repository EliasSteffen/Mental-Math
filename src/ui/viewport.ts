// Layout-Stufen der App. Dieselben Breiten stehen als @media-Regeln in public/css (layout.css und die Views).
// Unter TABLET gilt das Telefon-Layout – auch für ein iPad in Split View oder Slide Over.
const TABLET = '(min-width: 720px)';
const WIDE = '(min-width: 1024px)';

function matches(query: string): boolean {
  return typeof matchMedia === 'function' && matchMedia(query).matches;
}

/** Seitenleiste und mehrspaltige Seiten (iPad hochkant, auch mini). */
export function isTablet(): boolean { return matches(TABLET); }

/** Breite Seitenleiste und Master-Detail (iPad quer, großes iPad hochkant). */
export function isWide(): boolean { return matches(WIDE); }

/** Meldet einen Wechsel der Layout-Stufe (Drehen, Split View, Stage Manager). Rückgabe: Abmelden. */
export function onLayoutChange(cb: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const lists = [TABLET, WIDE].map((q) => matchMedia(q));
  for (const l of lists) l.addEventListener('change', cb);
  return () => { for (const l of lists) l.removeEventListener('change', cb); };
}
