import { fmt, fmtSeconds, parseAnswer, unitFactor } from '../numbers.js';
import { SUBTYPES, LEVEL_NAMES, generate, generateForMode } from '../generators.js';
import { evaluate, categoryStats, subtypeStats, overall, weaknesses, levelFor } from '../scoring.js';
import { getMethod } from '../methods.js';
import { aiExplainTask, isAiAvailable } from '../ai.js';
import { getAttempts, getSettings, addAttempt, addSession, getReviews, setReviews } from '../storage.js';
import { recordResult, dueReviews } from '../review.js';
import { icon } from '../charts.js';
import { feedbackFx } from '../fx.js';
import {
  app, h, appendChildren, level, tile, modeName, safeSteps, stepsList, fold,
  methodBlock, aiControl, go, setCleanup,
} from '../ui.js';

export function renderTrain(mode, { n: nOverride = null, intro = false } = {}) {
  const settings = getSettings();
  const sessionLength = nOverride || settings.sessionLength || 10;
  const timed = settings.timer !== false;
  const sessionId = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const startedAt = Date.now();

  let weakSubtypes = [];
  let notice = null;
  let genMode = mode;
  if (mode === 'weak') {
    weakSubtypes = weaknesses(getAttempts()).map((w) => w.subtype);
    if (weakSubtypes.length === 0) {
      genMode = 'all';
      notice = 'Noch zu wenig Daten – gemischtes Training';
    }
  }

  let reviewSubtypes = [];
  if (mode === 'review') {
    reviewSubtypes = dueReviews(getReviews(), Date.now()).map((r) => r.subtype);
    if (reviewSubtypes.length === 0) {
      genMode = 'all';
      notice = 'Keine Wiederholungen fällig – gemischtes Training';
    }
  }

  const results = []; // { task, given, ev, timeMs }
  let points = 0;
  let index = 0;
  let timerId = null;
  let onKey = null;

  const stop = () => {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
  };
  setCleanup(stop);

  const root = h('div', { class: 'train play' });
  app.append(root);

  function header() {
    return [
      h('div', { class: 'train-head' },
        h('a', { class: 'back-link', href: '#/' }, `← ${modeName(mode)}`),
        h('span', { class: 'muted' }, `${index + 1} / ${sessionLength} · ${points} Pkt`)),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(sessionLength), 'aria-valuenow': String(index) },
        (() => { const s = h('span'); s.style.setProperty('--w', String((index / sessionLength) * 100)); return s; })()),
    ];
  }

  function showTask() {
    stop();
    const task = generateForMode(genMode, {
      weakSubtypes, reviewSubtypes,
      levelFor: (id) => levelFor(id, getAttempts(), settings.difficulty),
    });
    const sub = SUBTYPES[task.subtype];
    const method = getMethod(task.subtype);
    const t0 = performance.now();
    let answered = false;
    let assisted = false;
    const question = h('div', { class: `question${task.prompt.length > 22 ? ' long' : ''}` }, task.prompt);

    const input = h('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
      'aria-label': 'Antwort', spellcheck: 'false', autocapitalize: 'off',
    });
    const timer = timed ? h('div', { class: 'timer' }, '') : null;
    const fill = h('span', { class: 'timerbar-fill' });
    const timerbar = timed ? h('div', { class: 'timerbar', 'aria-hidden': 'true' }, fill) : null;
    const actions = h('div', { class: 'actions', 'aria-live': 'polite' });

    const updateTimer = () => {
      const el = performance.now() - t0;
      timer.textContent = `${fmtSeconds(el)} · Ziel ${fmtSeconds(task.targetMs)}`;
      fill.style.setProperty('--w', String(Math.min(100, (el / task.targetMs) * 100)));
    };
    if (timed) {
      updateTimer();
      timerId = setInterval(updateTimer, 100);
    }

    function finish(given) {
      if (answered) return;
      answered = true;
      const timeMs = Math.round(performance.now() - t0);
      stop();
      if (timed) timer.textContent = `${fmtSeconds(timeMs)} · Ziel ${fmtSeconds(task.targetMs)}`;
      input.disabled = true;
      helpWrap.remove();
      const ev = evaluate(task, given, timeMs, { assisted, untimed: !timed });
      points += ev.points;
      results.push({ task, given, ev, timeMs });
      addAttempt({
        ts: Date.now(), sessionId, mode, category: task.category, subtype: task.subtype,
        prompt: task.prompt, unit: task.unit, expected: task.expected, given,
        correct: ev.correct, errorType: ev.errorType, timeMs, targetMs: task.targetMs,
        weight: task.weight, points: ev.points, params: task.params, assisted,
        level: task.level, untimed: !timed, isReview: mode === 'review',
      });
      setReviews(recordResult(getReviews(), {
        subtype: task.subtype, correct: ev.correct, ts: Date.now(), isReview: mode === 'review',
      }));
      feedbackFx(ev.correct);
      question.classList.add(ev.correct ? 'anim-pop' : 'anim-shake');
      showFeedback(ev, timeMs, given);
    }

    function next() {
      index += 1;
      if (index >= sessionLength) showResult();
      else showTask();
    }

    function showFeedback(ev, timeMs, given) {
      const labels = { nullen: 'Nullen-Fehler', knapp: 'Knapp daneben', falsch: 'Falsch', skip: 'Übersprungen' };
      const fb = h('div', { class: `feedback ${ev.correct ? 'good anim-pop' : 'bad anim-shake'}` });
      const uF = unitFactor(task.unit);
      const fullText = uF > 1
        ? ` (= ${fmt(Number((task.expected * uF).toPrecision(12)))}${task.unit.includes('€') ? ' €' : ''})`
        : '';
      const answerText = `${fmt(task.expected)}${task.unit ? ' ' + task.unit : ''}${fullText}`;
      const assistNote = assisted ? h('div', { class: 'fb-tip' }, 'Hilfe genutzt – halbe Punkte') : null;
      if (ev.correct) {
        appendChildren(fb, [
          h('div', { class: 'fb-title' }, `✓ Richtig`),
          h('div', { class: 'fb-detail' }, `${fmtSeconds(timeMs)} · +${ev.points} Pkt`),
          assistNote]);
      } else {
        appendChildren(fb, [
          h('div', { class: 'fb-title' }, `✗ ${labels[ev.errorType] || 'Falsch'}`),
          h('div', { class: 'fb-detail' }, `Richtig: ${answerText}`),
          h('div', { class: 'fb-detail' }, `${fmtSeconds(timeMs)} · ${ev.points > 0 ? '+' : ''}${ev.points} Pkt`),
          assistNote]);
      }
      const steps = safeSteps(task);
      const solution = steps.length
        ? (ev.correct
          ? fold('Lösungsweg ansehen', stepsList(steps))
          : h('section', { class: 'fb-section' }, h('h3', { class: 'fb-heading' }, 'Lösungsweg'), stepsList(steps)))
        : null;
      const methodFold = method
        ? fold('So löst du diesen Typ', methodBlock(method, { pitfalls: true, link: `#/lernen/${task.subtype}` }))
        : null;
      const ai = isAiAvailable() ? aiControl('KI-Erklärung', () => aiExplainTask(task, given)) : null;
      const nextBtn = h('button', { type: 'button', class: 'btn primary', onclick: next },
        index + 1 >= sessionLength ? 'Ergebnis ↵' : 'Weiter ↵');
      actions.replaceChildren(...[fb, solution, methodFold, ai, nextBtn].filter(Boolean));
      nextBtn.focus();
    }

    const signBtn = h('button', {
      type: 'button', class: 'sign-toggle', 'aria-label': 'Vorzeichen wechseln',
      onmousedown: (e) => e.preventDefault(),
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => {
        const v = input.value.replace(/^\s+/, '');
        input.value = /^[-−–]/.test(v) ? v.replace(/^[-−–]\s*/, '') : `-${v}`;
        input.focus();
        const end = input.value.length;
        try { input.setSelectionRange(end, end); } catch { /* ignore */ }
      },
    }, icon('plus-minus', { size: 20 }));
    const inputError = h('div', { class: 'hint', role: 'alert' });
    const check = h('button', {
      type: 'button', class: 'btn primary',
      onclick: () => {
        const v = parseAnswer(input.value);
        if (input.value.trim() === '') { input.focus(); return; }
        if (v === null) {
          inputError.textContent = 'Bitte nur die Zahl eingeben, z. B. 2,4 – ohne „min“, „Jahre“ o. Ä.';
          input.focus();
          input.select();
          return;
        }
        finish(v);
      },
    }, 'Prüfen ↵');
    const skip = h('button', { type: 'button', class: 'btn', onclick: () => finish(null) }, 'Weiß nicht');
    actions.append(inputError, h('div', { class: 'btn-row' }, check, skip));

    const helpBox = h('div', { class: 'help', hidden: true });
    const helpBtn = method
      ? h('button', {
        type: 'button', class: 'linkbtn', 'aria-expanded': 'false',
        onclick: () => {
          if (answered) return;
          const opening = helpBox.hidden;
          if (opening && !assisted) {
            assisted = true;
            helpBox.replaceChildren(
              h('p', { class: 'small muted' }, 'Hilfe genutzt – halbe Punkte'),
              methodBlock(method));
          }
          helpBox.hidden = !opening;
          helpBtn.setAttribute('aria-expanded', String(opening));
          input.focus();
        },
      }, 'Wie geht das?')
      : null;
    const helpWrap = h('div', { class: 'help-wrap' }, helpBtn, helpBox);

    onKey = (e) => {
      if (e.key === 'Enter') {
        const t = e.target;
        if (t instanceof Element && (t.closest('button, a, summary, .ai-box'))) return;
        e.preventDefault();
        if (answered) next();
        else check.click();
      } else if (e.key === 'Escape' && !answered) {
        e.preventDefault();
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey);

    root.replaceChildren();
    appendChildren(root, [
      ...header(),
      timerbar,
      notice ? h('p', { class: 'notice' }, notice) : null,
      h('div', { class: 'task' },
        h('div', { class: 'task-type' }, sub ? sub.name : task.subtype,
          h('span', { class: 'chip' }, LEVEL_NAMES[task.level] || LEVEL_NAMES[2])),
        question,
        h('div', { class: 'hint' }, task.hint || (unitFactor(task.unit) > 1 ? `in ${task.unit} oder als volle Zahl` : '')),
        h('div', { class: 'answer' }, signBtn, input, task.unit ? h('span', { class: 'unit' }, task.unit) : null),
        helpWrap,
        actions,
        timer)]);
    input.focus();
  }

  function showResult() {
    stop();
    const n = results.length;
    const correct = results.filter((r) => r.ev.correct).length;
    const avg = n ? results.reduce((s, r) => s + r.timeMs, 0) / n : 0;
    const all = getAttempts();
    const sk = SUBTYPES[mode]
      ? (subtypeStats(all)[mode] || {}).score
      : mode !== 'all' && mode !== 'weak' ? (categoryStats(all)[mode] || {}).score : overall(all).score;

    addSession({ id: sessionId, ts: startedAt, mode, n, correct, points, avgTimeMs: Math.round(avg) });

    const list = h('ul', { class: 'list' });
    for (const r of results) {
      const ok = r.ev.correct;
      const unit = r.task.unit ? ` ${r.task.unit}` : '';
      const mid = ok
        ? `${fmt(r.task.expected)}${unit}`
        : `${r.given === null ? '–' : fmt(r.given)} → ${fmt(r.task.expected)}${unit}`;
      list.append(h('li', null,
        h('span', { class: `mark ${ok ? 'good' : 'bad'}`, 'aria-label': ok ? 'richtig' : 'falsch' }, ok ? '✓' : '✗'),
        h('span', { class: 'item-main' }, r.task.prompt),
        h('span', { class: 'item-meta' }, `${fmtSeconds(r.timeMs)} · ${r.ev.points > 0 ? '+' : ''}${r.ev.points}`),
        h('span', { class: 'item-sub' }, mid),
        (() => {
          const steps = safeSteps(r.task);
          return steps.length ? h('div', { class: 'item-steps' }, fold('Lösungsweg', stepsList(steps), { open: !ok })) : null;
        })()));
    }

    root.replaceChildren(
      h('h1', { class: 'page-title' }, `Ergebnis · ${modeName(mode)}`),
      h('div', { class: 'stats' },
        tile(String(points), 'Punkte'),
        tile(`${correct}/${n}`, 'richtig'),
        tile(fmtSeconds(avg), 'Ø Zeit'),
        tile(sk === null || sk === undefined ? '–' : String(sk), 'Skill', level(sk))),
      list,
      h('div', { class: 'btn-row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => go(`#/train/${mode}`) }, 'Nochmal'),
        h('a', { class: 'btn', href: '#/analyse' }, 'Analyse'),
        h('a', { class: 'btn', href: '#/' }, 'Übersicht')));
    const first = root.querySelector('.btn.primary');
    if (first) first.focus();
  }

  function showIntro() {
    const subId = SUBTYPES[mode] ? mode : null;
    const method = subId ? getMethod(subId) : null;
    if (!subId || !method) { showTask(); return; }
    const ex = generate(subId, Math.random, { level: levelFor(subId, getAttempts(), settings.difficulty) });
    const steps = safeSteps(ex);
    const go = h('button', { type: 'button', class: 'btn primary', onclick: () => showTask() }, "Los geht's");
    const onIntroKey = (e) => {
      if (e.key !== 'Enter') return;
      const t = e.target;
      if (t instanceof Element && t.closest('button, a, summary')) return;
      e.preventDefault();
      go.click();
    };
    onKey = onIntroKey;
    document.addEventListener('keydown', onKey);
    root.replaceChildren(
      h('div', { class: 'train-head' }, h('a', { class: 'back-link', href: '#/' }, `← ${modeName(mode)}`)),
      h('div', { class: 'intro-card' },
        h('h1', { class: 'page-title' }, SUBTYPES[subId].name),
        methodBlock(method),
        steps.length
          ? h('div', null, h('h3', { class: 'fb-heading' }, `Beispiel: ${ex.prompt}`), stepsList(steps))
          : null,
        go));
    go.focus();
  }

  if (intro) showIntro();
  else showTask();
}
