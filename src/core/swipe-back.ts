// Zurück-Wisch (DOM-frei): auf welchen Seiten gilt der Wisch vom linken Rand, und woher weiß die Web-Schicht, wohin er führt?
// Gegenstück in Swift: ios/App/App/MainViewController.swift (allowsSwipeBack); tests/swipe-back.test.ts hält die Listen gleich.
// Die Web-Geste selbst (nur iOS-App ohne neues Plugin) steht in src/ui/edge-swipe.ts.

/** Oberste Pfadteile laufender Runden (src/router.ts, Fokus-Modus): dorthin führt nie ein Wisch, er würde eine neue Runde starten. */
export const SESSION_ROOTS: readonly string[] = ['train', 'chain', 'parallel', 'einstufung', 'challenge'];

/**
 * Seiten, die auf jeder Tiefe ein Zurück haben: Profil (Modal-Seite seit v11, „settings“ = alter Pfad), Statistik
 * („analyse“ = alter Pfad), Quests, Eigenes, Rangliste, Duell und alle Rennen-Seiten. Ein laufendes Rennen sperrt
 * die Web-Schicht separat (setSwipeBackBlocked).
 */
export const ANY_DEPTH_ROOTS: readonly string[] = ['profil', 'settings', 'fortschritt', 'analyse', 'quests', 'custom', 'rangliste', 'duell', 'rennen'];

/** Seiten mit Zurück erst ab Tiefe 2: die Startseiten der Tabs „Lernen“ und „Erfolge“ haben keins, ihre Unterseiten schon. */
export const SUBPAGE_ROOTS: readonly string[] = ['lernen', 'erfolge'];

/** Wie vor v10–v12 in Swift (App-Builds ohne SwipeBack-Plugin): dort macht WebKit die Geste schon selbst. */
export const LEGACY_SUBPAGE_ROOTS: readonly string[] = ['lernen', 'profil'];
export const LEGACY_ANY_DEPTH_ROOTS: readonly string[] = ['custom', 'rangliste'];

interface ParsedPath { root: string; depth: number }

/** „#/lernen/x?a=1“ → { root: 'lernen', depth: 2 }; Startseite → null. */
function parse(path: string | null): ParsedPath | null {
  if (path === null) return null;
  const parts = normalizePath(path).split('/').filter(Boolean);
  const root = parts[0];
  return root === undefined ? null : { root, depth: parts.length };
}

/** Pfad ohne „#“, Anfangs-/Endstrich und Query: Schlüssel für Vergleiche und Meldungen an das Plugin („erfolge/shop“, Heute = ''). */
export function normalizePath(path: string): string {
  return (path.replace(/^#/, '').split('?')[0] ?? '').split('/').filter(Boolean).join('/');
}

/** Läuft hier eine Runde (Training, Ketten, Parallel, Einstufung, Challenge, Spiel eines Mini-Cases)? */
export function isSessionPath(path: string | null): boolean {
  const p = parse(path);
  return p !== null && (SESSION_ROOTS.includes(p.root) || (p.root === 'case' && p.depth > 1));
}

/**
 * Darf von dieser Seite zurückgewischt werden? Nur auf Unterseiten – Tab-Startseiten haben kein Zurück, laufende Runden
 * würden ohne Rückfrage abgebrochen – und nie zurück in eine Runde (previousPath: Seite davor; null = keine).
 */
export function swipeBackAllowed(path: string, previousPath: string | null): boolean {
  if (previousPath === null || isSessionPath(previousPath)) return false;
  const p = parse(path);
  if (!p) return false;
  if (ANY_DEPTH_ROOTS.includes(p.root)) return true;
  if (SUBPAGE_ROOTS.includes(p.root)) return p.depth > 1;
  return p.root === 'case' && p.depth === 1; // Auswahl ohne ID
}

/** Die alte Swift-Regel (siehe oben); previousPath null = unbekannt, nicht gesperrt. */
export function legacyNativeAllows(path: string, previousPath: string | null): boolean {
  const p = parse(path);
  if (!p) return false;
  const prev = parse(previousPath);
  if (prev && SESSION_ROOTS.includes(prev.root)) return false;
  if (LEGACY_SUBPAGE_ROOTS.includes(p.root)) return p.depth > 1;
  return LEGACY_ANY_DEPTH_ROOTS.includes(p.root);
}

/** Meldung an das native Plugin: Wisch an/aus für diese Seite. */
export function nativeSwipeEnabled(path: string, previousPath: string | null, blocked: boolean): boolean {
  return !blocked && swipeBackAllowed(path, previousPath);
}

/**
 * Soll die Web-Geste laufen? Nur in der App ohne neues Plugin, wo der Wisch erlaubt ist, WebKit ihn aber nicht selbst
 * macht (alte Swift-Regel), und nichts gesperrt ist.
 */
export function webSwipeWanted(o: { path: string; previousPath: string | null; blocked: boolean; pluginAvailable: boolean }): boolean {
  if (o.pluginAvailable || o.blocked) return false;
  return swipeBackAllowed(o.path, o.previousPath) && !legacyNativeAllows(o.path, o.previousPath);
}

/** Loslassen jenseits dieses Anteils der Breite löst Zurück aus … */
const COMMIT_RATIO = 0.35;
/** … oder schneller als FLING_SPEED (px/ms) und mindestens MIN_FLING_PX weit. */
const FLING_SPEED = 0.5;
const MIN_FLING_PX = 40;

/** Entscheidung beim Loslassen der Web-Geste: Zurück (true) oder zurückfedern. */
export function swipeCommits(dx: number, speed: number, width: number): boolean {
  return dx > width * COMMIT_RATIO || (speed > FLING_SPEED && dx > MIN_FLING_PX);
}

/* ---------- Verlauf der Web-Schicht ---------- */

/** Verlaufs-Stapel der gezeigten Seiten (der Router kennt sonst keinen Vorgänger). */
export interface NavHistory {
  /** Gezeigte Seite melden: gleich der letzten → nichts; gleich der vorletzten → Zurück (pop); sonst push; replace ersetzt die letzte. */
  report(path: string, replace?: boolean): void;
  /** Seite vor der aktuellen oder null */
  previous(): string | null;
  current(): string | null;
}

export function createNavHistory(limit = 60): NavHistory {
  let stack: string[] = [];
  return {
    report(path, replace = false) {
      const p = normalizePath(path);
      if (stack[stack.length - 1] === p) return;
      if (replace && stack.length > 0) stack[stack.length - 1] = p;
      else if (stack.length >= 2 && stack[stack.length - 2] === p) stack.pop();
      else stack.push(p);
      if (stack.length > limit) stack = stack.slice(-limit);
    },
    previous: () => stack[stack.length - 2] ?? null,
    current: () => stack[stack.length - 1] ?? null,
  };
}

const navHistory = createNavHistory();
let blocked = false;
const listeners = new Set<() => void>();

function notify(): void { for (const fn of [...listeners]) fn(); }

/** Router: eine Seite wurde gezeichnet (Hash ohne Alias; replace: ohne Verlaufseintrag, replaceRoute). */
export function recordRoute(hash: string, replace = false): void {
  navHistory.report(hash, replace);
  notify();
}

export function currentRoute(): string | null { return navHistory.current(); }
export function previousRoute(): string | null { return navHistory.previous(); }

/** Ein laufendes Rennen sperrt den Wisch: er würde es ohne Rückfrage abbrechen. */
export function setSwipeBackBlocked(on: boolean): void {
  if (blocked === on) return;
  blocked = on;
  notify();
}
export function swipeBackBlocked(): boolean { return blocked; }

/** Wird bei jeder gezeichneten Seite und bei Änderung der Sperre aufgerufen; Rückgabe meldet wieder ab. */
export function onSwipeBackChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
