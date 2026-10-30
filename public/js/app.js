import { fmt, fmtSeconds, parseAnswer, unitFactor } from './numbers.js';
import { CATEGORIES, SUBTYPES, generate, generateForMode } from './generators.js';
import { evaluate, categoryStats, subtypeStats, overall, weaknesses, errorPatterns } from './scoring.js';
import { solutionSteps } from './solutions.js';
import { METHODS, getMethod } from './methods.js';
import { aiExplainTask, aiExplainMethod, isAiAvailable, parseAiText } from './ai.js';
import {
  getAttempts, getSessions, getSettings, setSettings,
  addAttempt, addSession, resetAll, exportJSON,
} from './storage.js';

const app = document.getElementById('app');
const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- helpers ---------- */

function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendChildren(el, children);
  return el;
}

function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}

function level(score) {
  if (score === null || score === undefined) return 'muted';
  if (score >= 85) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

function badge(score) {
  const lv = level(score);
  return h('span', { class: `badge ${lv}` }, lv === 'muted' ? 'neu' : String(score));
}

function tile(value, label, lv) {
  return h('div', { class: `tile${lv ? ' ' + lv : ''}` },
    h('div', { class: 'tile-value' }, value),
    h('div', { class: 'tile-label' }, label));
}

function pct(x) {
  return `${Math.round((x || 0) * 100)} %`;
}

function modeName(mode) {
  if (mode === 'all') return 'Alle Kategorien';
  if (mode === 'weak') return 'Schwächen';
  if (SUBTYPES[mode]) {
    const cat = CATEGORIES.find((x) => x.id === SUBTYPES[mode].category);
    return `${cat ? cat.name : SUBTYPES[mode].category} · ${SUBTYPES[mode].name}`;
  }
  const c = CATEGORIES.find((x) => x.id === mode);
  return c ? c.name : mode;
}

function isValidMode(mode) {
  return mode === 'all' || mode === 'weak' || Boolean(SUBTYPES[mode]) || CATEGORIES.some((c) => c.id === mode);
}

/* ---------- learning helpers ---------- */

function safeSteps(task) {
  try {
    const steps = solutionSteps(task);
    return Array.isArray(steps) ? steps : [];
  } catch {
    return [];
  }
}

function stepsList(steps) {
  return h('ol', { class: 'steps' }, steps.map((s) => h('li', null, s)));
}

function fold(summaryText, content, { open = false, cls = '' } = {}) {
  return h('details', { class: `fold${cls ? ' ' + cls : ''}`, open },
    h('summary', null, summaryText),
    h('div', { class: 'fold-body' }, content));
}

function methodBlock(m, { pitfalls = false, link = null } = {}) {
  return h('div', { class: 'method' },
    h('p', { class: 'method-idea' }, m.idea),
    m.steps && m.steps.length ? stepsList(m.steps) : null,
    m.trick ? h('div', { class: 'callout' }, h('span', { class: 'callout-label' }, 'Trick'), m.trick) : null,
    pitfalls && m.pitfalls && m.pitfalls.length
      ? h('div', null, h('h4', { class: 'method-heading' }, 'Typische Fehler'),
        h('ul', { class: 'bullets' }, m.pitfalls.map((p) => h('li', null, p))))
      : null,
    link ? h('a', { class: 'linkbtn', href: link, target: '_blank', rel: 'noopener' }, 'Im Lernbereich öffnen') : null);
}

function partNodes(parts) {
  return (parts || []).map((p) => {
    let node = document.createTextNode(p.text);
    if (p.italic) node = h('em', null, node);
    if (p.bold) node = h('strong', null, node);
    return node;
  });
}

function aiBox(text) {
  const box = h('div', { class: 'ai-box', tabindex: '-1' }, h('div', { class: 'ai-label' }, 'KI · kann sich irren'));
  for (const block of parseAiText(text)) {
    if (block.type === 'ol' || block.type === 'ul') {
      box.append(h(block.type, { class: block.type === 'ol' ? 'steps' : 'bullets' },
        block.items.map((parts) => h('li', null, partNodes(parts)))));
    } else {
      box.append(h('p', null, partNodes(block.parts)));
    }
  }
  return box;
}

function aiControl(label, fetcher) {
  const out = h('div', { class: 'ai-out', 'aria-live': 'polite' });
  const btn = h('button', {
    type: 'button', class: 'btn small',
    onclick: async () => {
      btn.disabled = true;
      btn.textContent = 'KI erklärt …';
      let res;
      try { res = await fetcher(); } catch { res = null; }
      if (res && res.ok) {
        const box = aiBox(res.text);
        out.replaceChildren(box);
        btn.remove();
        box.focus();
      } else {
        out.replaceChildren(h('p', { class: 'small muted' }, (res && res.message) || 'KI gerade nicht erreichbar.'));
        btn.disabled = false;
        btn.textContent = label;
      }
    },
  }, label);
  return h('div', { class: 'ai' }, btn, out);
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/* ---------- router ---------- */

let cleanup = null;

function parseRoute() {
  const parts = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean);
  if (parts[0] === 'analyse') return { name: 'analyse' };
  if (parts[0] === 'lernen') return { name: 'lernen', id: parts[1] && SUBTYPES[parts[1]] ? parts[1] : null };
  if (parts[0] === 'train' && parts[1] && isValidMode(parts[1])) return { name: 'train', mode: parts[1] };
  return { name: 'home' };
}

function render() {
  if (cleanup) { cleanup(); cleanup = null; }
  const route = parseRoute();
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const navKey = route.name === 'analyse' ? 'analyse' : route.name === 'lernen' ? 'lernen' : 'home';
    const active = a.dataset.nav === navKey;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  app.replaceChildren();
  window.scrollTo(0, 0);
  if (route.name === 'analyse') renderAnalyse();
  else if (route.name === 'lernen') renderLernen(route.id);
  else if (route.name === 'train') renderTrain(route.mode);
  else renderHome();
}

window.addEventListener('hashchange', render);

/* ---------- home ---------- */

function renderHome() {
  const attempts = getAttempts();
  const settings = getSettings();
  const stats = categoryStats(attempts);
  const counts = {};
  for (const a of attempts) counts[a.category] = (counts[a.category] || 0) + 1;
  const weak = weaknesses(attempts);

  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Rundenlänge' });
  for (const n of [10, 20, 30]) {
    seg.append(h('button', {
      type: 'button',
      'aria-pressed': String(settings.sessionLength === n),
      onclick: () => { setSettings({ sessionLength: n }); render(); },
    }, String(n)));
  }

  const allScore = overall(attempts).score;
  const allCard = h('a', { class: 'card card-wide', href: '#/train/all' },
    h('div', { class: 'card-head' },
      h('div', null,
        h('div', { class: 'card-title' }, 'Alle Kategorien'),
        h('div', { class: 'card-sub' }, `Gemischt · ${attempts.length} Aufgaben`)),
      badge(allScore)));

  const grid = h('div', { class: 'grid' });
  for (const c of CATEGORIES) {
    grid.append(h('a', { class: 'card', href: `#/train/${c.id}` },
      h('div', { class: 'card-title' }, c.name),
      h('div', { class: 'card-sub' }, c.description),
      h('div', { class: 'card-foot' }, badge(stats[c.id] ? stats[c.id].score : null), `${counts[c.id] || 0} Aufg.`)));
  }

  appendChildren(app, [
    h('div', { class: 'stack' },
      h('h1', { class: 'page-title' }, 'Kopfrechnen fürs Case Interview'),
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Länge'), seg)),
    weak.length
      ? h('a', { class: 'card banner', href: '#/train/weak' },
        h('span', null, 'Schwächen trainieren'), h('span', { 'aria-hidden': 'true' }, '→'))
      : null,
    allCard,
    grid,
  ]);
}

/* ---------- train ---------- */

function renderTrain(mode) {
  const sessionLength = getSettings().sessionLength || 10;
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

  const results = []; // { task, given, ev, timeMs }
  let points = 0;
  let index = 0;
  let timerId = null;
  let onKey = null;

  const stop = () => {
    if (timerId) { clearInterval(timerId); timerId = null; }
    if (onKey) { document.removeEventListener('keydown', onKey); onKey = null; }
  };
  cleanup = stop;

  const root = h('div', { class: 'train' });
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
    const task = generateForMode(genMode, { weakSubtypes });
    const sub = SUBTYPES[task.subtype];
    const method = getMethod(task.subtype);
    const t0 = performance.now();
    let answered = false;
    let assisted = false;

    const input = h('input', {
      type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done',
      'aria-label': 'Antwort', spellcheck: 'false', autocapitalize: 'off',
    });
    const timer = h('div', { class: 'timer' }, '');
    const actions = h('div', { class: 'actions', 'aria-live': 'polite' });

    const updateTimer = () => {
      timer.textContent = `${fmtSeconds(performance.now() - t0)} · Ziel ${fmtSeconds(task.targetMs)}`;
    };
    updateTimer();
    timerId = setInterval(updateTimer, 100);

    function finish(given) {
      if (answered) return;
      answered = true;
      const timeMs = Math.round(performance.now() - t0);
      stop();
      timer.textContent = `${fmtSeconds(timeMs)} · Ziel ${fmtSeconds(task.targetMs)}`;
      input.disabled = true;
      helpWrap.remove();
      const ev = evaluate(task, given, timeMs, { assisted });
      points += ev.points;
      results.push({ task, given, ev, timeMs });
      addAttempt({
        ts: Date.now(), sessionId, mode, category: task.category, subtype: task.subtype,
        prompt: task.prompt, unit: task.unit, expected: task.expected, given,
        correct: ev.correct, errorType: ev.errorType, timeMs, targetMs: task.targetMs,
        weight: task.weight, points: ev.points, params: task.params, assisted,
      });
      showFeedback(ev, timeMs, given);
    }

    function next() {
      index += 1;
      if (index >= sessionLength) showResult();
      else showTask();
    }

    function showFeedback(ev, timeMs, given) {
      const labels = { nullen: 'Nullen-Fehler', knapp: 'Knapp daneben', falsch: 'Falsch', skip: 'Übersprungen' };
      const fb = h('div', { class: `feedback ${ev.correct ? 'good' : 'bad'}` });
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
      notice ? h('p', { class: 'notice' }, notice) : null,
      h('div', { class: 'task' },
        h('div', { class: 'task-type' }, sub ? sub.name : task.subtype),
        h('div', { class: `question${task.prompt.length > 22 ? ' long' : ''}` }, task.prompt),
        h('div', { class: 'hint' }, task.hint || (unitFactor(task.unit) > 1 ? `in ${task.unit} oder als volle Zahl` : '')),
        h('div', { class: 'answer' }, input, task.unit ? h('span', { class: 'unit' }, task.unit) : null),
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

  showTask();
}

/* ---------- analyse ---------- */

function sparkline(values) {
  const W = 600; const H = 140; const padL = 32; const padR = 12; const padT = 12; const padB = 24;
  const max = Math.max(...values, 1);
  const x = (i) => padL + (values.length === 1 ? 0 : (i / (values.length - 1)) * (W - padL - padR));
  const y = (v) => padT + (1 - v / max) * (H - padT - padB);
  const root = svg('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Punkte pro Aufgabe der letzten ${values.length} Runden` });
  root.append(svg('line', { class: 'axis', x1: padL, y1: H - padB, x2: W - padR, y2: H - padB }));
  root.append(svg('line', { class: 'axis', x1: padL, y1: padT, x2: padL, y2: H - padB }));
  const top = svg('text', { x: padL - 6, y: padT + 4, 'text-anchor': 'end' });
  top.textContent = String(Math.round(max));
  const zero = svg('text', { x: padL - 6, y: H - padB + 4, 'text-anchor': 'end' });
  zero.textContent = '0';
  root.append(top, zero);
  root.append(svg('polyline', { class: 'line', points: values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') }));
  values.forEach((v, i) => root.append(svg('circle', { class: 'dot', cx: x(i).toFixed(1), cy: y(v).toFixed(1), r: 3 })));
  return root;
}

function renderAnalyse() {
  const attempts = getAttempts();

  if (attempts.length === 0) {
    app.append(
      h('h1', { class: 'page-title' }, 'Analyse'),
      h('div', { class: 'card empty' },
        h('div', { class: 'card-title' }, 'Noch keine Daten'),
        h('p', { class: 'muted' }, 'Löse ein paar Aufgaben, dann siehst du hier deine Stärken und Schwächen.'),
        h('a', { class: 'btn primary', href: '#/train/all' }, 'Training starten')));
    return;
  }

  const total = attempts.length;
  const correct = attempts.filter((a) => a.correct).length;
  const avgTime = attempts.reduce((s, a) => s + (a.timeMs || 0), 0) / total;
  const sk = overall(attempts).score;
  const weak = weaknesses(attempts);
  const cats = categoryStats(attempts);
  const patterns = errorPatterns(attempts);
  const sessions = getSessions().slice(-20);

  const weakSection = h('section', null, h('h2', { class: 'section-title' }, 'Deine Schwächen'));
  if (weak.length === 0) {
    weakSection.append(h('p', { class: 'muted' }, 'Keine Schwächen erkannt – weiter so.'));
  } else {
    const stack = h('div', { class: 'stack' });
    for (const w of weak) {
      stack.append(h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', null,
            h('div', { class: 'card-title' }, w.name),
            h('div', { class: 'card-sub' }, `${w.categoryName} · ${w.label}`)),
          badge(w.score)),
        h('p', { class: 'small muted' }, `${pct(w.accuracy)} richtig · Ø ${fmtSeconds(w.avgTimeMs)} (Ziel ${fmtSeconds(w.targetMs)})`),
        w.tip ? h('p', { class: 'small' }, `Tipp: ${w.tip}`) : null,
        h('div', { class: 'card-actions' },
          h('a', { class: 'btn small', href: `#/lernen/${w.subtype}` }, 'Lernen'),
          h('a', { class: 'btn small', href: `#/train/${w.subtype}` }, 'Üben'))));
    }
    weakSection.append(stack, h('div', { class: 'btn-row section-actions' }, h('a', { class: 'btn primary', href: '#/train/weak' }, 'Schwächen trainieren')));
  }

  const bars = h('ul', { class: 'bars' });
  for (const c of CATEGORIES) {
    const s = cats[c.id] || { n: 0, score: null };
    const catAttempts = attempts.filter((a) => a.category === c.id);
    const fill = h('span', { class: `bar-fill ${level(s.score)}` });
    fill.style.setProperty('--w', String(s.score === null || s.score === undefined ? 0 : s.score));
    const meta = catAttempts.length
      ? `${pct(s.accuracy)} · Ø ${fmtSeconds(s.avgTimeMs)} · ${catAttempts.length}`
      : 'Noch keine Aufgaben';
    bars.append(h('li', { class: 'bar-row' },
      h('span', { class: 'bar-name' }, c.name),
      h('span', { class: 'bar-score' }, badge(s.score)),
      h('div', { class: 'bar-track' }, fill),
      h('span', { class: 'bar-meta' }, meta)));
  }

  const patternTiles = h('div', { class: 'stats' },
    tile(String(patterns.nullen || 0), 'Nullen-Fehler'),
    tile(String(patterns.knapp || 0), 'Knapp daneben'),
    tile(String(patterns.falsch || 0), 'Falsch'),
    tile(String(patterns.skip || 0), 'Übersprungen'));

  const historySection = h('section', null, h('h2', { class: 'section-title' }, 'Verlauf'));
  if (sessions.length >= 2) {
    historySection.append(sparkline(sessions.map((s) => (s.n ? s.points / s.n : 0))),
      h('p', { class: 'small muted' }, 'Punkte pro Aufgabe, letzte Runden'));
  } else {
    historySection.append(h('p', { class: 'muted' }, 'Nach zwei abgeschlossenen Runden erscheint hier dein Verlauf.'));
  }

  const errors = attempts.filter((a) => !a.correct).slice(-10).reverse();
  const errList = h('ul', { class: 'list' });
  for (const a of errors) {
    const unit = a.unit ? ` ${a.unit}` : '';
    errList.append(h('li', null,
      h('span', { class: 'mark bad' }, '✗'),
      h('span', { class: 'item-main' }, a.prompt),
      h('span', { class: 'item-meta' }, fmtSeconds(a.timeMs)),
      h('span', { class: 'item-sub' }, `deine: ${a.given === null ? 'übersprungen' : fmt(a.given)} · richtig: ${fmt(a.expected)}${unit}`),
      (() => {
        if (!a.params) return null;
        const steps = safeSteps({ subtype: a.subtype, params: a.params, expected: a.expected, unit: a.unit, prompt: a.prompt });
        return steps.length ? h('div', { class: 'item-steps' }, fold('Lösungsweg', stepsList(steps))) : null;
      })()));
  }

  const exportBtn = h('button', {
    type: 'button', class: 'btn',
    onclick: () => {
      const blob = new Blob([exportJSON()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: 'kopfrechner-export.json' });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  }, 'Export (JSON)');
  const resetBtn = h('button', {
    type: 'button', class: 'btn danger',
    onclick: () => {
      if (confirm('Wirklich alle Daten löschen? Das lässt sich nicht rückgängig machen.')) {
        resetAll();
        render();
      }
    },
  }, 'Alles zurücksetzen');

  appendChildren(app, [
    h('h1', { class: 'page-title' }, 'Analyse'),
    h('div', { class: 'stats' },
      tile(sk === null || sk === undefined ? '–' : String(sk), 'Skill', level(sk)),
      tile(String(total), 'Aufgaben'),
      tile(pct(correct / total), 'richtig'),
      tile(fmtSeconds(avgTime), 'Ø Zeit')),
    weakSection,
    h('section', null, h('h2', { class: 'section-title' }, 'Kategorien'), bars),
    h('section', null, h('h2', { class: 'section-title' }, 'Fehlermuster'), patternTiles),
    historySection,
    errors.length ? h('section', null, h('h2', { class: 'section-title' }, 'Letzte Fehler'), errList) : null,
    h('section', null, h('h2', { class: 'section-title' }, 'Daten'), h('div', { class: 'btn-row' }, exportBtn, resetBtn)),
  ]);
}

/* ---------- lernen ---------- */

function learnCard(sub, stat, open) {
  const m = getMethod(sub.id);
  const exBody = h('div', { class: 'example-body' });

  function drawExample() {
    const task = generate(sub.id);
    const steps = safeSteps(task);
    const answer = `${fmt(task.expected)}${task.unit ? ' ' + task.unit : ''}`;
    const solution = h('div', { class: 'example-solution', hidden: true },
      steps.length ? stepsList(steps) : h('p', null, `Lösung: ${answer}`));
    const showBtn = h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        solution.hidden = !solution.hidden;
        showBtn.textContent = solution.hidden ? 'Lösung zeigen' : 'Lösung verbergen';
      },
    }, 'Lösung zeigen');
    const newBtn = h('button', { type: 'button', class: 'btn small', onclick: drawExample }, 'Neues Beispiel');
    exBody.replaceChildren(
      h('div', { class: 'example-prompt' }, task.prompt),
      task.hint || task.unit
        ? h('div', { class: 'small muted' }, [task.hint, task.unit ? `Antwort in ${task.unit}` : null].filter(Boolean).join(' · '))
        : null,
      h('div', { class: 'card-actions' }, showBtn, newBtn),
      solution);
  }
  drawExample();

  const score = stat ? stat.score : null;
  return h('details', { class: 'learn-card', id: `learn-${sub.id}`, open },
    h('summary', null,
      h('span', { class: 'ls-name' }, sub.name),
      badge(score),
      h('span', { class: 'ls-goal muted' }, `Ziel ${fmtSeconds(sub.targetMs)}`)),
    h('div', { class: 'learn-body' },
      m ? h('div', { class: 'method' },
        h('p', { class: 'method-idea' }, m.idea),
        m.steps && m.steps.length ? h('div', null, h('h4', { class: 'method-heading' }, 'Vorgehen'), stepsList(m.steps)) : null,
        m.trick ? h('div', { class: 'callout' }, h('span', { class: 'callout-label' }, 'Trick'), m.trick) : null,
        m.pitfalls && m.pitfalls.length
          ? h('div', null, h('h4', { class: 'method-heading' }, 'Typische Fehler'),
            h('ul', { class: 'bullets' }, m.pitfalls.map((p) => h('li', null, p))))
          : null) : null,
      h('div', { class: 'example' }, h('h4', { class: 'method-heading' }, 'Beispiel'), exBody),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn primary', href: `#/train/${sub.id}` }, 'Üben')),
      isAiAvailable() ? aiControl('KI: anders erklären', () => aiExplainMethod(sub.id)) : null));
}

function renderLernen(openId) {
  const stats = subtypeStats(getAttempts());
  const sections = CATEGORIES.map((c) => {
    const subs = Object.values(SUBTYPES).filter((s) => s.category === c.id);
    return h('section', null,
      h('h2', { class: 'section-title' }, c.name, h('span', { class: 'muted section-sub' }, ` · ${c.description}`)),
      h('div', { class: 'stack' }, subs.map((s) => learnCard(s, stats[s.id], s.id === openId))));
  });
  appendChildren(app, [
    h('div', { class: 'stack' },
      h('h1', { class: 'page-title' }, 'Lernen'),
      h('p', { class: 'muted' }, 'So rechnest du jeden Aufgabentyp im Kopf – mit Beispiel zum Selbstversuch.')),
    sections,
  ]);
  if (openId) {
    const el = document.getElementById(`learn-${openId}`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }
}

render();
