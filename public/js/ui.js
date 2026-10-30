import { SUBTYPES, CATEGORIES } from './generators.js';
import { solutionSteps } from './solutions.js';
import { parseAiText } from './ai.js';

export const app = document.getElementById('app');
const SVG_NS = 'http://www.w3.org/2000/svg';

/* ---------- router hooks (set by router.js; avoids circular imports) ---------- */

let rerenderFn = () => {};
export function setRerender(fn) { rerenderFn = fn; }
export function rerender() { rerenderFn(); }

let cleanup = null;
export function setCleanup(fn) { cleanup = fn; }
export function runCleanup() { if (cleanup) { cleanup(); cleanup = null; } }

/* ---------- helpers ---------- */

export function h(tag, attrs, ...children) {
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

export function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === undefined || child === null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}

export function level(score) {
  if (score === null || score === undefined) return 'muted';
  if (score >= 85) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

export function badge(score) {
  const lv = level(score);
  return h('span', { class: `badge ${lv}` }, lv === 'muted' ? 'neu' : String(score));
}

export function tile(value, label, lv) {
  return h('div', { class: `tile${lv ? ' ' + lv : ''}` },
    h('div', { class: 'tile-value' }, value),
    h('div', { class: 'tile-label' }, label));
}

export function pct(x) {
  return `${Math.round((x || 0) * 100)} %`;
}

export function modeName(mode) {
  if (mode === 'all') return 'Alle Kategorien';
  if (mode === 'weak') return 'Schwächen';
  if (mode === 'review') return 'Wiederholung';
  if (SUBTYPES[mode]) {
    const cat = CATEGORIES.find((x) => x.id === SUBTYPES[mode].category);
    return `${cat ? cat.name : SUBTYPES[mode].category} · ${SUBTYPES[mode].name}`;
  }
  const c = CATEGORIES.find((x) => x.id === mode);
  return c ? c.name : mode;
}

export function isValidMode(mode) {
  return mode === 'all' || mode === 'weak' || mode === 'review' || Boolean(SUBTYPES[mode]) || CATEGORIES.some((c) => c.id === mode);
}

/* ---------- learning helpers ---------- */

export function safeSteps(task) {
  try {
    const steps = solutionSteps(task);
    return Array.isArray(steps) ? steps : [];
  } catch {
    return [];
  }
}

export function stepsList(steps) {
  return h('ol', { class: 'steps' }, steps.map((s) => h('li', null, s)));
}

export function fold(summaryText, content, { open = false, cls = '' } = {}) {
  return h('details', { class: `fold${cls ? ' ' + cls : ''}`, open },
    h('summary', null, summaryText),
    h('div', { class: 'fold-body' }, content));
}

export function methodBlock(m, { pitfalls = false, link = null } = {}) {
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

export function partNodes(parts) {
  return (parts || []).map((p) => {
    let node = document.createTextNode(p.text);
    if (p.italic) node = h('em', null, node);
    if (p.bold) node = h('strong', null, node);
    return node;
  });
}

export function aiBox(text) {
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

export function aiControl(label, fetcher) {
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

export function go(hash) {
  if (location.hash === hash) rerender();
  else location.hash = hash;
}
