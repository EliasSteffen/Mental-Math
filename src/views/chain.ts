// Kettenrechnen (Fokus-Modus): Einstellungen → Schritte nacheinander → Ergebnis eingeben → Rückmeldung im Sheet.
// Ablauf und Wertung wie bisher; die Darstellung folgt dem Training (Kopf, Bühne, Dock, Inline-Sheet).
import type { ChainTask, Level } from '../types.ts';
import { chainTask, chainStepLabel } from '../core/chain.ts';
import { applyOp } from '../core/parallel.ts';
import { fmt } from '../core/numbers.ts';
import { getChainBest, setChainBest } from '../data/storage.ts';
import { app, h, appendChildren, type Child } from '../ui/dom.ts';
import { setCleanup, go } from '../router.ts';
import { bindResultKeys } from '../ui/modal.ts';
import { button, feedbackHead, focusHead, fold, icon, insight, list, segmented, segments, steps } from '../ui/kit.ts';
import { inlineSheet } from '../ui/sheet.ts';
import { tapGuard } from '../ui/dock.ts';
import { answerFx } from '../ui/fx.ts';
import { answerDock, answerInput, parseNumber, playDock } from './play-ui.ts';
import { t } from '../i18n/index.ts';

type LevelKey = `${Level}`;
type Tempo = '800' | '1200' | '1800';
const LEVELS: readonly LevelKey[] = ['1', '2', '3'];
const TEMPOS: ReadonlyArray<readonly [Tempo, 'chain.tempo1' | 'chain.tempo2' | 'chain.tempo3']> = [
  ['800', 'chain.tempo1'], ['1200', 'chain.tempo2'], ['1800', 'chain.tempo3'],
];

/** Lösungsweg: je Schritt „12 + 7 = 19“ mit den Zwischenergebnissen. */
function solution(task: ChainTask): string[] {
  const out: string[] = [];
  let cur = task.start;
  for (const s of task.steps) {
    const next = applyOp(cur, s.op, s.value);
    out.push(`${fmt(cur)} ${s.op} ${fmt(s.value)} = ${fmt(next)}`);
    cur = next;
  }
  return out;
}

export function renderChain(): void {
  let level: Level = 1;
  let tempo: Tempo = '1200';
  let streak = 0;
  let timer: number | null = null;
  let unbindKeys: (() => void) | null = null;

  const stop = (): void => {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (unbindKeys) { const fn = unbindKeys; unbindKeys = null; fn(); }
  };
  setCleanup(stop);

  // Feste Live-Region als erstes Kind von #app, solange die View steht (screen() ersetzt nur den Rest): Eine Region,
  // die erst mit ihrem Inhalt entsteht (wie das neu gebaute Sheet), sagen Screenreader oft nicht an.
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  app.append(live);

  /** Nächster Zustand: Timer und Tastenkürzel des vorigen abmelden, Inhalt von #app (bis auf live) ersetzen, oben beginnen. */
  const screen = (...children: Child[]): void => {
    stop();
    live.textContent = '';
    for (const node of Array.from(app.childNodes)) if (node !== live) node.remove();
    if (live.parentNode !== app) app.prepend(live);
    appendChildren(app, children);
    window.scrollTo(0, 0);
  };

  const head = (): HTMLElement => focusHead({ title: t('chain.title') });

  function setup(): void {
    const note = h('p', { class: 'play-note' });
    const paintBest = (): void => {
      const best = getChainBest()[level];
      note.replaceChildren(icon('trophy', 18),
        h('span', null, best ? t('chain.best', { level, n: best }) : t('chain.noBest', { level })));
    };
    paintBest();
    screen(
      head(),
      h('div', { class: 'stage is-start' },
        h('p', { class: 'play-intro' }, t('chain.intro')),
        list([
          segmented<LevelKey>({
            label: t('common.level'), options: LEVELS.map((l) => [l, t('common.levelN', { n: l })] as const),
            value: String(level) as LevelKey, onChange: (v) => { level = Number(v) as Level; paintBest(); },
          }).el,
          segmented<Tempo>({
            label: t('chain.tempoPerStep'), options: TEMPOS.map(([v, k]) => [v, t(k)] as const),
            value: tempo, onChange: (v) => { tempo = v; },
          }).el,
        ]),
        note),
      playDock(button({ label: t('common.start'), kind: 'primary', full: true, onClick: () => start() })));
  }

  function start(): void {
    const task = chainTask(level);
    const labels = [fmt(task.start), ...task.steps.map((s) => chainStepLabel(s))];
    const total = labels.length;
    const progress = segments({ total, done: 0, current: true });
    const header = head();
    header.append(progress.el);
    const caption = h('p', { class: 'play-caption' });
    const value = h('p', { class: 'play-step num' });
    screen(header, h('div', { class: 'stage', 'aria-live': 'polite' }, caption, value));
    let i = 0;
    const tick = (): void => {
      if (i >= total) { ask(task); return; }
      caption.textContent = i === 0 ? t('chain.startLabel') : t('chain.stepOf', { n: i, total: total - 1 });
      // Neues Element je Schritt: blendet ruhig ein, auch wenn zwei Schritte gleich lauten
      value.replaceChildren(h('span', { class: 'rise' }, labels[i] ?? ''));
      progress.set(i, true);
      i += 1;
      timer = window.setTimeout(tick, Number(tempo));
    };
    tick();
  }

  function ask(task: ChainTask): void {
    const input = answerInput(t('chain.resultAria'));
    const answer = answerDock({
      input,
      submitLabel: t('common.check'),
      onSubmit: () => {
        const given = parseNumber(input.value);
        if (given !== null) reveal(task, given);
      },
      onSkip: () => reveal(task, null),
    });
    screen(
      head(),
      h('div', { class: 'stage' }, h('p', { class: 'play-caption' }, t('chain.resultQ')), input),
      answer.el);
    // Fokus ins Feld: Tastatur tippt direkt, mit Tastenfeld (inputmode="none") erscheint keine Bildschirmtastatur
    input.focus();
  }

  function reveal(task: ChainTask, given: number | null): void {
    const ok = given !== null && Math.abs(given - task.result) < 1e-9;
    streak = ok ? streak + 1 : 0;
    const prev = getChainBest()[level] ?? 0;
    const newBest = ok && streak > prev;
    if (newBest) setChainBest(level, streak);
    answerFx(ok);

    const state = ok ? 'good' : given === null ? 'skip' : 'bad';
    const result = fmt(task.result);
    const title = ok ? t('common.correct') : given === null ? t('chain.fbSkip') : t('chain.fbWrong', { n: result });
    const detail = ok
      ? t('chain.streakLine', { streak, best: Math.max(prev, streak) })
      : given === null ? t('chain.fbSkipDetail', { n: result }) : t('chain.yourAnswer', { n: fmt(given) });

    const stage = h('div', { class: 'stage' },
      h('p', { class: 'play-caption' }, t('chain.resultQ')),
      h('output', { class: `play-answer num is-${state}` },
        ok ? h('span', { class: 'play-answer-check draw' }, icon('check', 26)) : null,
        h('span', null, given === null ? '–' : fmt(given))),
      ok ? null : h('p', { class: 'play-correction rise' },
        h('span', { class: 'play-correction-label' }, t('chain.correctIs')),
        h('span', { class: 'play-correction-num num' }, result)));

    const again = button({ label: t('common.again'), kind: 'primary', full: true, onClick: () => start() });
    const sheet = inlineSheet({
      label: t('chain.feedback'),
      children: [
        feedbackHead({ tone: state, title, detail }),
        newBest ? insight({
          icon: 'trophy', tone: 'good', title: t('chain.newBest'), text: t('chain.newBestText', { n: streak, level }), outline: true,
        }) : null,
        // Lösungsweg nach falscher/übersprungener Antwort offen, nach richtiger zugeklappt (E16)
        fold({ label: t('chain.solution'), open: !ok, children: [steps(solution(task))] }),
        h('div', { class: 'play-dock-row' },
          button({ label: t('chain.settings'), icon: 'gear', onClick: () => setup() }),
          button({ label: t('chain.done'), href: '#/' })),
        again,
      ],
    });
    // Doppeltipp auf „Prüfen“ träfe sonst gleich „Nochmal“ an derselben Stelle; Enter gilt sofort
    tapGuard(sheet);
    screen(head(), stage, sheet);
    // Erst nach dem Neuaufbau setzen: die Region steht schon (leer) im DOM, die Änderung wird angesagt
    live.textContent = [title, detail, newBest ? t('chain.newBest') : ''].filter(Boolean).join('. ');
    // Wie im Training: Fokus auf die Primäraktion (Enter = Nochmal, Esc = Fertig); ist die Seite höher als
    // der Bildschirm, ans Ende scrollen, damit das Sheet nichts von der Bühne verdeckt
    again.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      const doc = document.documentElement;
      if (doc.scrollHeight > window.innerHeight + 1) window.scrollTo(0, doc.scrollHeight);
    });
    unbindKeys = bindResultKeys(() => start(), () => go('#/'));
  }

  setup();
}
