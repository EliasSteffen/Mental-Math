import type { CustomRange } from './types.ts';
import { SUBTYPES } from './core/catalog.ts';
import { renderChain } from './views/chain.ts';
import { renderCase } from './views/case.ts'; // v9 C
import { caseById } from './core/cases/index.ts'; // v9 C
import { renderDuel } from './views/duel.ts'; // v9 I
import { renderQuests } from './views/quests.ts'; // v10 Q
import { renderParallel } from './views/parallel/index.ts';
import { renderCustom } from './views/custom.ts';
import { isValidMode } from './core/modes.ts';
import { app } from './ui/dom.ts';
import { isDemoData } from './data/storage.ts';
import { renderHome } from './views/home.ts';
import { renderTrain } from './views/train/index.ts';
import { renderLernen } from './views/lernen.ts';
import { renderAnalyse } from './views/progress.ts';
import { renderAchievements } from './views/achievements.ts'; // v9 J
import { renderSettings } from './views/settings.ts';
import { renderCompete } from './views/compete.ts';
import { renderChallenge } from './views/challenge.ts';
import { renderPlacement } from './views/placement.ts';
import { parseBoardQuery, renderLeaderboard, type BoardRoute } from './views/leaderboard.ts';
import { isChallengeId } from './core/challenge.ts';
import { onLangChange, t } from './i18n/index.ts';
import { setTitle } from './ui/title.ts';
import { modeName } from './core/modes.ts';
import { initShell, setPrimaryAction, setShell } from './ui/shell.ts';
import { LAST_TAB_KEY, lastTabHash, shellOf, type ShellState, type TabId } from './core/nav.ts'; // v11 N
import { mountAccountButton, paintSidebarProfile } from './ui/account-button.ts'; // v11 N
import { maybeShowNavHint } from './ui/nav-hint.ts'; // v11 T
import { onLayoutChange } from './ui/viewport.ts';
import { renderCrash } from './ui/crash.ts';

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

/** Seite wechseln ohne Verlaufseintrag (Rundgang: „Zurück“ führt danach nicht in Demo-Seiten). */
export function replaceRoute(hash: string): void {
  history.replaceState(history.state, '', hash);
  render();
}

export function go(hash: string): void {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}

/* ---------- Routing ---------- */

type Route =
  | { name: 'today' }
  | { name: 'progress' }
  | { name: 'profile'; section: string | null }
  | { name: 'achievements'; tab: string | null } // v9 J
  | { name: 'learn'; id: string | null; guide: boolean }
  | { name: 'chain' }
  | { name: 'case'; id: string | null } // v9 C: null = Auswahl, 'random' = Zufall
  | { name: 'parallel' }
  | { name: 'custom' }
  | { name: 'compete'; query: URLSearchParams }
  | { name: 'board'; board: BoardRoute }
  | { name: 'challenge'; id: string }
  | { name: 'placement' }
  | { name: 'duel'; d: string | null } // v9 I
  | { name: 'quests' } // v10 Q
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

/** Alte Profil-Tabs (`?tab=`) → Bereich des Profils (Lesezeichen, Links aus älteren Versionen). */
const TAB_SECTIONS: Readonly<Record<string, string>> = { gameplay: 'training', general: 'darstellung', data: 'daten', about: 'hilfe' };

/** Alias in der Adresszeile durch den kanonischen Pfad ersetzen (ohne hashchange, ohne neuen Verlaufseintrag). */
function canonicalize(): void {
  const { parts, queryPart } = splitHash();
  const target = parts[0] && Object.hasOwn(ALIASES, parts[0]) ? ALIASES[parts[0]] : undefined;
  const path = target ?? parts[0];
  const tab = path === 'profil' && !parts[1] ? new URLSearchParams(queryPart).get('tab') : null;
  const section = tab !== null && Object.hasOwn(TAB_SECTIONS, tab) ? TAB_SECTIONS[tab] : undefined;
  if (!target && !section) return;
  const hash = section ? `#/profil/${section}` : `#/${[target, ...parts.slice(1)].join('/')}${queryPart ? `?${queryPart}` : ''}`;
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
  if (p0 === 'profil') return { name: 'profile', section: p1 ?? null };
  if (p0 === 'erfolge') return { name: 'achievements', tab: p1 ?? null }; // v9 J
  if (p0 === 'lernen') {
    const id = p1 && Object.hasOwn(SUBTYPES, p1) ? p1 : null;
    return { name: 'learn', id, guide: id !== null && parts[2] === 'schritte' };
  }
  if (p0 === 'chain') return { name: 'chain' };
  if (p0 === 'case') return { name: 'case', id: p1 !== undefined && (p1 === 'random' || caseById(p1) !== null) ? p1 : null }; // v9 C
  if (p0 === 'parallel') return { name: 'parallel' };
  if (p0 === 'custom') return { name: 'custom' };
  if (p0 === 'wettbewerbe') return { name: 'compete', query };
  if (p0 === 'einstufung') return { name: 'placement' };
  if (p0 === 'quests') return { name: 'quests' }; // v10 Q
  if (p0 === 'duell') return { name: 'duel', d: query.get('d') }; // v9 I
  if (p0 === 'rangliste') return { name: 'board', board: parseBoardQuery(query) };
  if (p0 === 'challenge' && isChallengeId(p1)) return { name: 'challenge', id: p1 };
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

/**
 * Tab und Shell-Zustand einer Route (v11 N, Zuordnung in core/nav.ts): vier Tabs; Profil = Modal-Seite ohne Tab;
 * Training, Ketten, Parallel = Fokus-Modus. „Eigenes“ gehört zu Heute, Statistik zu Erfolge.
 */
function shellFor(route: Route): ShellState {
  return shellOf(route.name, { caseId: route.name === 'case' ? route.id : null });
}
const tabOf = (route: Route): TabId | null => shellFor(route).tab;

/** Startseite eines Tabs (Profil-Knopf oben rechts): Heute, Lernen-Liste, Erfolge-Übersicht, Wettkampf. */
function isTabStart(route: Route): boolean {
  return route.name === 'today' || route.name === 'compete' || (route.name === 'learn' && !route.id) || (route.name === 'achievements' && !route.tab);
}

function readLastTab(): string | null {
  try { return sessionStorage.getItem(LAST_TAB_KEY); } catch { return null; }
}

/** Hash des zuletzt gezeigten Tabs (Ziel von „Schließen“ im Profil). */
export function lastTabTarget(): string { return lastTabHash(readLastTab()); }

function rememberTab(route: Route): void {
  if (!tabOf(route)) return;
  try { sessionStorage.setItem(LAST_TAB_KEY, location.hash || '#/'); } catch { /* Speicher gesperrt: Schließen führt zu Heute */ }
}

/**
 * Seiten, deren Aufbau (nicht nur das CSS) von der Layout-Stufe abhängt und die beim Drehen neu gezeichnet werden.
 * Training und geführtes Lernen bleiben bewusst außen vor: Neu zeichnen würde die laufende Runde abbrechen.
 */
function redrawsOnLayout(route: Route): boolean {
  return route.name === 'progress' || route.name === 'achievements' || route.name === 'profile' || (route.name === 'learn' && !route.guide);
}

/** Schlüssel für die gemerkte Scroll-Position (nur Tab-Seiten; Lernen-Liste, -Detail und -Schritte getrennt). */
function scrollKey(route: Route): string | null {
  if (route.name === 'learn') return route.id ? `learn/${route.id}${route.guide ? '/guide' : ''}` : 'learn';
  if (route.name === 'profile') return route.section ? `profile/${route.section}` : 'profile';
  return tabOf(route) ? route.name : null;
}

function routeTitle(route: Route): string | null {
  switch (route.name) {
    case 'progress': return t('rewards.statsTitle'); // v11: Statistik unter Erfolge
    case 'achievements': return t('rewards.title'); // v9 J
    case 'profile': return t('settings.title');
    case 'learn': return t('lernen.title');
    case 'chain': return t('settings.routeChain');
    case 'case': return t('cases.title'); // v9 C
    case 'parallel': return t('settings.routeParallel');
    case 'custom': return t('settings.routeCustom');
    case 'compete': return t('compete.title');
    case 'board': return t('compete.boardTitle');
    case 'challenge': return t('compete.title');
    case 'duel': return t('duel.title'); // v9 I
    case 'quests': return t('quests.title'); // v10 Q
    case 'placement': return t('placement.title');
    case 'train': return modeName(route.mode);
    default: return t('settings.routeTraining');
  }
}

function draw(route: Route): void {
  if (route.name === 'progress') renderAnalyse();
  else if (route.name === 'achievements') renderAchievements(route.tab); // v9 J
  else if (route.name === 'learn') renderLernen(route.id, route.guide);
  else if (route.name === 'profile') renderSettings(route.section);
  else if (route.name === 'chain') renderChain();
  else if (route.name === 'case') renderCase(route.id); // v9 C
  else if (route.name === 'parallel') renderParallel();
  else if (route.name === 'custom') renderCustom();
  else if (route.name === 'compete') renderCompete(route.query);
  else if (route.name === 'board') renderLeaderboard(route.board);
  else if (route.name === 'challenge') renderChallenge(route.id);
  else if (route.name === 'placement') renderPlacement();
  else if (route.name === 'duel') renderDuel(route.d); // v9 I
  else if (route.name === 'quests') renderQuests(); // v10 Q
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
  // Rundgang: Der Schnappschuss des Übergangs läge über dem Touch-Punkt, und Ziele müssen sofort da sein
  if (typeof start !== 'function' || !from || !to || from === to || reducedMotion() || isDemoData()) {
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

let navHintTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleNavHint(focus: boolean): void {
  if (navHintTimer !== null) clearTimeout(navHintTimer);
  navHintTimer = setTimeout(() => { navHintTimer = null; try { maybeShowNavHint(focus); } catch { /* Hinweis ist nebensächlich */ } }, 900);
}

export function render({ keepScroll = false }: RenderOptions = {}): void {
  canonicalize();
  const route = parseRoute();
  const shell = shellFor(route);
  const tab = shell.tab;
  const key = scrollKey(route);
  const wasModal = document.body.classList.contains('is-modal');
  const prevKey = shownKey;
  // Position der verlassenen Tab-Seite merken
  if (prevKey !== null && prevKey !== key) scrollByKey.set(prevKey, window.scrollY);
  const keepY = keepScroll ? window.scrollY : null;

  withTransition(shownTab, tab, () => {
    runCleanup();
    setTitle(routeTitle(route));
    setShell(tab, { modal: shell.modal });
    app.classList.toggle('modal-enter', shell.modal && !wasModal);
    paintSidebarProfile();
    rememberTab(route);
    setPrimaryAction(null);
    app.replaceChildren();
    // Für seitenspezifische Layouts ab Tablet-Breite (public/css/layout.css)
    app.dataset['view'] = route.name;
    shownKey = key;
    shownTab = tab;
    try {
      draw(route);
    } catch (e) {
      // Nie eine leere Seite: Fehlerkarte mit Bericht; Tab-Leiste und andere Seiten bleiben nutzbar
      console.error(e);
      runCleanup();
      setPrimaryAction(null);
      renderCrash(app, e, location.hash || '#/', () => rerender());
    }
    // v11 N: Profil-Knopf (Liga-Emblem) in den Titel der Tab-Startseiten; nicht bei der Fehlerkarte
    if (isTabStart(route) && !app.querySelector('.crash')) mountAccountButton(app);
    // v11 T: einmaliger Hinweis nach dem Update – erst kurz nach dem Zeichnen (Dialoge/Rundgang-Ende haben dann ihren Stand)
    scheduleNavHint(tab === null && !shell.modal);
    // Für den Start-Wächter (public/js/boot-guard.js): Die App hat gezeichnet
    document.documentElement.dataset['booted'] = '1';
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
  // Ein offenes Sheet (Eingaben!) bleibt stehen; die Seite passt sich beim nächsten Aufruf an
  onLayoutChange(() => {
    if (redrawsOnLayout(parseRoute()) && !document.querySelector('dialog[open]')) rerender({ keepScroll: true });
  });
  render();
}
