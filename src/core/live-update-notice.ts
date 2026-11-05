// Hinweise zu Live-Updates der iOS-App (docs/PLAN-live-updates.md) ohne DOM (testbar): was gerade zu sehen ist –
// Fortschritt beim Laden, „Update bereit“ mit „Jetzt aktualisieren“, nichts während einer Runde – und ob dieser Start
// der erste nach einem Wechsel ist. src/platform/live-update.ts verdrahtet das mit Toasts und Router.
import type { LiveState, Running } from './live-update.ts';

export type NoticePhase =
  | { kind: 'idle' }
  | { kind: 'loading'; version: string; done: number; total: number }
  | { kind: 'ready'; version: string };

export type NoticeView =
  | { kind: 'none' }
  | { kind: 'progress'; version: string; done: number; total: number; percent: number }
  | { kind: 'ready'; version: string };

/** Fortschritt in ganzen Prozent (0–100); ohne Dateien 0. */
export function progressPercent(done: number, total: number): number {
  if (!(total > 0) || !(done > 0)) return 0;
  return Math.min(100, Math.floor((done / total) * 100));
}

/** Was zu sehen ist: während einer Runde nichts (wie beim Update-Hinweis der Website, features/pwa-update.ts). */
export function noticeView(phase: NoticePhase, roundRunning: boolean): NoticeView {
  if (roundRunning || phase.kind === 'idle') return { kind: 'none' };
  if (phase.kind === 'ready') return { kind: 'ready', version: phase.version };
  const done = Math.max(0, Math.min(phase.done, phase.total));
  return { kind: 'progress', version: phase.version, done, total: phase.total, percent: progressPercent(done, phase.total) };
}

/** Erster Start nach dem Wechsel: Das laufende Bundle ist der offene Probelauf → dessen Version, sonst null. */
export function updatedTo(state: LiveState, running: Running): string | null {
  return state.trial !== null && state.trial.id === running.id ? state.trial.version : null;
}

export interface NoticeDeps {
  /** Läuft gerade eine Runde? (isRoundRunning(location.hash)) */
  roundRunning(): boolean;
  /** Fortschritt zeigen bzw. aktualisieren */
  showProgress(v: Extract<NoticeView, { kind: 'progress' }>): void;
  hideProgress(): void;
  /** „Update … bereit“ mit Aktion „Jetzt aktualisieren“ */
  showReady(version: string, onApply: () => void): void;
  hideReady(): void;
  /** Vorgemerktes Bundle jetzt anwenden (Probelauf → Neuladen → ready) */
  apply(): void;
}

export interface Notice {
  loading(version: string, total: number): void;
  progress(done: number, total: number): void;
  /** Download abgebrochen: Hinweis weg, beim nächsten Mal neu */
  failed(): void;
  /** geladen und geprüft: gilt beim nächsten Start oder sofort per Aktion */
  ready(version: string): void;
  /** Hash geändert (Runde begonnen bzw. beendet) */
  routeChanged(): void;
}

/** Hinweis-Ablauf: zeigt nur, was sich ändert, und nie während einer Runde; Anwenden höchstens einmal. */
export function createNotice(deps: NoticeDeps): Notice {
  let phase: NoticePhase = { kind: 'idle' };
  let shown: NoticeView['kind'] = 'none';
  let applied = false;

  const onApply = (): void => {
    if (applied || deps.roundRunning() || phase.kind !== 'ready') return;
    applied = true;
    deps.hideReady();
    shown = 'none';
    deps.apply();
  };

  const render = (): void => {
    const view = noticeView(phase, deps.roundRunning() || applied);
    if (view.kind !== shown) {
      if (shown === 'progress') deps.hideProgress();
      if (shown === 'ready') deps.hideReady();
      if (view.kind === 'ready') deps.showReady(view.version, onApply);
      shown = view.kind;
    }
    if (view.kind === 'progress') deps.showProgress(view);
  };

  return {
    loading(version, total) { phase = { kind: 'loading', version, done: 0, total }; render(); },
    progress(done, total) {
      if (phase.kind !== 'loading') return;
      phase = { ...phase, done, total };
      render();
    },
    failed() { if (phase.kind === 'loading') { phase = { kind: 'idle' }; render(); } },
    ready(version) { phase = { kind: 'ready', version }; render(); },
    routeChanged() { render(); },
  };
}
