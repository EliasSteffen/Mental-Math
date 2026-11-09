// Einstufungstest (#/einstufung): kurze Einführung, dann bis zu 10 Aufgaben im Fokus-Modus (Trainings-Ansicht mit
// dynamischer nächster Aufgabe), danach das Ergebnis mit den Startstufen je Bereich. Speichert theta in den
// Einstellungen (synchronisiert) und stellt die Schwierigkeit auf „Auto“. Logik: src/core/placement.ts.
import { setPlacement } from '../core/adaptive.ts';
import type { Step } from '../core/adaptive.ts';
import { LEVEL_NAMES, SUBTYPES } from '../core/catalog.ts';
import { MAX_ITEMS, placementState, probeTask, summary } from '../core/placement.ts';
import type { PlacementAnswer } from '../core/placement.ts';
import { getSettings, setSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { go } from '../router.ts';
import { app, h } from '../ui/dom.ts';
import { dock } from '../ui/dock.ts';
import { button, focusHead, group, insight, largeTitle, list, resultSegments, row, steps } from '../ui/kit.ts';
import { setTitle } from '../ui/title.ts';
import { renderTrain } from './train/index.ts';
import type { TrainResult } from './train/index.ts';

const answersOf = (results: readonly TrainResult[]): PlacementAnswer[] =>
  results.map((r) => ({ correct: r.ev.correct, timeMs: r.timeMs, targetMs: r.task.targetMs }));

/** Name einer Startstufe: Vorstufe heißt beim 1×1 „Einstieg“, sonst „Grundlagen“. */
function stepName(subtype: string, step: Step): string {
  if (step === 0) return t(subtype.startsWith('table.') ? 'placement.stepBasic' : 'placement.stepFoundation');
  return LEVEL_NAMES[step];
}

function showResult(results: readonly TrainResult[]): void {
  const theta = placementState(answersOf(results)).theta;
  const before = getSettings();
  setSettings({ placement: { theta, ts: Date.now() }, difficulty: 'auto' });
  setPlacement(theta);
  const switched = before.difficulty !== 'auto';

  const title = h('h1', { class: 'train-result-title', tabindex: '-1' }, t(`placement.theta${theta}`));
  app.replaceChildren(
    h('div', { class: 'stage is-start train-result' },
      h('header', { class: 'train-result-head' },
        h('p', { class: 'train-result-sub' }, t('placement.resultSub')),
        title,
        h('p', { class: 'train-result-avg' }, t('placement.correctOf', { correct: results.filter((r) => r.ev.correct).length, n: results.length }))),
      results.length ? resultSegments(results.map((r) => r.ev.correct)) : null,
      insight({ icon: 'target', tone: 'accent', title: t('placement.whatNow'), text: t(`placement.text${theta}`) }),
      group({ title: t('placement.startLevels'), meta: t('placement.startLevelsMeta') }, list(summary(theta).map(({ subtype, step }) =>
        row({ label: SUBTYPES[subtype]?.name ?? subtype, value: stepName(subtype, step) })))),
      switched ? h('p', { class: 'compete-foot' }, t('placement.switchedAuto')) : null,
      h('p', { class: 'compete-foot' }, t('placement.foot'))),
    dock(
      h('div', { class: 'train-result-actions' }, button({ label: t('placement.again'), kind: 'quiet', onClick: () => renderPlacement() })),
      button({ label: t('placement.letsGo'), kind: 'primary', full: true, href: '#/' })));
  setTitle(t('placement.title'));
  window.scrollTo(0, 0);
  title.focus({ preventScroll: true });
}

function startTest(): void {
  renderTrain('placement', {
    placement: {
      max: MAX_ITEMS,
      next: (results) => {
        const st = placementState(answersOf(results));
        return st.next ? probeTask(st.next.rung, st.next.probe) : null;
      },
      onDone: showResult,
    },
  });
}

export function renderPlacement(): void {
  setTitle(t('placement.title'));
  const start = button({ label: t('placement.start'), meta: t('placement.minutes'), kind: 'primary', full: true, icon: 'play', onClick: startTest });
  const done = getSettings().placement;
  app.replaceChildren(
    focusHead({ closeLabel: t('placement.close'), onClose: () => go('#/') }),
    h('div', { class: 'stage is-start train-intro' },
      largeTitle(t('placement.title'), done ? t('placement.lastResult', { name: t(`placement.theta${done.theta}`) }) : t('placement.subtitle')),
      h('p', { class: 'compete-text' }, t('placement.intro')),
      steps([t('placement.rule1'), t('placement.rule2'), t('placement.rule3')])),
    dock(start));
  start.focus({ preventScroll: true });
}
