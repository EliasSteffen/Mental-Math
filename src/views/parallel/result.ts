// Parallel · Ergebnis (Fokus-Modus) wie das Rundenergebnis: „N von M Ketten richtig“, Ergebnis-Segmente,
// ruhige Hinweise (Bestwert, Serie), Liste je Kette mit „deine X · richtig Y“; Dock „Fertig“ / „Ergebnis teilen“ + CTA „Nochmal“.
import type { ParallelChainResult, ParallelState } from '../../types.ts';
import { scoreParallel, updateParallelStats } from '../../core/parallel.ts';
import { fmt } from '../../core/numbers.ts';
import { getParallelStats, setParallelStats } from '../../data/storage.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { go } from '../../router.ts';
import { button, group, icon, insight, list, resultRow, resultSegments } from '../../ui/kit.ts';
import { setTitle } from '../../ui/title.ts';
import { bindResultKeys } from '../../ui/modal.ts';
import { tapGuard } from '../../ui/dock.ts';
import { playDock } from '../play-ui.ts';
import { t } from '../../i18n/index.ts';
import { maybeAskForReview } from '../../features/app-store.ts';
import { publicUrl } from '../../platform/index.ts';
import { buildShareCard } from '../../features/share-card.ts';
import { shareCardButton } from '../../ui/share-card.ts';

export interface ParallelSession {
  /** aufeinanderfolgende fehlerfreie Runden in diesem Besuch */
  streak: number;
}

/** '12 → + 7 = 19 → × 2 = 38' */
function historyLine(c: ParallelChainResult): string {
  const start = (c.history[0] ?? '').replace(/^Start\s*/, '');
  const parts = [start];
  for (let i = 1; i < c.history.length; i += 1) {
    parts.push(`${c.history[i] ?? ''} = ${fmt(c.totals[i] ?? 0)}`);
  }
  return parts.join(' → ');
}

/** Zeile je Kette: Punkt (richtig/falsch), „Kette A“, „deine X · richtig Y“ und der Verlauf. */
function chainRow(c: ParallelChainResult): HTMLElement {
  const expected = fmt(c.expected);
  return resultRow({
    ok: c.correct,
    label: t('parallel.chain', { id: c.id }),
    sub: c.given === null ? t('parallel.rowNoAnswer', { expected }) : t('parallel.rowLine', { given: fmt(c.given), expected }),
    note: historyLine(c),
  });
}

/** Zeichnet das Ergebnis; liefert die Aufräum-Funktion (Tastenkürzel Enter = Nochmal, Esc = Fertig). */
export function renderResult(
  state: ParallelState,
  session: ParallelSession,
  onAgain: (nextStart: 2 | 3 | 4) => void,
): () => void {
  const result = scoreParallel(state);
  const before = getParallelStats();
  session.streak = result.allCorrect ? session.streak + 1 : 0;
  const stats = updateParallelStats(before, result, session.streak);
  setParallelStats(stats);
  const newBest = result.allCorrect && stats.bestChains > before.bestChains;
  const again = (): void => onAgain(stats.nextStart);

  const title = h('h1', { class: 'play-result-title num', tabindex: '-1' },
    t('parallel.someRight', { correct: result.correct, total: result.total }));

  // Ergebniskarte als Bild teilen (wie im Training: Zeile „Fertig“ / „Ergebnis teilen“, darunter „Nochmal“)
  const shareBtn = shareCardButton(buildShareCard({
    kind: 'parallel', level: state.config.level, correct: result.correct, total: result.total, points: result.points,
    bestChains: stats.bestChains, bestStreak: stats.bestCorrectStreak, ts: Date.now(),
    marks: result.chains.map((c) => c.correct),
  }, publicUrl()));
  const resultDock = playDock(
    h('div', { class: 'play-dock-row' }, button({ label: t('parallel.done'), href: '#/' }), shareBtn),
    button({ label: t('common.again'), kind: 'primary', full: true, onClick: again }));
  // Doppeltipp auf „Prüfen“ (letzte Kette) träfe sonst gleich „Nochmal“ an derselben Stelle; Enter gilt sofort
  tapGuard(resultDock);

  app.replaceChildren();
  appendChildren(app, [
    h('div', { class: 'stage is-start' },
      h('header', { class: 'play-result-head' },
        h('p', { class: 'play-result-sub' }, `${t('parallel.title')} · ${t('common.levelN', { n: state.config.level })}`),
        title,
        h('p', { class: 'play-result-meta num' }, `${fmt(result.points)} ${t('common.points')}`)),
      resultSegments(result.chains.map((c) => c.correct)),
      newBest ? insight({
        icon: 'trophy', tone: 'good', title: t('parallel.newBest'), text: t('parallel.newBestText', { n: stats.bestChains }),
      }) : null,
      session.streak > 1
        ? h('p', { class: 'play-note' }, icon('flame', 18), h('span', null, t('parallel.streakRounds', { n: session.streak })))
        : null,
      group({ title: t('parallel.resultsTitle'), meta: t('parallel.nextRound', { n: stats.nextStart }) },
        list(result.chains.map(chainRow)))),
    resultDock,
  ]);
  setTitle(t('common.roundDone'));
  // Screenreader und Tastatur starten bei der Überschrift (das Ergebnis ersetzt die Eingabe vollständig)
  title.focus({ preventScroll: true });
  const unbind = bindResultKeys(again, () => go('#/'));
  const cancelReview = maybeAskForReview({ correct: result.correct, n: result.total, newBest });
  return () => { cancelReview(); unbind(); };
}
