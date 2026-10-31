// Exhibits (Case-Schaubilder) aus task.params zeichnen: Balken, Säulen, gruppierte Säulen, Tabelle.
// Nur DOM-API, Farben über CSS-Klassen (public/css/exhibit.css).
import type { Params } from '../types.ts';
import { h } from './dom.ts';
import { svgEl } from './charts.ts';
import { fmt } from '../core/numbers.ts';

const W = 320;

const str = (p: Params, k: string): string => {
  const v = p[k];
  return typeof v === 'string' ? v : '';
};
const list = (s: string): string[] => (s ? s.split('|') : []);
const nums = (s: string): number[] => list(s).map(Number);

function text(x: number, y: number, label: string, cls: string, anchor = 'middle'): SVGElement {
  const el = svgEl('text', { x, y, class: cls, 'text-anchor': anchor, 'dominant-baseline': 'middle' });
  el.textContent = label;
  return el;
}

function svgRoot(height: number, label: string): SVGElement {
  return svgEl('svg', { viewBox: `0 0 ${W} ${height}`, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
}

// Horizontale Balken (Anteile)
function bars(labels: string[], vals: number[], aria: string): SVGElement {
  const rowH = 30, labelW = 92, maxW = 170, max = Math.max(...vals, 1);
  const root = svgRoot(labels.length * rowH + 4, aria);
  labels.forEach((label, i) => {
    const y = i * rowH + 2, v = vals[i] ?? 0, w = Math.max(2, (v / max) * maxW);
    root.append(
      text(labelW - 6, y + rowH / 2, label, 'ex-label', 'end'),
      svgEl('rect', { x: labelW, y: y + 6, width: w, height: rowH - 12, rx: 4, class: 'ex-bar ex-s1' }),
      text(labelW + w + 6, y + rowH / 2, fmt(v), 'ex-val', 'start'));
  });
  return root;
}

// Säulen (eine oder zwei Reihen) mit Werten über den Säulen
function columns(labels: string[], series: number[][], names: string[], aria: string): SVGElement {
  const top = names.length > 1 ? 34 : 18, bottom = 22, plotH = 140, H = top + plotH + bottom;
  const max = Math.max(...series.flat(), 1);
  const slot = (W - 8) / Math.max(labels.length, 1);
  const groupW = slot * (series.length > 1 ? 0.8 : 0.56), barW = groupW / series.length;
  const root = svgRoot(H, aria);
  if (names.length > 1) {
    names.forEach((name, j) => {
      const x = 8 + j * 90;
      root.append(svgEl('rect', { x, y: 6, width: 10, height: 10, rx: 2, class: `ex-s${j + 1}` }), text(x + 16, 11, name, 'ex-label', 'start'));
    });
  }
  root.append(svgEl('line', { x1: 4, x2: W - 4, y1: top + plotH, y2: top + plotH, class: 'ex-axis' }));
  labels.forEach((label, i) => {
    const x0 = 4 + i * slot + (slot - groupW) / 2;
    series.forEach((vals, j) => {
      const v = vals[i] ?? 0, bh = Math.max(2, (v / max) * plotH), x = x0 + j * barW;
      root.append(
        svgEl('rect', { x: x + 1, y: top + plotH - bh, width: barW - 2, height: bh, rx: 3, class: `ex-bar ex-s${j + 1}` }),
        text(x + barW / 2, top + plotH - bh - 8, fmt(v), 'ex-val'));
    });
    root.append(text(4 + i * slot + slot / 2, top + plotH + 12, label, 'ex-label'));
  });
  return root;
}

function table(head: string[], labels: string[], cols: number[][]): HTMLElement {
  return h('table', { class: 'ex-table' },
    h('thead', null, h('tr', null, head.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', null, labels.map((label, i) =>
      h('tr', null, h('th', { scope: 'row' }, label), cols.map((col) => h('td', null, fmt(col[i] ?? 0)))))));
}

/** Exhibit aus den Aufgabenparametern oder null, wenn die Aufgabe keins hat. */
export function renderExhibit(p: Params | null | undefined): HTMLElement | null {
  if (!p) return null;
  const kind = str(p, 'ex');
  if (!kind) return null;
  const title = str(p, 'ttl'), labels = list(str(p, 'lab'));
  const s1 = nums(str(p, 's1')), s2 = nums(str(p, 's2')), names = list(str(p, 'sn'));
  const aria = `${title}: ${labels.map((l, i) => `${l} ${fmt(s1[i] ?? 0)}${s2.length ? ` / ${fmt(s2[i] ?? 0)}` : ''}`).join('; ')}`;
  const body = kind === 'table' ? table(list(str(p, 'hd')), labels, [s1, s2])
    : kind === 'bar' ? bars(labels, s1, aria)
    : columns(labels, kind === 'group' ? [s1, s2] : [s1], names, aria);
  return h('figure', { class: `exhibit exhibit-${kind}` }, h('figcaption', { class: 'exhibit-title' }, title), body);
}
