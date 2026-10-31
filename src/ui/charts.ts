// charts.ts – Icons und Diagramme (Lernkurve, Heatmap, Fortschrittsbalken), Konfetti. Nur DOM-API, keine style-Attribute;
// die Optik steht in components.css.
import type { HeatCell } from '../types.ts';
import { locale, t } from '../i18n/index.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';

type SvgAttrValue = string | number | boolean | null | undefined;

export function svgEl(tag: string, attrs: Record<string, SvgAttrValue> = {}): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, String(v));
  }
  return el;
}

type IconPart = readonly [tag: 'path' | 'circle' | 'rect', d: string | null, attrs?: Record<string, number>];

const c = (cx: number, cy: number, r: number): IconPart => ['circle', null, { cx, cy, r }];
const rect = (x: number, y: number, width: number, height: number, rx: number): IconPart => ['rect', null, { x, y, width, height, rx }];

/** Icon-Set „Ruhiger Fokus“: Pfade aus den Artboards (docs/design/ruhiger-fokus), Strichstärke 1,75. */
const ICON_SET = {
  // Tabs
  sun: [c(12, 12, 4), ['path', 'M12 2.5v2M12 19.5v2M4.6 4.6L6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4']],
  book: [['path', 'M12 6.5C10.5 5.3 8.4 4.75 4 4.75v13.5c4.4 0 6.5.55 8 1.75 1.5-1.2 3.6-1.75 8-1.75V4.75c-4.4 0-6.5.55-8 1.75Z'], ['path', 'M12 6.5V20']],
  bars: [['path', 'M5 19V11M12 19V5M19 19v-6']],
  person: [c(12, 8, 3.5), ['path', 'M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5']],
  // Navigation und Training
  close: [['path', 'M6 6l12 12M18 6L6 18']],
  'chevron-right': [['path', 'M9 6l6 6-6 6']],
  'chevron-left': [['path', 'M15 6l-6 6 6 6']],
  'chevron-down': [['path', 'M6 9l6 6 6-6']],
  undo: [['path', 'M9 14L4 9l5-5'], ['path', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11']],
  bulb: [['path', 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z']],
  check: [['path', 'M5 12.5l4.5 4.5L19 7.5']],
  backspace: [['path', 'M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z'], ['path', 'M12 9.5l5 5M17 9.5l-5 5']],
  'plus-minus': [['path', 'M12 4.5v8M8 8.5h8M8 18.5h8']],
  // Aktionen
  search: [c(11, 11, 6.5), ['path', 'M16 16l4 4']],
  refresh: [['path', 'M20 11a8 8 0 0 0-14.7-4.3L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.3L20 16M20 20v-4h-4']],
  chat: [['path', 'M5 18.5V6.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5L5 18.5Z']],
  // Inhalte
  calendar: [rect(4, 5, 16, 15, 3), ['path', 'M8 3v4M16 3v4M4 10h16']],
  grid: [rect(4, 4, 6.5, 6.5, 1.5), rect(13.5, 4, 6.5, 6.5, 1.5), rect(4, 13.5, 6.5, 6.5, 1.5), rect(13.5, 13.5, 6.5, 6.5, 1.5)],
  link: [['path', 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'], ['path', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1']],
  flame: [['path', 'M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.9-7.6.5 1.7 1.4 2.8 2.6 3.4.3-2.9 1.6-5.3 3.6-7.1-.1 2.9 1.3 4.6 2.5 6.4 1 1.4 1.4 2.8 1.4 4.6 0 3.8-3.1 6.5-7.5 6.5Z']],
  target: [c(12, 12, 8.5), c(12, 12, 4.5), c(12, 12, 1)],
  // Konto und Daten
  key: [c(8, 15, 4), ['path', 'M10.8 12.2L20 3M16 7l3 3M14 9l2 2']],
  sync: [['path', 'M7 18h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.5 4.5 0 0 0 7 18Z']],
  download: [['path', 'M12 4v11M7 10l5 5 5-5M5 20h14']],
  upload: [['path', 'M12 20V9M7 14l5-5 5 5M5 4h14']],
  trash: [['path', 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3']],
  sparkles: [['path', 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z'], ['path', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z']],
  info: [c(12, 12, 8.5), ['path', 'M12 11v5M12 8h.01']],
  // Ergänzungen ohne eigenes Artboard (Start, Einstellungen der Spielmodi, Bestwert)
  play: [['path', 'M7 4.5v15l12-7.5z']],
  bell: [['path', 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z'], ['path', 'M10 20.5a2.2 2.2 0 0 0 4 0']],
  gear: [c(12, 12, 3), ['path', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z']],
  trophy: [['path', 'M8 4h8v6a4 4 0 0 1-8 0z'], ['path', 'M8 6H4v1a4 4 0 0 0 4 4'], ['path', 'M16 6h4v1a4 4 0 0 1-4 4'], ['path', 'M12 14v4'], ['path', 'M8 21h8']],
} as const satisfies Record<string, readonly IconPart[]>;

export type IconName = keyof typeof ICON_SET;

/** Abweichende Strichstärken aus den Artboards (Chevrons 2, Haken 2,25). */
const ICON_STROKE: Partial<Record<IconName, number>> = { 'chevron-right': 2, 'chevron-left': 2, 'chevron-down': 2, check: 2.25 };

export function icon(name: IconName, { size = 24, strokeWidth }: { size?: number; strokeWidth?: number } = {}): SVGElement {
  const root = svgEl('svg', {
    class: `icon icon-${name}`, viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
    stroke: 'currentColor', 'stroke-width': strokeWidth ?? ICON_STROKE[name] ?? 1.75,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  });
  const parts: readonly IconPart[] = ICON_SET[name] ?? [];
  for (const [tag, d, attrs] of parts) {
    root.append(svgEl(tag, tag === 'path' ? { d } : attrs));
  }
  return root;
}

type Pt = readonly [number, number];

export interface SparklineOptions {
  /** Fläche unter der Linie (--accent-soft) */
  area?: boolean;
  /** feste Obergrenze (z. B. 1 für Anteile); Untergrenze dann 0 */
  max?: number | null;
  /** true: null ist eine Lücke; false: vorhandene Punkte werden verbunden */
  gaps?: boolean;
  /** true: y-Achse spannt nur min–max der Werte (Trend statt Nullbasis), ignoriert bei `max` */
  fit?: boolean;
  /** Seitenverhältnis über viewBox (Standard 120 × 40); gestreckt wird per CSS */
  width?: number;
  height?: number;
  /** aria-label (Standard „Verlauf“) */
  label?: string;
}

/** Linie mit optionaler Fläche (Lernkurve). Strich bleibt bei jeder Breite 2 px (vector-effect in CSS). */
export function sparkline(
  values: ReadonlyArray<number | null | undefined>,
  { area = true, max = null, gaps = false, fit = false, width = 120, height = 40, label }: SparklineOptions = {},
): SVGElement {
  const W = Math.max(8, width), H = Math.max(8, height), PAD = 3;
  const root = svgEl('svg', {
    class: 'spark', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', role: 'img', 'aria-label': label ?? t('analyse.trend'),
  });
  const vals = Array.isArray(values) ? values : [];
  const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
  const nums = vals.filter(isNum);
  if (!nums.length) return root;
  const fixedMax = max !== null && Number.isFinite(max) ? max : null;
  let hi = fixedMax ?? (fit ? Math.max(...nums) : Math.max(...nums, 1));
  let lo = fixedMax !== null ? 0 : fit ? Math.min(...nums) : Math.min(0, ...nums);
  if (fit && fixedMax === null) {
    // 10 % Luft oben und unten; flache Reihen liegen mittig
    const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.1 || 1;
    hi += pad;
    lo -= pad;
  }
  const span = hi - lo || 1;
  const n = vals.length;
  const x = (i: number): number => (n === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (n - 1));
  const y = (v: number): number => H - PAD - ((Math.min(Math.max(v, lo), hi) - lo) / span) * (H - 2 * PAD);

  // Segmente: mit gaps = true ist null eine Lücke, sonst werden die vorhandenen Punkte verbunden
  const segs: Pt[][] = [];
  let cur: Pt[] = [];
  vals.forEach((v, i) => {
    if (isNum(v)) cur.push([x(i), y(v)]);
    else if (gaps && cur.length) { segs.push(cur); cur = []; }
  });
  if (cur.length) segs.push(cur);

  const pts = (s: readonly Pt[]): string => s.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  if (area) {
    for (const s of segs) {
      const first = s[0];
      const last = s[s.length - 1];
      if (s.length < 2 || !first || !last) continue;
      const base = (H - PAD).toFixed(1);
      root.append(svgEl('path', { class: 'area', d: `M${first[0].toFixed(1)},${base} L${pts(s).replaceAll(' ', ' L')} L${last[0].toFixed(1)},${base} Z` }));
    }
  }
  for (const s of segs) {
    const first = s[0];
    if (s.length === 1 && first) {
      root.append(svgEl('circle', { class: 'dot', cx: first[0].toFixed(1), cy: first[1].toFixed(1), r: 2 }));
    } else {
      root.append(svgEl('polyline', { class: 'line', fill: 'none', points: pts(s) }));
    }
  }
  return root;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const localKey = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * Heatmap (Spalten = Wochen, Zeilen = Mo–So), 4 Stufen von --surface-2 bis --accent.
 * Tage nach `today` (YYYY-MM-DD, Standard: heute) bleiben leer (.is-future).
 */
export function heatmapGrid(
  cells: readonly HeatCell[] | null | undefined,
  { label, today }: { label?: string; today?: string } = {},
): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'heatmap';
  root.setAttribute('role', 'img');
  root.setAttribute('aria-label', label ?? t('analyse.heatmapAria'));
  const todayKey = today ?? localKey(new Date());
  const dateFmt = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
  for (const c of cells ?? []) {
    const cell = document.createElement('span');
    cell.className = 'hm-cell';
    cell.dataset['level'] = String(Math.max(0, Math.min(4, c.level | 0)));
    if (c.date && c.date > todayKey) {
      cell.classList.add('is-future');
    } else if (c.date) {
      const [y = 0, m = 1, d = 1] = c.date.split('-').map(Number);
      const day = dateFmt.format(new Date(y, m - 1, d, 12));
      cell.title = c.ms ? `${day} · ${t('analyse.minutes', { n: Math.round(c.ms / 60000) })}` : day;
    }
    root.append(cell);
  }
  return root;
}

/**
 * Fortschrittsbalken 4 px (--surface-2 / --accent). `decorative`: nur Optik (aria-hidden), wenn ein Text daneben
 * den Wert nennt; sonst role=progressbar mit optionalem aria-label.
 */
export function progressBar(value0to100: number, { label, decorative = false }: { label?: string; decorative?: boolean } = {}): HTMLDivElement {
  const v = Number.isFinite(value0to100) ? Math.max(0, Math.min(100, value0to100)) : 0;
  const root = document.createElement('div');
  root.className = 'progress';
  if (decorative) {
    root.setAttribute('aria-hidden', 'true');
  } else {
    root.setAttribute('role', 'progressbar');
    root.setAttribute('aria-valuemin', '0');
    root.setAttribute('aria-valuemax', '100');
    root.setAttribute('aria-valuenow', String(Math.round(v)));
    if (label) root.setAttribute('aria-label', label);
  }
  const bar = document.createElement('span');
  bar.className = 'progress-bar';
  bar.style.setProperty('--w', String(v));
  root.append(bar);
  return root;
}

export function confetti(): HTMLDivElement {
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

