import type { ChainTask, Level } from '../types.ts';
import { chainTask, chainStepLabel } from '../core/chain.ts';
import { fmt } from '../core/numbers.ts';
import { getChainBest, setChainBest, getSettings } from '../data/storage.ts';
import { createKeypad, useKeypad } from '../ui/keypad.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { setCleanup, addCleanup, go } from '../router.ts';
import { createFabBar, type FabBar } from '../ui/fab.ts';
import { skeleton, deferRender } from '../ui/skeleton.ts';
import { bindResultKeys } from '../ui/modal.ts';
import { t } from '../i18n/index.ts';

type TKey = 'chain.tempo1' | 'chain.tempo2' | 'chain.tempo3';
const TEMPOS: ReadonlyArray<readonly [number, TKey]> = [[800, 'chain.tempo1'], [1200, 'chain.tempo2'], [1800, 'chain.tempo3']];
const LEVELS: readonly Level[] = [1, 2, 3];

function segmented<V extends string | number>(
  label: string, options: ReadonlyArray<readonly [V, string]>, current: V, onPick: (v: V) => void,
): HTMLDivElement {
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    const active = value === current;
    seg.append(h('button', {
      type: 'button', class: active ? 'active' : null, 'aria-pressed': String(active), onclick: () => onPick(value),
    }, text));
  }
  return seg;
}

function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/[−–]/g, '-').replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function renderChain(): void {
  let level: Level = 1;
  let tempo = 1200;
  let streak = 0;
  let timer: number | null = null;
  let keypadEl: HTMLElement | null = null;
  let fab: FabBar | null = null;

  const stop = (): void => {
    if (fab) { fab.destroy(); fab = null; }
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (keypadEl) { keypadEl.remove(); keypadEl = null; }
    document.body.classList.remove('has-keypad');
  };
  setCleanup(stop);

  const screen = (...children: Array<Node | null>): void => {
    stop();
    app.replaceChildren();
    appendChildren(app, [h('div', { class: 'chain' }, ...children)]);
  };

  function setup(): void {
    const best = getChainBest()[level];
    screen(
      h('a', { class: 'back-link', href: '#/' }, t('common.backLink')),
      h('h1', { class: 'page-title' }, t('chain.title')),
      h('p', { class: 'muted' }, t('chain.intro')),
      h('div', { class: 'stack' },
        h('div', { class: 'label' }, t('common.level')),
        segmented<Level>(t('common.level'), LEVELS.map((l) => [l, t('common.levelN', { n: l })] as const), level, (v) => { level = v; setup(); }),
        h('div', { class: 'label' }, t('chain.tempoPerStep')),
        segmented<number>(t('chain.tempo'), TEMPOS.map(([ms, k]) => [ms, t(k)] as const), tempo, (v) => { tempo = v; setup(); })),
      h('p', { class: 'small muted' }, best ? t('chain.best', { level, n: best }) : t('chain.noBest', { level })),
      h('button', { type: 'button', class: 'btn primary', onclick: () => start() }, t('common.start')));
  }

  function start(): void {
    const task = chainTask(level);
    const labels = [fmt(task.start), ...task.steps.map((s) => chainStepLabel(s))];
    const total = labels.length;
    const stage = h('div', { class: 'chain-stage', 'aria-live': 'polite' });
    const count = h('div', { class: 'chain-count' });
    screen(h('a', { class: 'back-link', href: '#/chain' }, t('common.cancelLink')), stage, count);
    let i = 0;
    const tick = (): void => {
      if (i >= total) { ask(task); return; }
      stage.replaceChildren(h('div', { class: 'chain-step' }, labels[i] ?? ''));
      count.textContent = `${i + 1} / ${total}`;
      i += 1;
      timer = window.setTimeout(tick, tempo);
    };
    tick();
  }

  function ask(task: ChainTask): void {
    const input: HTMLInputElement = h('input', {
      type: 'text', inputmode: 'none', autocomplete: 'off', 'aria-label': t('chain.resultAria'), placeholder: '?',
    });
    const submit = (): void => {
      const given = parseNumber(input.value);
      if (given === null) return;
      reveal(task, given);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const kp = useKeypad(getSettings().keypad);
    screen(
      h('div', { class: 'chain-stage' },
        h('div', { class: 'label' }, t('chain.resultQ')),
        h('div', { class: 'answer' }, input)));
    if (kp) {
      input.readOnly = true;
      keypadEl = createKeypad({ input, onSubmit: submit, onSkip: () => reveal(task, null), haptics: getSettings().haptics });
      document.body.append(keypadEl);
      document.body.classList.add('has-keypad');
    } else {
      input.inputMode = 'decimal';
      input.removeAttribute('readonly');
      app.querySelector('.chain')?.append(h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: submit }, t('common.check')),
        h('button', { type: 'button', class: 'btn', onclick: () => reveal(task, null) }, t('common.dontKnow'))));
      input.focus();
    }
  }

  function reveal(task: ChainTask, given: number | null): void {
    const ok = given !== null && Math.abs(given - task.result) < 1e-9;
    streak = ok ? streak + 1 : 0;
    const prev = getChainBest()[level] ?? 0;
    const newBest = ok && streak > prev;
    if (newBest) setChainBest(level, streak);
    const steps = h('ul', { class: 'chain-steps' },
      h('li', null, fmt(task.start)),
      ...task.steps.map((s) => h('li', null, chainStepLabel(s))));
    screen(
      h('div', { class: 'chain-stage' },
        h('div', { class: 'label' }, ok ? t('common.correct') : given === null ? t('common.skipped') : t('chain.wrongFinal')),
        steps,
        h('div', { class: `chain-result ${ok ? 'good' : 'bad'}` }, `= ${fmt(task.result)}`),
        given !== null && !ok ? h('div', { class: 'sub' }, t('chain.yourAnswer', { n: fmt(given) })) : null,
        h('div', { class: 'chain-count' },
          `${t('chain.streakLine', { streak, best: Math.max(prev, streak) })}${newBest ? t('chain.newRecordSuffix') : ''}`)),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => setup() }, t('chain.settings'))));
    const bar = createFabBar([
      { label: t('common.again'), primary: true, onClick: () => start() },
      { label: t('common.overview'), onClick: () => go('#/') },
    ]);
    fab = bar;
    addCleanup(bar.destroy);
    addCleanup(bindResultKeys(() => start(), () => go('#/')));
  }

  const sk = skeleton('text', 3);
  app.append(sk);
  deferRender(sk, () => { setup(); return document.createDocumentFragment(); });
}
