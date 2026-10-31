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
import { onLangChange, t } from './i18n/index.ts';
import { setTitle } from './ui/title.ts';
import { modeName } from './core/modes.ts';
import { initShell, setPrimaryAction, setShell, type TabId } from './ui/shell.ts';

/* ---------- Cleanup-Hook (aktuelle View räumt Timer/Listener auf) ---------- */

let cleanups: Array<() => void> = [];
/** Ersetzt alle registrierten Aufräum-Funktionen durch fn (oder leert sie). */
export function setCleanup(fn: (() => void) | null): void { cleanups = fn ? [fn] : []; }
/** Registriert zusätzlich eine Aufräum-Funktion für die aktuelle View. */
export function addCleanup(fn: () => void): void { cleanups.push(fn); }
export function runCleanup(): void {
  const fns = cleanups;
  cleanups = [];
  for (const fn of fns) fn();
}

/* ---------- Navigation ---------- */

export interface RenderOptions {
  /** Scroll-Position der aktuellen Seite behalten (z. B. nach einer Änderung, Sprachwechsel); sonst oben bzw. gemerkte Position */
  keepScroll?: boolean;
}

/** Aktuelle Route neu zeichnen. */
export function rerender({ keepScroll = false }: RenderOptions = {}): void { render({ keepScroll }); }

export function go(hash: string): void {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

/* ---------- Routing ---------- */

type Route =
  | { name: 'today' }
  | { name: 'progress' }
  | { name: 'profile' }
  | { name: 'learn'; id: string | null }
  | { name: 'chain' }
  | { name: 'parallel' }
  | { name: 'custom' }
  | { name: 'train'; mode: string; n: number | null; intro: boolean; estimate: boolean; custom: CustomRange | null };

/** Alte Pfade (Lesezeichen, PWA-Start) → neue; die Query (z. B. ?tab=) bleibt erhalten (E6). */
const ALIASES: Readonly<Record<string, string>> = { analyse: 'fortschritt', settings: 'profil' };

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

function splitHash(): { parts: string[]; queryPart: string } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart = '', queryPart = ''] = raw.split('?');
  return { parts: pathPart.split('/').filter(Boolean), queryPart };
}

/** Alias in der Adresszeile durch den kanonischen Pfad ersetzen (ohne hashchange, ohne neuen Verlaufseintrag). */
function canonicalize(): void {
  const { parts, queryPart } = splitHash();
  const target = parts[0] && Object.hasOwn(ALIASES, parts[0]) ? ALIASES[parts[0]] : undefined;
  if (!target) return;
  const hash = `#/${[target, ...parts.slice(1)].join('/')}${queryPart ? `?${queryPart}` : ''}`;
  try {
    history.replaceState(history.state, '', hash);
  } catch { /* z. B. in Sandboxes ohne History-API: Alias bleibt sichtbar, Route stimmt trotzdem */ }
}

function parseRoute(): Route {
  const { parts, queryPart } = splitHash();
  const query = new URLSearchParams(queryPart);
  // Object.hasOwn: „#/constructor“ o. ä. trifft sonst Object.prototype
  const p0 = parts[0] && Object.hasOwn(ALIASES, parts[0]) ? ALIASES[parts[0]] : parts[0];
  const p1 = parts[1];
  if (p0 === 'fortschritt') return { name: 'progress' };
  if (p0 === 'profil') return { name: 'profile' };
  if (p0 === 'lernen') return { name: 'learn', id: p1 && Object.hasOwn(SUBTYPES, p1) ? p1 : null };
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
  return { name: 'today' };
}

/** Tab einer Route; null = Fokus-Modus (Training, Ketten, Parallel). „Eigenes“ (Einstellungen) gehört zu Heute. */
function tabOf(route: Route): TabId | null {
  switch (route.name) {
    case 'today': case 'custom': return 'today';
    case 'learn': return 'learn';
    case 'progress': return 'progress';
    case 'profile': return 'profile';
    default: return null;
  }
}

/** Schlüssel für die gemerkte Scroll-Position (nur Tab-Seiten; Lernen-Liste und -Detail getrennt). */
function scrollKey(route: Route): string | null {
  if (route.name === 'learn') return route.id ? `learn/${route.id}` : 'learn';
  return tabOf(route) ? route.name : null;
}

function routeTitle(route: Route): string | null {
  switch (route.name) {
    case 'progress': return t('analyse.title');
    case 'profile': return t('settings.title');
    case 'learn': return t('lernen.title');
    case 'chain': return t('settings.routeChain');
    case 'parallel': return t('settings.routeParallel');
    case 'custom': return t('settings.routeCustom');
    case 'train': return modeName(route.mode);
    default: return t('settings.routeTraining');
  }
}

function draw(route: Route): void {
  if (route.name === 'progress') renderAnalyse();
  else if (route.name === 'learn') renderLernen(route.id);
  else if (route.name === 'profile') renderSettings();
  else if (route.name === 'chain') renderChain();
  else if (route.name === 'parallel') renderParallel();
  else if (route.name === 'custom') renderCustom();
  else if (route.name === 'train') renderTrain(route.mode, { n: route.n, intro: route.intro, estimate: route.estimate, custom: route.custom });
  else renderHome();
}

/** Gemerkte Scroll-Positionen je Tab-Seite (Zurückwechseln stellt sie wieder her). */
const scrollByKey = new Map<string, number>();
let shownKey: string | null = null;
let shownTab: TabId | null | undefined;

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface ViewTransitionLike { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> }
type StartViewTransition = (update: () => void) => ViewTransitionLike | undefined;

/** Abgebrochene oder übersprungene View Transition (kein Fehler der App). */
function isTransitionAbort(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'AbortError' || e.name === 'InvalidStateError');
}

/** View Transition (Cross-Fade) nur beim Wechsel zwischen zwei Tabs, nie im Fokus-Modus oder bei Reduced Motion. */
function withTransition(from: TabId | null | undefined, to: TabId | null, update: () => void): void {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (typeof start !== 'function' || !from || !to || from === to || reducedMotion()) {
    update();
    return;
  }
  try {
    const vt = start.call(document, update);
    // Abgebrochene bzw. übersprungene Übergänge (AbortError, InvalidStateError – z. B. schneller Tab-Wechsel, verstecktes
    // Dokument) sind kein Fehler: der Inhalt steht trotzdem. Alles andere – vor allem Fehler beim Zeichnen selbst – bleibt
    // sichtbar, und zwar einmal (ein Fehler im Update lehnt alle drei Promises mit demselben Grund ab).
    const seen = new Set<unknown>();
    const report = (e: unknown): void => {
      if (isTransitionAbort(e) || seen.has(e)) return;
      seen.add(e);
      console.error(e);
    };
    vt?.ready?.catch(report);
    vt?.finished?.catch(report);
    vt?.updateCallbackDone?.catch(report);
  } catch {
    update();
  }
}

export function render({ keepScroll = false }: RenderOptions = {}): void {
  canonicalize();
  const route = parseRoute();
  const tab = tabOf(route);
  const key = scrollKey(route);
  const prevKey = shownKey;
  // Position der verlassenen Tab-Seite merken
  if (prevKey !== null && prevKey !== key) scrollByKey.set(prevKey, window.scrollY);
  const keepY = keepScroll ? window.scrollY : null;

  withTransition(shownTab, tab, () => {
    runCleanup();
    setTitle(routeTitle(route));
    setShell(tab);
    setPrimaryAction(null);
    app.replaceChildren();
    shownKey = key;
    shownTab = tab;
    draw(route);
    const y = keepY ?? (key !== null && key !== prevKey ? (scrollByKey.get(key) ?? 0) : 0);
    window.scrollTo(0, y);
    // Inhalte, die erst im nächsten Frame erscheinen, verkürzen sonst die Seite
    if (y > 0) requestAnimationFrame(() => { if (shownKey === key && window.scrollY < y) window.scrollTo(0, y); });
  });
}

let started = false;

export function startRouter(): void {
  if (started) {
    render();
    return;
  }
  started = true;
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  initShell();
  window.addEventListener('hashchange', () => render());
  onLangChange(() => rerender({ keepScroll: true }));
  render();
}
