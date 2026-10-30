import type { ChainTask, Level } from '../types.ts';
import { chainTask, chainStepLabel } from '../core/chain.ts';
import { fmt } from '../core/numbers.ts';
import { getChainBest, setChainBest, getSettings } from '../data/storage.ts';
import { createKeypad, useKeypad } from '../ui/keypad.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { setCleanup, addCleanup, go } from '../router.ts';
import { createFabBar, type FabBar } from '../ui/fab.ts';

const TEMPOS: ReadonlyArray<readonly [number, string]> = [[800, '0,8 s'], [1200, '1,2 s'], [1800, '1,8 s']];
const LEVELS: ReadonlyArray<readonly [Level, string]> = [[1, 'Level 1'], [2, 'Level 2'], [3, 'Level 3']];

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
  const t = raw.trim().replace(/[−–]/g, '-').replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
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
      h('a', { class: 'back-link', href: '#/' }, '← Zurück'),
      h('h1', { class: 'page-title' }, 'Kettenrechnen'),
      h('p', { class: 'muted' }, 'Merke dir die Zahl und rechne jeden Schritt im Kopf mit. Am Ende nennst du das Ergebnis.'),
      h('div', { class: 'stack' },
        h('div', { class: 'label' }, 'Level'),
        segmented<Level>('Level', LEVELS, level, (v) => { level = v; setup(); }),
        h('div', { class: 'label' }, 'Tempo pro Schritt'),
        segmented<number>('Tempo', TEMPOS, tempo, (v) => { tempo = v; setup(); })),
      h('p', { class: 'small muted' }, best ? `Bestwert Level ${level}: ${best} in Folge` : `Noch kein Bestwert für Level ${level}`),
      h('button', { type: 'button', class: 'btn primary', onclick: () => start() }, 'Start'));
  }

  function start(): void {
    const task = chainTask(level);
    const labels = [fmt(task.start), ...task.steps.map((s) => chainStepLabel(s))];
    const total = labels.length;
    const stage = h('div', { class: 'chain-stage', 'aria-live': 'polite' });
    const count = h('div', { class: 'chain-count' });
    screen(h('a', { class: 'back-link', href: '#/chain' }, '← Abbrechen'), stage, count);
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
      type: 'text', inputmode: 'none', autocomplete: 'off', 'aria-label': 'Ergebnis', placeholder: '?',
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
        h('div', { class: 'label' }, 'Ergebnis?'),
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
        h('button', { type: 'button', class: 'btn primary', onclick: submit }, 'Prüfen'),
        h('button', { type: 'button', class: 'btn', onclick: () => reveal(task, null) }, 'Weiß nicht')));
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
        h('div', { class: 'label' }, ok ? 'Richtig' : given === null ? 'Übersprungen' : 'Leider falsch'),
        steps,
        h('div', { class: `chain-result ${ok ? 'good' : 'bad'}` }, `= ${fmt(task.result)}`),
        given !== null && !ok ? h('div', { class: 'sub' }, `Deine Antwort: ${fmt(given)}`) : null,
        h('div', { class: 'chain-count' },
          `Serie ${streak} · Bestwert ${Math.max(prev, streak)}${newBest ? ' – neuer Rekord!' : ''}`)),
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn', onclick: () => setup() }, 'Einstellungen')));
    const bar = createFabBar([
      { label: 'Nochmal', primary: true, onClick: () => start() },
      { label: 'Übersicht', onClick: () => go('#/') },
    ]);
    fab = bar;
    addCleanup(bar.destroy);
  }

  setup();
}
