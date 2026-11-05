// Kleine SVG-Grafiken für den geführten Lernmodus (views/lernen-guide.ts): Flächenmodell, Ziffernkästchen,
// Zahlenstrahl, Anteilsbalken und Stellenwert-Chips. Nur svg() aus dom.ts, Farben über Klassen (learn.css, .gv-*),
// damit alle Themes greifen. Die Grafiken sind aria-hidden: Dieselbe Information steht in den Schritten als Text.
import type {
  AreaVisual, BarVisual, DigitsVisual, LineVisual, PlacesVisual, Tone, Visual,
} from '../core/solutions/guided-types.ts';
import { fmt } from '../core/numbers.ts';
import { svg } from './dom.ts';

type Anchor = 'start' | 'middle' | 'end';

function root(w: number, hgt: number): SVGSVGElement {
  const w0 = Math.ceil(w), h0 = Math.ceil(hgt);
  return svg('svg', {
    class: 'gv', width: w0, height: h0, viewBox: `0 0 ${w0} ${h0}`, 'aria-hidden': 'true', focusable: 'false',
  });
}

function text(x: number, y: number, label: string, cls = '', anchor: Anchor = 'middle'): SVGTextElement {
  const el = svg('text', { x: x.toFixed(1), y: y.toFixed(1), 'text-anchor': anchor, class: cls });
  el.textContent = label;
  return el;
}

function rect(x: number, y: number, w: number, hgt: number, cls: string, r = 6): SVGRectElement {
  return svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: Math.max(0, w).toFixed(1), height: hgt.toFixed(1), rx: r, class: cls });
}

const toneCls = (tone: Tone | undefined, prefix: string): string => (tone ? ` ${prefix}-${tone}` : '');

/** Ungefähre Textbreite (Zahlenschrift, 13–15 px) für Kästchen und Spalten. */
const textW = (s: string, px = 8.5): number => s.length * px;

/* ---------- Flächenmodell (Zerlegung beim Malnehmen) ---------- */

function area(v: AreaVisual): SVGSVGElement {
  const W = 300, left = 26, top = 22, H = 60, minW = 58;
  const avail = W - left;
  const pos = v.parts.filter((p) => p > 0);
  const neg = v.parts.filter((p) => p < 0);
  const total = pos.reduce((s, p) => s + p, 0) || 1;
  // Breiten proportional, kleine Teile mindestens minW (lesbar), der Rest teilt sich den Platz
  const raw = pos.map((p) => (p / total) * avail);
  const small = raw.filter((w) => w < minW).length;
  const bigSum = pos.filter((_, i) => (raw[i] ?? 0) >= minW).reduce((s, p) => s + p, 0) || 1;
  const widths = pos.map((p, i) => ((raw[i] ?? 0) < minW ? minW : (p / bigSum) * (avail - small * minW)));

  const el = root(W, top + H + 4);
  el.append(text(left / 2 - 2, top + H / 2 + 5, fmt(v.factor), 'gv-label'));
  let x = left;
  let idx = 0;
  pos.forEach((p, i) => {
    const w = widths[i] ?? minW;
    const shown = idx < v.shown;
    el.append(rect(x + 1, top, w - 2, H, `gv-cell${shown ? ' is-shown' : ''}`, 8));
    el.append(text(x + w / 2, top - 7, fmt(p), 'gv-label'));
    // Bei abgezogenem Teil steht die Beschriftung links von der Abzugsfläche
    const negW = i === pos.length - 1 && neg.length ? Math.max(minW, (Math.abs(neg[0] ?? 0) / total) * avail) : 0;
    const cx = x + (w - negW) / 2;
    el.append(text(cx, top + H / 2 + 5, shown ? fmt(p * v.factor) : `${fmt(p)}×${fmt(v.factor)}`, shown ? 'gv-value' : 'gv-muted'));
    x += w;
    idx++;
  });
  // Abzug (z. B. 50 − 1): gestrichelt am rechten Ende der runden Zahl
  for (const n of neg) {
    const w = Math.max(minW, (Math.abs(n) / total) * avail);
    const shown = idx < v.shown;
    el.append(rect(x - w + 4, top + 4, w - 8, H - 8, `gv-neg${shown ? ' is-shown' : ''}`, 6));
    el.append(text(x - w / 2, top - 7, `−${fmt(Math.abs(n))}`, 'gv-label gv-t-c'));
    el.append(text(x - w / 2, top + H / 2 + 5, shown ? `−${fmt(Math.abs(n) * v.factor)}` : `${fmt(Math.abs(n))}×${fmt(v.factor)}`, shown ? 'gv-value gv-t-c' : 'gv-muted'));
    idx++;
  }
  return el;
}

/* ---------- Ziffernkästchen (×11, Quadrat auf 5) ---------- */

function digitsVis(v: DigitsVisual): SVGSVGElement {
  const gap = 8, H = 46, top = 2;
  const ws = v.cells.map((c) => Math.max(40, textW(c.v, 13) + 20));
  const hasNote = v.cells.some((c) => c.note);
  const W = ws.reduce((s, w) => s + w, 0) + gap * (ws.length - 1) + 4;
  const el = root(W, top + H + (hasNote ? 22 : 4));
  let x = 2;
  v.cells.forEach((c, i) => {
    const w = ws[i] ?? 40;
    const empty = c.v === '?';
    el.append(rect(x, top, w, H, `gv-box${empty ? ' is-empty' : ''}${toneCls(c.tone, 'gv')}`, 10));
    el.append(text(x + w / 2, top + H / 2 + 8, c.v, `gv-digit${empty ? ' gv-muted' : ''}${toneCls(c.tone, 'gv-t')}`));
    if (c.note) el.append(text(x + w / 2, top + H + 16, c.note, 'gv-note'));
    x += w + gap;
  });
  return el;
}

/* ---------- Zahlenstrahl (Abstände zu 100, Symmetrie um die Mitte) ---------- */

function lineVis(v: LineVisual): SVGSVGElement {
  const W = 300, pad = 18;
  const lo = (sp: LineVisual['spans'][number]): number => Math.min(sp.from, sp.to);
  const hi = (sp: LineVisual['spans'][number]): number => Math.max(sp.from, sp.to);
  // Ebenen der Bögen: kurze unten, längere darüber, sobald sie sich überlappen (verschachtelte Abstände kreuzen sich nicht)
  const order = v.spans.map((_, i) => i).sort((i, j) => (hi(v.spans[i]!) - lo(v.spans[i]!)) - (hi(v.spans[j]!) - lo(v.spans[j]!)));
  const levels = new Array<number>(v.spans.length).fill(0);
  order.forEach((i, k) => {
    const s = v.spans[i]!;
    const below = order.slice(0, k).filter((j) => lo(v.spans[j]!) < hi(s) && hi(v.spans[j]!) > lo(s));
    levels[i] = below.length ? Math.max(...below.map((j) => levels[j] ?? 0)) + 1 : 0;
  });
  const maxLevel = Math.max(0, ...levels);
  const axisY = v.spans.length ? 44 + maxLevel * 24 : 24;
  const span = v.max - v.min || 1;
  const X = (n: number): number => pad + ((n - v.min) / span) * (W - 2 * pad);
  const el = root(W, axisY + 26);
  el.append(svg('line', { x1: pad - 6, y1: axisY, x2: W - pad + 6, y2: axisY, class: 'gv-axis' }));
  // feine Striche je Einheit (nur bei kurzen Strecken – zum Abzählen)
  if (span <= 40) {
    for (let n = Math.ceil(v.min); n <= v.max; n++) {
      const major = n % 5 === 0;
      el.append(svg('line', { x1: X(n), y1: axisY - (major ? 5 : 3), x2: X(n), y2: axisY + (major ? 5 : 3), class: 'gv-tick' }));
    }
  }
  v.spans.forEach((s, i) => {
    const x1 = X(lo(s)), x2 = X(hi(s)), hgt = 22 + (levels[i] ?? 0) * 24;
    el.append(svg('path', {
      d: `M${x1.toFixed(1)} ${axisY - 2} C${x1.toFixed(1)} ${axisY - hgt} ${x2.toFixed(1)} ${axisY - hgt} ${x2.toFixed(1)} ${axisY - 2}`,
      class: `gv-arc${toneCls(s.tone, 'gv-arc')}`,
    }));
    el.append(text((x1 + x2) / 2, axisY - hgt * 0.75 - 5, s.label, `gv-value${toneCls(s.tone, 'gv-t')}`));
  });
  for (const k of v.ticks) {
    el.append(svg('circle', { cx: X(k.v), cy: axisY, r: 4.5, class: `gv-dot${toneCls(k.tone, 'gv-dot')}` }));
    el.append(text(X(k.v), axisY + 21, k.label, `gv-label${toneCls(k.tone, 'gv-t')}`));
  }
  return el;
}

/* ---------- Anteilsbalken (Bruch, 10-%-Schritte, Prozent-Tausch) ---------- */

function barVis(v: BarVisual): SVGSVGElement {
  const W = 300, pad = 6, top = 26, H = 28;
  const extra = Math.max(0, v.extra ?? 0), cut = Math.max(0, Math.min(v.parts, v.cut ?? 0));
  const pw = (W - 2 * pad) / (v.parts + extra);
  const wholeEnd = pad + v.parts * pw;
  const el = root(W, top + H + 26);
  el.append(rect(pad, top, v.parts * pw, H, 'gv-bar', 6));
  for (let i = 0; i < Math.min(v.filled, v.parts); i++) el.append(rect(pad + i * pw + 1, top + 1, pw - 2, H - 2, 'gv-part', 4));
  for (let i = 1; i < v.parts; i++) el.append(svg('line', { x1: pad + i * pw, y1: top + 3, x2: pad + i * pw, y2: top + H - 3, class: 'gv-div' }));
  if (cut > 0) el.append(rect(wholeEnd - cut * pw + 1, top + 1, cut * pw - 2, H - 2, 'gv-cut', 4));
  if (extra > 0) el.append(rect(wholeEnd + 2, top, extra * pw - 2, H, 'gv-extra', 6));
  // Beschriftungen: 0 und Ganzes unten, ein Teil oben links, Änderung oben über der Änderung
  el.append(text(pad, top + H + 18, '0', 'gv-label', 'start'));
  el.append(text(wholeEnd, top + H + 18, v.whole, 'gv-label', extra > 0 ? 'middle' : 'end'));
  if (v.part) el.append(text(pad, top - 9, v.part, 'gv-value gv-t-a', 'start'));
  if (v.delta && (extra > 0 || cut > 0)) {
    const mid = extra > 0 ? wholeEnd + (extra * pw) / 2 : wholeEnd - (cut * pw) / 2;
    el.append(text(Math.min(mid, W - pad - textW(v.delta) / 2), top - 9, v.delta, `gv-value ${extra > 0 ? 'gv-t-b' : 'gv-t-c'}`));
  }
  return el;
}

/* ---------- Stellenwert-Chips (Ziffern und Nullen getrennt) ---------- */

function placesVis(v: PlacesVisual): SVGSVGElement {
  const labelW = Math.max(36, ...v.rows.map((r) => textW(r.label, 8) + 12));
  const rowH = 28, gap = 10, zw = 15, zgap = 3;
  const heights = v.rows.map((r) => rowH + (r.unit ? 18 : 0));
  const width = Math.max(...v.rows.map((r) => labelW + textW(r.digits, 9.5) + 16 + 6 + r.zeros * (zw + zgap))) + 4;
  const el = root(width, heights.reduce((s, x) => s + x + gap, 0));
  let y = 2;
  v.rows.forEach((r, i) => {
    el.append(text(labelW - 10, y + rowH / 2 + 5, r.label, 'gv-label', 'end'));
    const dw = textW(r.digits, 9.5) + 16;
    el.append(rect(labelW, y, dw, rowH, `gv-chip${toneCls(r.tone, 'gv')}`, 7));
    el.append(text(labelW + dw / 2, y + rowH / 2 + 5, r.digits, `gv-value${toneCls(r.tone, 'gv-t')}`));
    const z0 = labelW + dw + 6;
    for (let k = 0; k < r.zeros; k++) {
      const x = z0 + k * (zw + zgap);
      el.append(rect(x, y + 3, zw, rowH - 6, 'gv-zero', 4));
      el.append(text(x + zw / 2, y + rowH / 2 + 4, '0', 'gv-zero-t'));
    }
    if (r.unit && r.zeros > 0) {
      const x1 = z0, x2 = z0 + r.zeros * (zw + zgap) - zgap, yb = y + rowH + 4;
      el.append(svg('path', { d: `M${x1} ${yb} v4 H${x2} v-4`, class: 'gv-brace' }));
      el.append(text((x1 + x2) / 2, yb + 15, r.unit, 'gv-note gv-t-b'));
    }
    y += (heights[i] ?? rowH) + gap;
  });
  return el;
}

/** Grafik eines Schritts; null für unbekannte Arten. */
export function renderVisual(v: Visual | null | undefined): SVGSVGElement | null {
  if (!v) return null;
  switch (v.kind) {
    case 'area': return area(v);
    case 'digits': return digitsVis(v);
    case 'line': return lineVis(v);
    case 'bar': return barVis(v);
    case 'places': return placesVis(v);
    default: return null;
  }
}
