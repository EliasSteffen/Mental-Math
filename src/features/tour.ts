// Live-Rundgang: Die echte App bedient sich selbst, auf Demo-Daten im Speicher, mit Touch-Punkt und Texten (ui/tour-overlay.ts).
// Läuft beim ersten Start, nach Updates („Zeig’s mir“) und fürs Store-Video. Inhalte: features/tour-scripts.ts.
// Regeln: echte Daten bleiben unberührt (data/storage.ts), keine Verlaufseinträge (replaceRoute), während des Rundgangs
// löst nur die Rundgang-Oberfläche etwas aus (Klick-Sperre); am Ende zuerst die Seite räumen, dann zu den echten Daten zurück.
import { stepApplies, SAY_MS, type TourChapter, type TourId, type TourStep } from '../core/tour.ts';
import { enterDemoData, exitDemoData, getSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { render, replaceRoute, runCleanup } from '../router.ts';
import { isModalOpen } from '../ui/modal.ts';
import { applyTheme } from '../ui/theme.ts';
import { createTourOverlay, firstVisible, type TourOverlay } from '../ui/tour-overlay.ts';
import { isTablet, isWide } from '../ui/viewport.ts';
import { setDemoAccount, type AccountState } from './account.ts';
import { setDemoChallenge } from './challenge.ts';
import { demoChallengeResponder, demoTasks, seedDemoData, type DemoKeep } from './tour-demo.ts';
import { TOURS } from './tour-scripts.ts';
import type { Task, ThemeSetting } from '../types.ts';

export type TourEnd = 'done' | 'skip' | 'error';

export interface StartTourOptions {
  /** Nur dieses Kapitel spielen */
  chapter?: string;
  /** Aufnahme fürs Store-Video: ohne Bedienleiste, helles Theme */
  record?: boolean;
  /** Aufnahme der Screenshots: auch ohne Abdunklung und Touch-Punkt */
  shots?: boolean;
  onEnd?: (end: TourEnd) => void;
}

const RETRY_KEY = 'mm.retry';
const TRAIN_RETRY = '#/train/retry';
/** So lange wartet „Jetzt du“ auf eine erste Eingabe bzw. auf das Prüfen nach begonnener Eingabe (ms). */
const ASK_IDLE_MS = 9000;
const ASK_TYPING_MS = 20000;
const FIND_MS = 1500;

class Interrupted extends Error {}

interface Session {
  chapters: readonly TourChapter[];
  overlay: TourOverlay;
  record: boolean;
  reduced: boolean;
  index: number;
  tasks: Task[];
  taskIndex: number;
  paused: boolean;
  /** Während „Jetzt du“: Tastenfeld gehört der Person */
  asking: boolean;
  /** Der Rundgang klickt gerade selbst (Klick-Sperre lässt durch) */
  driving: boolean;
  /** Laufendes Kapitel abbrechen; Ziel in `jump`, Ende in `ending` */
  interrupt: boolean;
  jump: number | null;
  ending: 'done' | 'skip' | null;
  /** Reduced Motion: „Weiter“ geht einen Schritt weiter */
  advance: boolean;
  origin: string;
  savedRetry: string | null;
  removeGuards: () => void;
  onEnd: ((end: TourEnd) => void) | undefined;
}

let session: Session | null = null;

export function isTourRunning(): boolean { return session !== null; }

/** Wartet `ms` Laufzeit; Pause und offene Dialoge halten die Uhr an. Bricht ab, sobald das Kapitel verlassen wird. */
function sleep(s: Session, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let left = ms;
    let last = performance.now();
    const id = setInterval(() => {
      if (s.interrupt) { clearInterval(id); reject(new Interrupted()); return; }
      const now = performance.now();
      if (!s.paused && !isModalOpen()) left -= now - last;
      last = now;
      if (left <= 0) { clearInterval(id); resolve(); }
    }, 30);
  });
}

/** Text stehen lassen: normal `ms`, bei Reduced Motion bis „Weiter“. */
async function hold(s: Session, ms: number): Promise<void> {
  if (!s.reduced) { await sleep(s, ms); return; }
  s.advance = false;
  while (!s.advance) await sleep(s, 60);
}

async function find(s: Session, selector: string): Promise<HTMLElement | null> {
  for (let waited = 0; waited < FIND_MS; waited += 50) {
    const el = firstVisible(selector);
    if (el) return el;
    await sleep(s, 50);
  }
  return null;
}

function ensureVisible(el: HTMLElement, reduced: boolean): void {
  const r = el.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= window.innerHeight) return;
  el.scrollIntoView({ block: r.height < window.innerHeight * 0.7 ? 'center' : 'start', behavior: reduced ? 'auto' : 'smooth' });
}

/** Klick im Namen des Rundgangs; interne Links ohne Verlaufseintrag. */
function click(s: Session, el: HTMLElement): void {
  const href = el instanceof HTMLAnchorElement ? el.getAttribute('href') : null;
  s.driving = true;
  try {
    if (href?.startsWith('#')) replaceRoute(href);
    else el.click();
  } finally {
    s.driving = false;
  }
}

async function tap(s: Session, selector: string, fast = false): Promise<void> {
  const el = await find(s, selector);
  if (!el) return;
  ensureVisible(el, s.reduced);
  s.overlay.spot(null);
  s.overlay.point(selector, fast);
  await sleep(s, fast ? 240 : 620);
  s.overlay.press(true);
  await sleep(s, fast ? 90 : 140);
  click(s, el);
  s.overlay.press(false);
  await sleep(s, fast ? 90 : 320);
}

async function typeAnswer(s: Session, wrong: boolean): Promise<void> {
  const task = s.tasks[s.taskIndex];
  s.taskIndex += 1;
  if (!task) return;
  // Falsch: eine Null zu viel, der typische Fehler beim Kopfrechnen
  for (const digit of String(wrong ? task.expected * 10 : task.expected)) await tap(s, `.numpad-key[data-key="${digit}"]`, true);
  await tap(s, '.numpad-check');
  s.overlay.point(null);
}

const isAnswered = (): boolean => document.querySelector('.focus > .sheet') !== null;

/** „Jetzt du“: Tastenfeld freigeben; bleibt die Eingabe aus, löscht der Touch-Punkt Angefangenes und tippt selbst. */
async function askUser(s: Session, text: string): Promise<void> {
  s.overlay.say(text);
  s.overlay.point(null);
  s.overlay.spot('.numpad');
  const input = (): HTMLInputElement | null => document.querySelector<HTMLInputElement>('.train-input');
  s.asking = true;
  try {
    let waited = 0;
    while (!isAnswered() && waited < ((input()?.value ?? '') === '' ? ASK_IDLE_MS : ASK_TYPING_MS)) {
      await sleep(s, 100);
      waited += 100;
    }
  } finally {
    s.asking = false;
  }
  s.overlay.spot(null);
  if (isAnswered()) { s.taskIndex += 1; return; }
  for (let i = 0; i < 12 && (input()?.value ?? '') !== ''; i += 1) await tap(s, '.numpad-key.is-aux', true);
  await typeAnswer(s, false);
}

async function exec(s: Session, step: TourStep): Promise<void> {
  switch (step.kind) {
    case 'go':
      s.overlay.point(null);
      s.overlay.spot(null);
      replaceRoute(step.hash);
      if (step.hash === TRAIN_RETRY) sessionStorage.removeItem(RETRY_KEY); // sonst überlebt die Liste das Ende des Rundgangs
      await sleep(s, 400);
      return;
    case 'say': {
      s.overlay.say(t(step.text));
      s.overlay.point(null);
      const el = step.target ? await find(s, step.target) : null;
      if (el) ensureVisible(el, s.reduced);
      s.overlay.spot(el && step.target ? step.target : null);
      if (s.record) console.info('mm-record-say', step.text); // Taktgeber für scripts/record-preview.ts
      await hold(s, step.ms ?? SAY_MS);
      return;
    }
    case 'tap': await tap(s, step.target); return;
    case 'answer': await typeAnswer(s, step.wrong === true); return;
    case 'ask': await askUser(s, t(step.text)); return;
    case 'wait': await sleep(s, step.ms); return;
  }
}

async function playChapter(s: Session, ch: TourChapter): Promise<void> {
  s.interrupt = false;
  s.overlay.setChapter(s.index, t(ch.title));
  s.overlay.say('');
  s.overlay.spot(null);
  s.overlay.point(null);
  if (ch.tasks) {
    s.tasks = demoTasks(ch.tasks, 38 + s.index);
    s.taskIndex = 0;
    sessionStorage.setItem(RETRY_KEY, JSON.stringify(s.tasks));
  }
  const layout = { tablet: isTablet(), wide: isWide() };
  for (const step of ch.steps) {
    if (stepApplies(step.only, layout)) await exec(s, step);
  }
}

async function run(s: Session): Promise<'done' | 'skip'> {
  while (s.index >= 0 && s.index < s.chapters.length) {
    const ch = s.chapters[s.index];
    if (!ch) break;
    try {
      await playChapter(s, ch);
      s.index += 1;
    } catch (e) {
      if (!(e instanceof Interrupted)) throw e;
      if (s.ending) return s.ending;
      s.index = s.jump ?? s.index;
      s.jump = null;
    }
  }
  return 'done';
}

function jump(s: Session, index: number): void {
  if (index < 0) return;
  if (index >= s.chapters.length) { end(s, 'done'); return; }
  s.jump = index;
  s.interrupt = true;
}

function end(s: Session, how: 'done' | 'skip'): void {
  s.ending = how;
  s.interrupt = true;
}

/** Nur die Rundgang-Oberfläche (und offene Dialoge) dürfen etwas auslösen; bei „Jetzt du“ auch das Tastenfeld. */
function installGuards(s: Session): () => void {
  const guard = (e: Event): void => {
    if (s.driving) return;
    const target = e.target;
    if (target instanceof Element) {
      if (target.closest('.tour-ui, dialog[open]')) return;
      if (s.asking && target.closest('.numpad, .train-field')) return;
    }
    if (e instanceof KeyboardEvent && e.key === 'Escape') end(s, 'skip');
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onHash = (): void => { end(s, 'skip'); }; // replaceRoute löst keins aus: das war Zurück bzw. ein echter Link
  const types = ['click', 'keydown', 'submit', 'change'];
  for (const type of types) document.addEventListener(type, guard, true);
  window.addEventListener('hashchange', onHash);
  return () => {
    for (const type of types) document.removeEventListener(type, guard, true);
    window.removeEventListener('hashchange', onHash);
  };
}

/** Reihenfolge wichtig: erst die Seite räumen (sie schreibt sonst Demo-Antworten ins Echte), dann zu den echten Daten. */
function finish(s: Session, how: TourEnd): void {
  if (session !== s) return;
  if (s.record) console.info('mm-record-end');
  s.removeGuards();
  s.overlay.destroy();
  runCleanup();
  setDemoChallenge(null);
  setDemoAccount(null);
  exitDemoData();
  delete document.documentElement.dataset['tour'];
  if (s.savedRetry === null) sessionStorage.removeItem(RETRY_KEY);
  else sessionStorage.setItem(RETRY_KEY, s.savedRetry);
  session = null;
  applyTheme(getSettings().theme);
  try { history.replaceState(history.state, '', s.origin); } catch { /* Adresse bleibt, Inhalt stimmt trotzdem */ }
  render();
  s.onEnd?.(how);
}

export function startTour(id: TourId, o: StartTourOptions = {}): void {
  if (session) return;
  const all = TOURS[id].chapters;
  const chapters = o.chapter ? all.filter((c) => c.id === o.chapter) : all;
  if (chapters.length === 0) return;

  const real = getSettings();
  // „System“ als konkretes Theme: Im Kapitel Einstellungen soll der Wechsel sichtbar sein
  const shownTheme = document.documentElement.getAttribute('data-theme') as ThemeSetting | null;
  const keep: DemoKeep = {
    lang: real.lang, theme: o.record ? 'paper' : shownTheme ?? real.theme, keypadSide: real.keypadSide, numpadLayout: real.numpadLayout,
  };
  const savedRetry = sessionStorage.getItem(RETRY_KEY);

  enterDemoData();
  try {
    seedDemoData(keep);
  } catch (e) {
    exitDemoData();
    console.error('tour: Demo-Daten', e);
    o.onEnd?.('error');
    return;
  }
  const account = { status: 'signed-in', user: { id: 'demo', username: 'Demo' } } as AccountState;
  setDemoAccount(account);
  setDemoChallenge(demoChallengeResponder());
  document.documentElement.dataset['tour'] = '1';
  if (o.record) applyTheme('paper');

  const s: Session = {
    chapters, record: o.record === true,
    reduced: typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    index: 0, tasks: [], taskIndex: 0, paused: false, asking: false, driving: false, interrupt: false, jump: null, ending: null, advance: false,
    origin: location.hash || '#/', savedRetry, onEnd: o.onEnd,
    removeGuards: () => undefined,
    overlay: createTourOverlay({
      record: o.record === true, shots: o.shots === true, chapters: chapters.length,
      onPause: () => { s.paused = !s.paused; s.overlay.setPaused(s.paused); },
      onBack: () => { jump(s, s.index - 1); },
      onNext: () => { if (s.reduced) s.advance = true; else jump(s, s.index + 1); },
      onSkip: () => { end(s, 'skip'); },
    }),
  };
  s.removeGuards = installGuards(s);
  session = s;
  if (s.record) console.info('mm-record-start');
  run(s).then((how) => { finish(s, how); }, (e: unknown) => {
    console.error('tour', e);
    finish(s, 'error');
  });
}
