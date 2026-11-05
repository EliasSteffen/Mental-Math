// Geführter Lernmodus (#/lernen/<id>/schritte) in drei Stufen:
// 1. Zeig's mir – ein Beispiel, Schritt für Schritt aufgedeckt (Tippen/Enter), Ziffern hervorgehoben, kleine Grafik.
// 2. Gemeinsam – neue Zahlen, man tippt jedes Zwischenergebnis; falsch → Tipp nur für diesen Schritt.
// 3. Allein – neue Aufgabe, Lösung auf Wunsch; richtig → Übungsrunde mit 5 Aufgaben.
// Aufgaben kommen aus festen Seeds je Stufe: Ein Neuzeichnen (Sprachwechsel) behält Zahlen, Stufe und Fortschritt.
// Versuche werden hier nicht gespeichert – das Lernen zählt nicht in Skill und Statistik.
import type { Level, Subtype, Task } from '../types.ts';
import { mulberry32 } from '../core/daily.ts';
import { generate } from '../core/generators/index.ts';
import { fmt } from '../core/numbers.ts';
import { evaluate, levelFor } from '../core/scoring.ts';
import { guidedSteps, stepCorrect } from '../core/solutions/guided.ts';
import type { ExprPart, GuidedStep, Visual } from '../core/solutions/guided.ts';
import { getAttempts, getSettings } from '../data/storage.ts';
import { addCleanup } from '../router.ts';
import { app, appendChildren, h } from '../ui/dom.ts';
import { haptic } from '../ui/fx.ts';
import { renderVisual } from '../ui/guide-visuals.ts';
import { backLink, button, card, feedbackHead, fold, group, largeTitle, setButtonLabel } from '../ui/kit.ts';
import { t } from '../i18n/index.ts';
import { parseNumber } from './play-ui.ts';

/** Aufgaben je Übungsrunde aus dem Lernbereich (mit Methoden-Intro). */
export const PRACTICE_N = 5;
export const practiceHref = (id: string): string => `#/train/${id}?n=${PRACTICE_N}&intro=1`;
export const guideHref = (id: string): string => `#/lernen/${id}/schritte`;

type Stage = 0 | 1 | 2;
const STAGES: readonly Stage[] = [0, 1, 2];
const STAGE_KEY = ['guide.stage.show', 'guide.stage.together', 'guide.stage.alone'] as const;
const INTRO_KEY = ['guide.intro.show', 'guide.intro.together', 'guide.intro.alone'] as const;

interface GuideState {
  id: string;
  stage: Stage;
  seeds: [number, number, number];
  /** Zeig's mir: aufgedeckte Schritte */
  shown: number;
  /** Gemeinsam: gelöste Eingabe-Schritte */
  solved: number;
}

let state: GuideState | null = null;

const newSeed = (): number => Math.floor(Math.random() * 0x100000000);

/** Frischer Start (Einstieg von der Detailseite); ein Neuzeichnen derselben Route behält den Stand. */
export function resetGuide(): void { state = null; }

function stateFor(id: string): GuideState {
  if (!state || state.id !== id) state = { id, stage: 0, seeds: [newSeed(), newSeed(), newSeed()], shown: 1, solved: 0 };
  return state;
}

interface Example { task: Task; steps: GuidedStep[] }

/** Aufgabe mit geführten Schritten aus einem Seed; `avoid` = Aufgabentext, der nicht noch einmal kommen soll. */
function exampleFor(id: string, seed: number, level: Level, avoid = ''): Example | null {
  for (let i = 0; i < 25; i++) {
    let task: Task;
    try {
      task = generate(id, mulberry32(seed + i * 7919), { level });
    } catch {
      return null;
    }
    if (task.prompt === avoid) continue;
    const steps = guidedSteps(task);
    if (steps.length) return { task, steps };
  }
  return null;
}

/* ---------- Bausteine ---------- */

function exprNodes(parts: readonly ExprPart[] | undefined): Array<Node | string> {
  return (parts ?? []).map((p) => (typeof p === 'string' ? p : h('mark', { class: 'guide-mark' }, p.mark)));
}

/** Zahl mit Einheit in der UI-Sprache („12,5 %“ / „12.5%“, „120 Mio.“). */
function withUnit(value: number, unit: string | undefined): string {
  if (!unit) return fmt(value);
  return unit === '%' ? t('sol.pct', { x: fmt(value) }) : `${fmt(value)} ${unit}`;
}

/** Rechnung eines Schritts mit Ergebnis („40 × 6 = 240“). */
function exprLine(step: GuidedStep, solved = false): HTMLElement | null {
  if (!step.expr?.length) return null;
  return h('p', { class: `guide-expr${solved ? ' is-solved' : ''}` },
    exprNodes(step.expr),
    step.expected !== undefined ? [' = ', h('strong', { class: 'guide-result' }, withUnit(step.expected, step.unit))] : null);
}

function stepItem(step: GuidedStep, solved = false): HTMLLIElement {
  return h('li', { class: 'guide-step' }, h('p', { class: 'guide-text' }, step.text), exprLine(step, solved));
}

/** Letzte Grafik bis einschließlich Schritt `upTo`. */
function visualUpTo(steps: readonly GuidedStep[], upTo: number): Visual | undefined {
  for (let i = Math.min(upTo, steps.length - 1); i >= 0; i--) {
    const v = steps[i]?.visual;
    if (v) return v;
  }
  return undefined;
}

function paintVisual(box: HTMLElement, v: Visual | undefined): void {
  const el = renderVisual(v);
  box.replaceChildren();
  if (el) box.append(el);
  box.hidden = !el;
}

function promptEl(task: Task): HTMLElement {
  // Kurze Rechnungen groß in Zahlenschrift, Textaufgaben (Veränderung in %) in Lesegröße
  return h('p', { class: `learn-prompt guide-prompt${task.prompt.length > 20 ? ' is-long' : ''}` }, task.prompt);
}

function answerField(label: string): HTMLInputElement {
  return h('input', {
    type: 'text', class: 'guide-input', inputmode: 'decimal', autocomplete: 'off', autocorrect: 'off',
    autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': label, placeholder: '?',
  });
}

const unitEl = (unit: string | undefined): HTMLElement | null => (unit ? h('span', { class: 'guide-unit' }, unit) : null);

/** Stufen-Leiste: 1 Zeig's mir · 2 Gemeinsam · 3 Allein (aria-current="step"). */
function stageNav(onPick: (s: Stage) => void): { el: HTMLElement; set(s: Stage): void } {
  const btns = STAGES.map((s) => h('button', { type: 'button', class: 'guide-stage-btn press', onclick: () => onPick(s) },
    h('span', { class: 'guide-stage-num', 'aria-hidden': 'true' }, String(s + 1)),
    h('span', { class: 'guide-stage-label' }, t(STAGE_KEY[s]))));
  const el = h('nav', { class: 'guide-stages', 'aria-label': t('guide.stagesLabel') }, h('ol', null, btns.map((b) => h('li', null, b))));
  return {
    el,
    set(s: Stage): void {
      btns.forEach((b, i) => {
        if (i === s) b.setAttribute('aria-current', 'step');
        else b.removeAttribute('aria-current');
        b.classList.toggle('is-done', i < s);
      });
    },
  };
}

/* ---------- Ansicht ---------- */

/** Zeichnet den geführten Modus; false (ohne etwas zu zeichnen), wenn sich keine passenden Aufgaben erzeugen lassen. */
export function renderGuide(sub: Subtype): boolean {
  const st = stateFor(sub.id);
  const lvl = levelFor(sub.id, getAttempts(), getSettings().difficulty);
  const show = exampleFor(sub.id, st.seeds[0], 1);
  const together = show ? exampleFor(sub.id, st.seeds[1], lvl === 1 ? 1 : 2, show.task.prompt) : null;
  let alone = together ? exampleFor(sub.id, st.seeds[2], lvl, together.task.prompt) : null;
  if (!show || !together || !alone) return false;

  const stageBox = h('div', { class: 'guide-stage' });
  const nav = stageNav((s) => go(s, true));
  appendChildren(app, [
    backLink({ label: sub.name, href: `#/lernen/${sub.id}`, ariaLabel: t('guide.back', { name: sub.name }) }),
    largeTitle(t('guide.title'), sub.name),
    nav.el,
    stageBox,
  ]);

  // Tastatur in „Zeig's mir“: Enter / Leertaste / Pfeil rechts deckt den nächsten Schritt auf (nicht in Feldern, Buttons, Links)
  let onKey: ((e: KeyboardEvent) => void) | null = null;
  const keydown = (e: KeyboardEvent): void => {
    const el = e.target instanceof Element ? e.target : null;
    if (!onKey || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (el?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
    onKey(e);
  };
  document.addEventListener('keydown', keydown);
  addCleanup(() => document.removeEventListener('keydown', keydown));

  function go(stage: Stage, focus: boolean): void {
    st.stage = stage;
    onKey = null;
    nav.set(stage);
    const ex = stage === 0 ? show : stage === 1 ? together : alone;
    const { body, first } = stage === 0 ? drawShow(ex as Example) : stage === 1 ? drawTogether(ex as Example) : drawAlone(ex as Example);
    stageBox.replaceChildren(group(t(STAGE_KEY[stage]), body));
    if (focus) {
      if (nav.el.getBoundingClientRect().top < 0) nav.el.scrollIntoView({ block: 'start' });
      first.focus();
    }
  }

  /* ----- 1. Zeig's mir ----- */
  function drawShow({ task, steps }: Example): { body: HTMLElement; first: HTMLElement } {
    let shown = Math.max(1, Math.min(st.shown, steps.length));
    const visual = h('div', { class: 'guide-visual' });
    const list = h('ol', { class: 'steps guide-steps', 'aria-live': 'polite' });
    const count = h('p', { class: 'guide-count' });
    const next = button({ label: t('guide.next'), kind: 'primary', full: true, onClick: () => advance() });
    const all = button({ label: t('guide.showAll'), kind: 'link', onClick: () => { shown = steps.length; paint(); next.focus(); } });
    const restart = button({ label: t('guide.restart'), kind: 'quiet', icon: 'undo', onClick: () => { shown = 1; paint(); next.focus(); } });

    function paint(): void {
      st.shown = shown;
      while (list.children.length > shown) list.lastElementChild?.remove();
      for (let i = list.children.length; i < shown; i++) list.append(stepItem(steps[i] as GuidedStep));
      Array.from(list.children).forEach((li, i) => li.classList.toggle('is-current', i === shown - 1));
      paintVisual(visual, visualUpTo(steps, shown - 1));
      count.textContent = t('guide.stepOf', { i: shown, n: steps.length });
      const done = shown >= steps.length;
      setButtonLabel(next, t(done ? 'guide.toTogether' : 'guide.next'));
      all.hidden = done;
      restart.hidden = !done;
    }
    function advance(): void {
      if (shown < steps.length) {
        shown++;
        paint();
      } else {
        go(1, true);
      }
    }
    onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault();
        advance();
      }
    };
    paint();
    const body = card([
      h('p', { class: 'guide-intro' }, t(INTRO_KEY[0])),
      promptEl(task), visual, list, count, next,
      h('div', { class: 'guide-actions' }, all, restart),
    ], { class: 'guide-card' });
    return { body, first: next };
  }

  /* ----- 2. Gemeinsam ----- */
  function drawTogether({ task, steps }: Example): { body: HTMLElement; first: HTMLElement } {
    const asked = steps.map((s, i) => (s.expected !== undefined ? i : -1)).filter((i) => i >= 0);
    let solved = Math.max(0, Math.min(st.solved, asked.length));
    const visual = h('div', { class: 'guide-visual' });
    const list = h('ol', { class: 'steps guide-steps' });
    const status = h('p', { class: 'guide-status', role: 'status' });
    const toAlone = button({ label: t('guide.toAlone'), kind: 'primary', full: true, onClick: () => go(2, true) });
    const doneBox = h('div', { class: 'guide-done' }, h('p', { class: 'guide-done-text' }, t('guide.togetherDone')), toAlone);

    /** Eingabe-Zeile für Schritt i; ruft onSolved, sobald der Wert stimmt (oder aufgedeckt wurde). */
    function askRow(step: GuidedStep, i: number, onSolved: (revealed: boolean) => void): { el: HTMLElement; input: HTMLInputElement } {
      const input = answerField(t('guide.inputLabel', { i: i + 1 }));
      const feedback = h('p', { class: 'guide-feedback', role: 'status' });
      let wrong = 0;
      const reveal = button({ label: t('guide.reveal'), kind: 'link', onClick: () => onSolved(true) });
      reveal.hidden = true;
      const submit = (): void => {
        const v = parseNumber(input.value);
        if (v === null) {
          feedback.textContent = t('guide.empty');
          feedback.classList.remove('is-bad');
          input.focus();
          return;
        }
        if (stepCorrect(step, v)) {
          haptic('success');
          onSolved(false);
          return;
        }
        wrong++;
        input.setAttribute('aria-invalid', 'true');
        feedback.textContent = t('guide.wrong', { hint: step.hint ?? step.text });
        feedback.classList.add('is-bad');
        if (wrong >= 2) reveal.hidden = false;
        input.select();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
      });
      input.addEventListener('input', () => input.removeAttribute('aria-invalid'));
      const check = button({ label: t('guide.check'), kind: 'soft', onClick: submit });
      const el = h('div', { class: 'guide-ask' },
        h('p', { class: 'guide-expr' }, exprNodes(step.expr), ' = ', h('span', { class: 'guide-field' }, input, unitEl(step.unit))),
        h('div', { class: 'guide-ask-actions' }, check, reveal),
        feedback);
      return { el, input };
    }

    /** Schritte bis zur nächsten offenen Frage aufbauen; liefert deren Eingabefeld (oder null, wenn alles gelöst ist). */
    function build(): HTMLInputElement | null {
      list.replaceChildren();
      const cur = asked[solved];
      const until = cur ?? steps.length - 1;
      for (let i = 0; i <= until; i++) {
        const step = steps[i] as GuidedStep;
        if (i !== cur) {
          list.append(stepItem(step, step.expected !== undefined));
          continue;
        }
        const li = h('li', { class: 'guide-step is-current' }, h('p', { class: 'guide-text' }, step.text));
        const row = askRow(step, i, (revealed) => {
          solved++;
          st.solved = solved;
          status.textContent = t(revealed ? 'guide.revealed' : 'guide.good');
          const nextInput = build();
          (nextInput ?? toAlone).focus();
        });
        li.append(row.el);
        list.append(li);
        paintVisual(visual, visualUpTo(steps, i - 1));
        doneBox.hidden = true;
        return row.input;
      }
      paintVisual(visual, visualUpTo(steps, steps.length - 1));
      doneBox.hidden = false;
      return null;
    }

    const firstInput = build();
    const body = card([
      h('p', { class: 'guide-intro' }, t(INTRO_KEY[1])),
      promptEl(task), visual, list, status, doneBox,
    ], { class: 'guide-card' });
    return { body, first: firstInput ?? toAlone };
  }

  /* ----- 3. Allein ----- */
  function drawAlone({ task, steps }: Example): { body: HTMLElement; first: HTMLElement } {
    const input = answerField(t('guide.answerLabel'));
    const feedback = h('p', { class: 'guide-feedback', role: 'status' });
    const success = h('div', { class: 'guide-success' });
    success.hidden = true;
    const answer = withUnit(task.expected, steps[steps.length - 1]?.unit ?? task.unit);

    const solutionVisual = h('div', { class: 'guide-visual' });
    paintVisual(solutionVisual, visualUpTo(steps, steps.length - 1));
    const solution = fold({
      label: t('guide.solution'),
      children: [h('ol', { class: 'steps guide-steps' }, steps.map((s) => stepItem(s))), solutionVisual],
    });

    const again = (): void => {
      st.seeds[2] = newSeed();
      alone = exampleFor(sub.id, st.seeds[2], lvl, task.prompt) ?? alone;
      go(2, true);
    };

    const check = button({ label: t('guide.check'), kind: 'primary', full: true, onClick: () => submit() });
    function submit(): void {
      const v = parseNumber(input.value);
      if (v === null) {
        feedback.textContent = t('guide.empty');
        feedback.classList.remove('is-bad');
        input.focus();
        return;
      }
      const r = evaluate(task, v, 0, { untimed: true });
      if (r.correct) {
        haptic('success');
        feedback.textContent = '';
        feedback.classList.remove('is-bad');
        input.readOnly = true;
        check.hidden = true;
        const practice = button({ label: t('guide.practice', { n: PRACTICE_N }), kind: 'primary', full: true, href: practiceHref(sub.id) });
        success.replaceChildren(
          feedbackHead({ tone: 'good', title: t('guide.aloneGood'), detail: `${task.prompt} = ${answer}`, live: true }),
          practice,
          button({ label: t('guide.newTask'), kind: 'outline', full: true, icon: 'refresh', onClick: again }),
        );
        success.hidden = false;
        practice.focus();
        return;
      }
      input.setAttribute('aria-invalid', 'true');
      feedback.classList.add('is-bad');
      feedback.textContent = t(r.errorType === 'nullen' ? 'guide.aloneNullen' : r.errorType === 'knapp' ? 'guide.aloneKnapp' : 'guide.aloneWrong');
      input.select();
    }
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    input.addEventListener('input', () => input.removeAttribute('aria-invalid'));

    const body = card([
      h('p', { class: 'guide-intro' }, t(INTRO_KEY[2])),
      promptEl(task),
      task.hint ? h('p', { class: 'learn-note' }, task.hint) : null,
      h('div', { class: 'guide-answer' }, input, unitEl(task.unit)),
      check, feedback, success, solution,
    ], { class: 'guide-card' });
    return { body, first: input };
  }

  go(st.stage, false);
  return true;
}
