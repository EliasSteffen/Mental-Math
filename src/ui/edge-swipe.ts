// Zurück-Wisch vom linken Rand in der iOS-App (v12-Fehler: „Wischen funktioniert nicht überall“).
// Wirkt in App-Builds ohne das native Plugin „SwipeBack“ (laufende App Store-Version, Live-Update) auf Seiten, die die alte
// Swift-Regel nicht kennt; dort schaltet WebKit seine Geste ab. Mit dem Plugin meldet dieses Modul nur den Pfad (reportSwipeBack),
// und WebKit macht alles selbst. Die Website hat keine Web-Geste: Safari bringt eine eigene mit.
import { app } from './dom.ts';
import { isModalOpen } from './modal.ts';
import { isSheetOpen } from './sheet.ts';
import { isNative, reportSwipeBack, swipeBackPluginAvailable } from '../platform/index.ts';
import {
  nativeSwipeEnabled, normalizePath, onSwipeBackChange, previousRoute, swipeBackBlocked, swipeCommits, webSwipeWanted,
} from '../core/swipe-back.ts';

/** Startzone am linken Rand (px) */
export const EDGE_PX = 20;
/** Ab dieser waagerechten Bewegung (px) rastet die Geste ein, wenn sie deutlich waagerecht ist */
const LOCK_PX = 10;
/** Längste Wartezeit auf das Ende einer Animation bzw. die neue Seite (ms) */
const SETTLE_MAX_MS = 450;

type Phase = 'idle' | 'armed' | 'drag' | 'out' | 'spring' | 'back';

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function hashPath(): string { return normalizePath(location.hash); }

/** Läuft die Web-Geste auf der aktuellen Seite? */
function wanted(): boolean {
  if (!isNative() || isModalOpen() || isSheetOpen()) return false;
  return webSwipeWanted({ path: hashPath(), previousPath: previousRoute(), blocked: swipeBackBlocked(), pluginAvailable: swipeBackPluginAvailable() });
}

let started = false;

export function startEdgeSwipe(): void {
  if (started) return;
  started = true;
  const root = document.documentElement;
  let phase: Phase = 'idle';
  let id = -1;
  let x0 = 0;
  let y0 = 0;
  let dx = 0;
  let width = 1;
  let lastX = 0;
  let lastT = 0;
  let speed = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Zählt Abbrüche: eine veraltete Animation löst nichts mehr aus */
  let gen = 0;

  const clearTimer = (): void => { if (timer !== null) { clearTimeout(timer); timer = null; } };

  /** Alles zurück auf Anfang, ohne Animation. */
  const reset = (): void => {
    clearTimer();
    gen += 1;
    phase = 'idle';
    root.classList.remove('is-edge-swiping');
    app.classList.remove('is-swiping', 'is-swipe-settle');
    app.style.removeProperty('--swipe-x');
  };

  /** Animation (CSS-Transition auf #app) bis zum Ende oder bis SETTLE_MAX_MS. */
  const settle = (to: number, then: () => void): void => {
    const mine = gen;
    app.classList.add('is-swipe-settle');
    app.style.setProperty('--swipe-x', `${Math.round(to)}px`);
    let done = false;
    const end = (): void => {
      if (done || mine !== gen) return;
      done = true;
      app.removeEventListener('transitionend', onEnd);
      then();
    };
    const onEnd = (e: TransitionEvent): void => { if (e.target === app && e.propertyName === 'transform') end(); };
    app.addEventListener('transitionend', onEnd);
    clearTimer();
    timer = setTimeout(end, SETTLE_MAX_MS);
  };

  const goBack = (): void => {
    phase = 'back';
    clearTimer();
    // Die neue Seite meldet der Router (onSwipeBackChange → reset); bleibt sie aus (z. B. kein Verlauf), räumt der Zeitgeber auf.
    timer = setTimeout(reset, SETTLE_MAX_MS);
    history.back();
  };

  const release = (): void => {
    if (phase !== 'drag') { reset(); return; }
    if (!swipeCommits(dx, speed, width)) {
      if (reducedMotion()) { reset(); return; }
      phase = 'spring';
      settle(0, reset);
      return;
    }
    if (reducedMotion()) { goBack(); return; }
    phase = 'out';
    settle(width, goBack);
  };

  const onStart = (e: TouchEvent): void => {
    if (e.touches.length !== 1) { if (phase === 'armed' || phase === 'drag') reset(); return; }
    if (phase !== 'idle') return;
    const t = e.touches[0];
    if (!t || t.clientX > EDGE_PX || !wanted()) return;
    phase = 'armed';
    id = t.identifier;
    x0 = lastX = t.clientX;
    y0 = t.clientY;
    dx = 0;
    speed = 0;
    lastT = e.timeStamp;
    width = Math.max(1, window.innerWidth);
  };

  const onMove = (e: TouchEvent): void => {
    if (phase !== 'armed' && phase !== 'drag') return;
    if (e.touches.length !== 1) { reset(); return; }
    const t = Array.from(e.touches).find((x) => x.identifier === id);
    if (!t) return;
    const mx = t.clientX - x0;
    const my = t.clientY - y0;
    if (phase === 'armed') {
      if (Math.abs(my) > LOCK_PX && Math.abs(my) >= Math.abs(mx)) { reset(); return; } // senkrecht: die Seite scrollt
      if (mx <= LOCK_PX || Math.abs(my) >= mx) return; // noch nicht eindeutig waagerecht
      phase = 'drag';
      root.classList.add('is-edge-swiping');
      app.classList.add('is-swiping');
    }
    if (e.cancelable) e.preventDefault();
    const dt = e.timeStamp - lastT;
    if (dt > 0) speed = (t.clientX - lastX) / dt;
    lastX = t.clientX;
    lastT = e.timeStamp;
    dx = Math.max(0, mx);
    app.style.setProperty('--swipe-x', `${Math.round(dx)}px`);
  };

  const onEnd = (e: TouchEvent): void => {
    if (phase !== 'armed' && phase !== 'drag') return;
    if (e.type === 'touchcancel') { if (phase === 'drag') { dx = 0; speed = 0; } release(); return; }
    release();
  };

  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd, { passive: true });
  document.addEventListener('touchcancel', onEnd, { passive: true });

  // Die Seite wurde (neu) gezeichnet oder die Sperre hat sich geändert
  onSwipeBackChange(() => {
    if (phase === 'back') {
      reset();
      app.classList.remove('swipe-arrive');
      if (!reducedMotion()) {
        void app.offsetWidth; // Animation neu starten
        app.classList.add('swipe-arrive');
      }
    } else if (phase !== 'idle') {
      reset(); // Zeichnen während der Geste: abbrechen, nichts bleibt hängen
    }
    syncNative();
  });
  app.addEventListener('animationend', (e) => { if (e.target === app) app.classList.remove('swipe-arrive'); });
}

/** Ab dem App-Build mit Plugin: aktuellen Pfad samt Entscheidung (inkl. Sperre) an Swift melden. */
function syncNative(): void {
  if (!isNative() || !swipeBackPluginAvailable()) return;
  const path = hashPath();
  reportSwipeBack(path, nativeSwipeEnabled(path, previousRoute(), swipeBackBlocked()));
}
