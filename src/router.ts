import type { CustomRange } from './types.ts';
import { SUBTYPES } from './core/catalog.ts';
import { renderChain } from './views/chain.ts';
import { renderParallel } from './views/parallel/index.ts';
import { renderCustom } from './views/custom.ts';
import { isValidMode } from './core/modes.ts';
import { app } from './ui/dom.ts';
import { renderHome } from './views/home.ts';
import { renderTrain } from './views/train/index.ts';
import { renderLernen } from './views/lernen.ts';
import { renderAnalyse } from './views/analyse.ts';
import { renderSettings } from './views/settings.ts';

/* ---------- Cleanup-Hook (aktuelle View räumt Timer/Listener auf) ---------- */

let cleanup: (() => void) | null = null;
export function setCleanup(fn: (() => void) | null): void { cleanup = fn; }
export function runCleanup(): void { if (cleanup) { const fn = cleanup; cleanup = null; fn(); } }

/* ---------- Navigation ---------- */

export function rerender(): void { render(); }

export function go(hash: string): void {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

/* ---------- Routing ---------- */

type Route =
  | { name: 'home' }
  | { name: 'analyse' }
  | { name: 'settings' }
  | { name: 'lernen'; id: string | null }
  | { name: 'chain' }
  | { name: 'parallel' }
  | { name: 'custom' }
  | { name: 'train'; mode: string; n: number | null; intro: boolean; estimate: boolean; custom: CustomRange | null };

function parseRange(raw: string | null): [number, number] | null {
  const m = /^(\d{1,3})-(\d{1,3})$/.exec(raw ?? '');
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  return lo >= 1 && hi <= 999 && lo <= hi ? [lo, hi] : null;
}

function parseCustom(query: URLSearchParams): CustomRange | null {
  const k = query.get('k');
  if (k === 'mul') {
    const a = parseRange(query.get('a'));
    const b = parseRange(query.get('b'));
    return a && b ? { kind: 'mul', aMin: a[0], aMax: a[1], bMin: b[0], bMax: b[1] } : null;
  }
  if (k === 'square') {
    const r = parseRange(query.get('r'));
    return r ? { kind: 'square', aMin: r[0], aMax: r[1] } : null;
  }
  return null;
}

function parseRoute(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart);
  const p0 = parts[0];
  const p1 = parts[1];
  if (p0 === 'analyse') return { name: 'analyse' };
  if (p0 === 'settings') return { name: 'settings' };
  if (p0 === 'lernen') return { name: 'lernen', id: p1 && SUBTYPES[p1] ? p1 : null };
  if (p0 === 'chain') return { name: 'chain' };
  if (p0 === 'parallel') return { name: 'parallel' };
  if (p0 === 'custom') return { name: 'custom' };
  if (p0 === 'train' && p1 && isValidMode(p1)) {
    const n = parseInt(query.get('n') ?? '', 10);
    const custom = p1 === 'custom' ? parseCustom(query) : null;
    if (p1 === 'custom' && !custom) return { name: 'custom' };
    return {
      name: 'train', mode: p1, n: n > 0 && n <= 100 ? n : null, intro: query.get('intro') === '1',
      estimate: query.get('est') === '1', custom,
    };
  }
  return { name: 'home' };
}

const NAV_TOPS: readonly string[] = ['analyse', 'lernen', 'settings'];

export function render(): void {
  runCleanup();
  const route = parseRoute();
  const seg = route.name === 'train' ? '' : route.name;
  const navHref = NAV_TOPS.includes(seg) ? `#/${seg}` : '#/';
  document.querySelectorAll('nav a, [data-nav]').forEach((a) => {
    const active = a.getAttribute('href') === navHref;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  app.replaceChildren();
  window.scrollTo(0, 0);
  // Fokus-Modus: im Training keine Tab-Leiste, damit sie keine Buttons verdeckt
  document.body.classList.toggle('in-play', route.name === 'train' || route.name === 'chain' || route.name === 'parallel');
  if (route.name === 'analyse') renderAnalyse();
  else if (route.name === 'lernen') renderLernen(route.id);
  else if (route.name === 'settings') renderSettings();
  else if (route.name === 'chain') renderChain();
  else if (route.name === 'parallel') renderParallel();
  else if (route.name === 'custom') renderCustom();
  else if (route.name === 'train') renderTrain(route.mode, { n: route.n, intro: route.intro, estimate: route.estimate, custom: route.custom });
  else renderHome();
}

export function startRouter(): void {
  window.addEventListener('hashchange', render);
  render();
}
