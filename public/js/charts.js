// charts.js – UI-Bausteine (nur DOM-API, kein innerHTML, keine style-Attribute)
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, String(v));
  }
  return el;
}

const ICONS = {
  book: [['path', 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z'], ['path', 'M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5'], ['path', 'M9 8h6']],
  play: [['path', 'M7 4.5v15l12-7.5z']],
  chart: [['path', 'M4 20V10'], ['path', 'M10 20V4'], ['path', 'M16 20v-7'], ['path', 'M22 20H2']],
  gear: [['circle', null, { cx: 12, cy: 12, r: 3 }], ['path', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z']],
  flame: [['path', 'M12 2s5 4.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5.5 1-8.5z']],
  star: [['path', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z']],
  target: [['circle', null, { cx: 12, cy: 12, r: 9 }], ['circle', null, { cx: 12, cy: 12, r: 5 }], ['circle', null, { cx: 12, cy: 12, r: 1 }]],
  repeat: [['path', 'M17 2l4 4-4 4'], ['path', 'M3 11V9a3 3 0 0 1 3-3h15'], ['path', 'M7 22l-4-4 4-4'], ['path', 'M21 13v2a3 3 0 0 1-3 3H3']],
  check: [['path', 'M4 12.5l5 5L20 6.5']],
  x: [['path', 'M6 6l12 12'], ['path', 'M18 6L6 18']],
  chevron: [['path', 'M9 6l6 6-6 6']],
  sparkles: [['path', 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z'], ['path', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z']],
  'plus-minus': [['path', 'M7 4v8'], ['path', 'M3 8h8'], ['path', 'M3 19h8'], ['path', 'M14 6h7'], ['path', 'M14 15h7'], ['path', 'M14 19h7']],
  trophy: [['path', 'M8 4h8v6a4 4 0 0 1-8 0z'], ['path', 'M8 6H4v1a4 4 0 0 0 4 4'], ['path', 'M16 6h4v1a4 4 0 0 1-4 4'], ['path', 'M12 14v4'], ['path', 'M8 21h8']],
  clock: [['circle', null, { cx: 12, cy: 12, r: 9 }], ['path', 'M12 7v5l3 2']],
};

export function icon(name, { size = 24 } = {}) {
  const root = svgEl('svg', {
    class: `icon icon-${name}`, viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
    stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  });
  for (const [tag, d, attrs] of ICONS[name] || []) {
    root.append(svgEl(tag, tag === 'path' ? { d } : attrs));
  }
  return root;
}

const RING_PX = { sm: 40, md: 64, lg: 120 };

export function ring(value0to1, { size = 'md', text = '', cls = '' } = {}) {
  const v = Number.isFinite(value0to1) ? Math.max(0, Math.min(1, value0to1)) : 0;
  const pct = Math.round(v * 1000) / 10;
  const px = RING_PX[size] || RING_PX.md;
  const root = svgEl('svg', {
    class: `ring ${size}${cls ? ' ' + cls : ''}`, viewBox: '0 0 36 36', width: px, height: px, role: 'img',
    'aria-label': text ? `${text}` : `${Math.round(v * 100)} %`,
  });
  root.append(svgEl('circle', { class: 'ring-track', cx: 18, cy: 18, r: 15.915, fill: 'none' }));
  root.append(svgEl('circle', {
    class: 'ring-value', cx: 18, cy: 18, r: 15.915, fill: 'none', 'stroke-dasharray': `${pct} 100`, 'stroke-linecap': 'round',
    transform: 'rotate(-90 18 18)',
  }));
  if (text !== '' && text !== null && text !== undefined) {
    const t = svgEl('text', { class: 'ring-text', x: 18, y: 18, 'text-anchor': 'middle', 'dominant-baseline': 'central' });
    t.textContent = String(text);
    root.append(t);
  }
  return root;
}

let sparkId = 0;

export function sparkline(values, { area = true, max = null, gaps = false } = {}) {
  const W = 120, H = 40, PAD = 3;
  const root = svgEl('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Verlauf' });
  const vals = Array.isArray(values) ? values : [];
  const nums = vals.filter((v) => Number.isFinite(v));
  if (!nums.length) return root;
  const hi = max !== null && Number.isFinite(max) ? max : Math.max(...nums, 1);
  const lo = max !== null ? 0 : Math.min(0, ...nums);
  const span = hi - lo || 1;
  const n = vals.length;
  const x = (i) => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (v) => H - PAD - ((Math.min(Math.max(v, lo), hi) - lo) / span) * (H - 2 * PAD);

  // Segmente: mit gaps = true ist null eine Lücke, sonst werden die vorhandenen Punkte verbunden
  const segs = [];
  let cur = [];
  vals.forEach((v, i) => {
    if (Number.isFinite(v)) cur.push([x(i), y(v)]);
    else if (gaps && cur.length) { segs.push(cur); cur = []; }
  });
  if (cur.length) segs.push(cur);

  if (area) {
    const id = `spark-grad-${++sparkId}`;
    const defs = svgEl('defs');
    const grad = svgEl('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.append(svgEl('stop', { class: 'stop-a', offset: '0%' }), svgEl('stop', { class: 'stop-b', offset: '100%' }));
    defs.append(grad);
    root.append(defs);
    for (const s of segs) {
      if (s.length < 2) continue;
      const d = `M${s[0][0].toFixed(1)},${(H - PAD).toFixed(1)} ` + s.map(([px, py]) => `L${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
        + ` L${s[s.length - 1][0].toFixed(1)},${(H - PAD).toFixed(1)} Z`;
      root.append(svgEl('path', { class: 'area', d, fill: `url(#${id})` }));
    }
  }
  for (const s of segs) {
    if (s.length === 1) {
      root.append(svgEl('circle', { class: 'dot', cx: s[0][0].toFixed(1), cy: s[0][1].toFixed(1), r: 2 }));
    } else {
      root.append(svgEl('polyline', { class: 'line', fill: 'none', points: s.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ') }));
    }
  }
  return root;
}

export function heatmapGrid(cells) {
  const root = document.createElement('div');
  root.className = 'heatmap';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', 'Aktivität der letzten Wochen');
  for (const c of cells || []) {
    const cell = document.createElement('span');
    cell.className = 'hm-cell';
    cell.dataset.level = String(Math.max(0, Math.min(4, c.level | 0)));
    if (c.date) cell.title = `${c.date}${c.ms ? ` · ${Math.round(c.ms / 60000)} min` : ''}`;
    root.append(cell);
  }
  return root;
}

export function progressBar(value0to100) {
  const v = Number.isFinite(value0to100) ? Math.max(0, Math.min(100, value0to100)) : 0;
  const root = document.createElement('div');
  root.className = 'progress';
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.setAttribute('aria-valuenow', String(Math.round(v)));
  const bar = document.createElement('span');
  bar.className = 'progress-bar';
  bar.style.setProperty('--w', String(v));
  root.append(bar);
  return root;
}

export function confetti() {
  const root = document.createElement('div');
  root.className = 'confetti';
  root.setAttribute('aria-hidden', 'true');
  const N = 36;
  for (let i = 0; i < N; i++) {
    const p = document.createElement('span');
    p.className = 'confetti-piece';
    p.style.setProperty('--x', `${Math.round((i / N) * 100 + Math.random() * 6 - 3)}`);
    p.style.setProperty('--d', `${(Math.random() * 0.6).toFixed(2)}s`);
    p.style.setProperty('--r', `${Math.round(Math.random() * 360)}deg`);
    p.style.setProperty('--c', String(i % 5));
    root.append(p);
  }
  document.body.append(root);
  setTimeout(() => root.remove(), 3000);
  return root;
}

export function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = String(text);
  document.body.append(el);
  setTimeout(() => el.remove(), 3200);
  return el;
}
