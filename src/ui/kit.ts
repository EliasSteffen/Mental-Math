// UI-Kit „Ruhiger Fokus“: die Bausteine aus components.css als DOM (nur h()/svg(), kein innerHTML, keine style-Attribute).
// Views bauen diese Muster nie selbst nach. Eingaben (segmented, switchRow, stepper, fold) aktualisieren sich lokal
// (aria-pressed/aria-checked/aria-expanded) und rufen onChange – nie rerender(), damit die Seite nicht springt.
// segmented und switchRow liefern ein Handle ({ el, set, setHelp, setDisabled }), damit Views sie von außen
// nachführen können, ohne sie neu zu bauen.
import { appendChildren, h, svg, type Child } from './dom.ts';
import { icon as iconFromSet, type IconName } from './charts.ts';
import { t } from '../i18n/index.ts';

export type { IconName } from './charts.ts';
export type Mastery = 'full' | 'half' | 'empty';

const MASTERY_KEY: Record<Mastery, 'common.masteryFull' | 'common.masteryHalf' | 'common.masteryEmpty'> = {
  full: 'common.masteryFull', half: 'common.masteryHalf', empty: 'common.masteryEmpty',
};

let uid = 0;
const nextId = (prefix: string): string => `${prefix}-${++uid}`;

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** Anteil 0–1 → CSS-Variable --w (0–100) für Breiten und scaleX. */
function setW(el: HTMLElement, fraction: number): void {
  el.style.setProperty('--w', String(Math.round(clamp01(fraction) * 1000) / 10));
}

/** Text mit Platzhalter {n}: der Wert wird als hervorgehobene Zahl eingesetzt. */
function withNum(template: string, value: string): HTMLSpanElement {
  const i = template.indexOf('{n}');
  const before = i < 0 ? template + ' ' : template.slice(0, i);
  const after = i < 0 ? '' : template.slice(i + 3);
  return h('span', null, before, h('span', { class: 'num status-strong' }, value), after);
}

const dot = (): HTMLSpanElement => h('span', { 'aria-hidden': 'true' }, '·');

/** Klassenliste aus Teilen (leere fallen weg). */
const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

/** Link-Ziel: externe Links (target) bekommen rel="noopener". */
const linkAttrs = (target: string | undefined): Record<string, string | null> =>
  target ? { target, rel: 'noopener' } : { target: null, rel: null };

/* ---------- Icons ---------- */

/** Strich-Icon (1,75; Chevrons 2), immer aria-hidden. */
export function icon(name: IconName, size = 24): SVGElement {
  return iconFromSet(name, { size });
}

/* ---------- Struktur ---------- */

/** Large Title einer Tab-Seite; `sub` steht klein darüber (Datum, „Letzte 7 Tage“ …). */
export function largeTitle(title: string, sub?: string): HTMLElement {
  return h('header', { class: 'large-title' },
    sub ? h('p', { class: 'large-title-sub' }, sub) : null,
    h('h1', null, title));
}

/** Zurück-Link über dem Large Title (Detailseiten); als erstes Kind von .screen rückt er in den oberen Rand. */
export function backLink(o: { label: string; href: string; ariaLabel?: string }): HTMLAnchorElement {
  return h('a', { class: 'back-link press', href: o.href, 'aria-label': o.ariaLabel ?? null },
    icon('chevron-left', 20), h('span', null, o.label));
}

/** Gruppentitel mit optionaler Zusatzangabe rechts (z. B. „Skill 62“, „falsche zuerst“). */
export interface GroupTitle { title: string; meta?: string }

/** Abschnitt mit Titel (.group-title) und Inhalt; title = null für einen Abschnitt ohne Überschrift. */
export function group(title: string | GroupTitle | null, ...children: Child[]): HTMLElement {
  const head = typeof title === 'string' ? { title } : title;
  if (!head) return h('section', { class: 'group' }, ...children);
  const id = nextId('group');
  const heading = h('h2', { class: 'group-title', id }, head.title);
  return h('section', { class: 'group', 'aria-labelledby': id },
    head.meta ? h('div', { class: 'group-head' }, heading, h('p', { class: 'group-meta' }, head.meta)) : heading,
    ...children);
}

/** Karte mit Zeilen und Trennlinien. Kinder: row(), segmented().el, switchRow().el, stepper() oder eigene Blöcke. */
export function list(rows: Child[]): HTMLElement {
  return h('div', { class: 'list' }, ...rows);
}

export interface RowOptions {
  icon?: IconName;
  /** Element vor dem Text statt eines Icons (Meisterungs-Punkt, Status-Punkt); darf Text für Screenreader enthalten */
  leading?: Node;
  label: string;
  sub?: string;
  /** Dritte, kleine Zeile unter `sub` (z. B. Rechenweg einer Kette) */
  note?: string;
  /** Label und Unterzeile in Zahlenschrift (Aufgaben, Ergebnisse) */
  numeric?: boolean;
  value?: string;
  /** Standard 'muted'; 'accent' für Hinweise wie „heute offen“ */
  valueTone?: 'accent' | 'muted';
  href?: string;
  /** Ziel externer Links ('_blank'); setzt rel="noopener" */
  target?: string;
  onClick?: () => void;
  /** Standard: true bei href, sonst false */
  chevron?: boolean;
  tone?: 'danger';
  trailing?: Node;
  /** Zusätzliche Klassen */
  class?: string;
  /** Zusätzliche Attribute, z. B. { 'aria-haspopup': 'dialog' } */
  attrs?: Record<string, string>;
}

/** Listenzeile: <a> mit href, <button> mit onClick, sonst <div>. */
export function row(o: RowOptions): HTMLElement {
  const interactive = Boolean(o.href || o.onClick);
  const cls = cx('row', (o.sub || o.note) && 'has-sub', o.tone === 'danger' && 'is-danger', interactive && 'press', o.class);
  const num = o.numeric ? ' num' : '';
  const children: Child[] = [
    o.leading ? h('span', { class: 'row-lead' }, o.leading) : null,
    !o.leading && o.icon ? h('span', { class: 'row-icon' }, icon(o.icon, 22)) : null,
    h('span', { class: 'row-text' },
      h('span', { class: `row-label${num}` }, o.label),
      o.sub ? h('span', { class: `row-sub${num}` }, o.sub) : null,
      o.note ? h('span', { class: `row-note${num}` }, o.note) : null),
    o.value ? h('span', { class: `row-value${o.valueTone === 'accent' ? ' is-accent' : ''}` }, o.value) : null,
    o.trailing ?? null,
    (o.chevron ?? Boolean(o.href)) ? h('span', { class: 'row-chevron' }, icon('chevron-right', 18)) : null,
  ];
  const onclick = o.onClick ? (): void => o.onClick?.() : null;
  const el = o.href
    ? h('a', { class: cls, href: o.href, ...linkAttrs(o.target), onclick }, ...children)
    : o.onClick
      ? h('button', { type: 'button', class: cls, onclick }, ...children)
      : h('div', { class: cls }, ...children);
  for (const [k, v] of Object.entries(o.attrs ?? {})) el.setAttribute(k, v);
  return el;
}

/** Status-Punkt (8 px, richtig/falsch) mit „Richtig: “/„Falsch: “ für Screenreader. */
export function statusDot(ok: boolean): HTMLElement {
  return h('span', { class: 'status-dot-wrap' },
    h('span', { class: `status-dot ${ok ? 'is-good' : 'is-bad'}`, 'aria-hidden': 'true' }),
    h('span', { class: 'sr-only' }, `${t(ok ? 'common.correct' : 'common.wrong')}: `));
}

/** Ergebniszeile (Runde, Ketten): Status-Punkt, Aufgabe, darunter deine/richtige Antwort; optional antippbar. */
export function resultRow(o: {
  ok: boolean; label: string; sub?: string; note?: string; onClick?: () => void; numeric?: boolean;
}): HTMLElement {
  return row({
    leading: statusDot(o.ok), label: o.label, sub: o.sub, note: o.note, numeric: o.numeric ?? true,
    onClick: o.onClick, chevron: Boolean(o.onClick), class: 'is-result',
  });
}

/** Karte (.card) oder Hero-Karte (.card.hero mit --hero-bg); optional mit Kopf (Titel links, Zusatz rechts). */
export function card(children: Child[], o: {
  hero?: boolean;
  /** aria-label der Region */
  label?: string;
  /** Kartentitel (h3) */
  title?: string;
  /** Zusatz rechts neben dem Titel (z. B. „Ziel 15 min“) */
  meta?: Child;
  class?: string;
} = {}): HTMLElement {
  const cls = cx('card', o.hero && 'hero', o.class);
  const titleId = o.title && !o.label ? nextId('card') : null;
  const head = o.title
    ? h('div', { class: 'card-head' },
      h('h3', { class: 'card-title', id: titleId }, o.title),
      o.meta !== undefined && o.meta !== null ? h('p', { class: 'card-meta' }, o.meta) : null)
    : null;
  if (o.label) return h('section', { class: cls, 'aria-label': o.label }, head, ...children);
  if (titleId) return h('section', { class: cls, 'aria-labelledby': titleId }, head, ...children);
  return h('div', { class: cls }, ...children);
}

/** Erkenntnis: Icon im Soft-Kreis, Titel, Text. `outline`: ohne eigene Fläche, nur Kontur (in Sheets und Folds). */
export function insight(o: {
  icon: IconName; tone: 'warn' | 'good' | 'accent' | 'bad'; title: string; text: string; outline?: boolean;
}): HTMLElement {
  return h('div', { class: `insight${o.outline ? ' is-outline' : ''}` },
    h('span', { class: `insight-icon is-${o.tone}` }, icon(o.icon, 20)),
    h('div', { class: 'insight-body' },
      h('p', { class: 'insight-title' }, o.title),
      h('p', { class: 'insight-text' }, o.text)));
}

/** KPI-Zeile als <dl>; Werte stehen optisch über den Labels, für Screenreader „Label: Wert“. */
export function kpis(items: Array<{ label: string; value: string }>): HTMLDListElement {
  const el = h('dl', { class: 'kpis' },
    items.map((k) => h('div', null, h('dt', null, k.label), h('dd', { class: 'num' }, k.value))));
  el.style.setProperty('--n', String(Math.max(1, items.length)));
  return el;
}

/** Status Line: Mini-Ring, „9 / 15 min heute“, optional „· 4 Tage Serie“ (nur > 0) und „· +86 XP“. */
export function statusLine(o: { todayMin: number; goalMin: number; streak?: number; xp?: number }): HTMLElement {
  const today = Math.max(0, Math.round(o.todayMin));
  const goal = Math.max(0, Math.round(o.goalMin));
  const parts: Child[] = [
    miniRing(goal > 0 ? today / goal : 0),
    withNum(t('common.statusToday'), t('common.minOfGoal', { done: today, goal })),
  ];
  if (o.streak !== undefined && o.streak > 0) {
    parts.push(dot(),
      h('span', { class: 'status-streak' }, icon('flame', 16)),
      withNum(t(o.streak === 1 ? 'common.streakOne' : 'common.streakMany'), String(o.streak)));
  }
  if (o.xp !== undefined) parts.push(dot(), withNum(t('common.xpGain'), `${o.xp >= 0 ? '+' : ''}${o.xp}`));
  return h('p', { class: 'status-line' }, ...parts);
}

/* ---------- Eingaben (lokal aktualisiert, nie rerender) ---------- */

/** Hilfetext eines Controls: liegt im Text-Block (inline) bzw. unter dem Control; wird bei Bedarf angelegt. */
function helpSlot(o: { text?: string; describe: HTMLElement }): {
  el: HTMLElement | null; set(text: string, mount: (help: HTMLElement) => void): void;
} {
  let el: HTMLElement | null = null;
  const make = (text: string): HTMLElement => {
    const help = h('p', { class: 'control-help', id: nextId('help'), 'aria-live': 'polite' }, text);
    o.describe.setAttribute('aria-describedby', help.id);
    return help;
  };
  if (o.text) el = make(o.text);
  return {
    get el() { return el; },
    set(text, mount) {
      if (el) { el.textContent = text; return; }
      el = make(text);
      mount(el);
    },
  };
}

export interface SegmentedOptions<V extends string> {
  label: string;
  options: ReadonlyArray<readonly [V, string]>;
  value: V;
  onChange: (v: V) => void;
  /** Label links, kompakte Segmente rechts (z. B. Rundenlänge, Sprache) */
  inline?: boolean;
  /** Inline: alle Felder gleich breit (Rundenlänge, Tastenfeld) */
  even?: boolean;
  /** Beschriftungen in Zahlenschrift */
  numeric?: boolean;
  /** Label nur für Screenreader (z. B. Ansichtsumschalter in Fortschritt) */
  hideLabel?: boolean;
  /** Hilfetext unter den Segmenten (änderbar über setHelp) */
  help?: string;
  disabled?: boolean;
}

export interface SegmentedControl<V extends string> {
  el: HTMLElement;
  /** Auswahl von außen setzen (ruft onChange nicht) */
  set(value: V): void;
  /** Hilfetext ersetzen (wird vorgelesen, aria-live) */
  setHelp(text: string): void;
  setDisabled(disabled: boolean): void;
}

/**
 * Segment-Control (.control > .segmented[role=group] > button[aria-pressed]). Ab 4 Optionen (nicht inline) dichter
 * (.is-dense): Spalten nach Inhalt, keine Silbentrennung, unter 360 px kleinere Schrift.
 */
export function segmented<V extends string>(o: SegmentedOptions<V>): SegmentedControl<V> {
  const labelId = nextId('seg');
  let current = o.value;
  let buttons: HTMLButtonElement[] = [];
  const paint = (): void => {
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(o.options[i]?.[0] === current)));
  };
  buttons = o.options.map(([value, text]) => h('button', {
    type: 'button', class: 'press', 'aria-pressed': String(value === current), disabled: o.disabled === true,
    onclick: () => {
      if (value === current) return;
      current = value;
      paint();
      o.onChange(value);
    },
  }, text));
  const dense = !o.inline && o.options.length >= 4;
  const seg = h('div', {
    class: cx('segmented', dense && 'is-dense', o.numeric && 'num'), role: 'group', 'aria-labelledby': labelId,
  }, ...buttons);
  seg.style.setProperty('--n', String(Math.max(1, o.options.length)));
  const label = h('p', { class: `control-label${o.hideLabel ? ' sr-only' : ''}`, id: labelId }, o.label);
  const help = helpSlot({ text: o.help, describe: seg });
  const text = o.inline ? h('div', { class: 'control-text' }, label, help.el) : null;
  const el = o.inline
    ? h('div', { class: cx('control is-inline', o.even && 'is-even', help.el && 'has-help') }, text, seg)
    : h('div', { class: 'control' }, label, seg, help.el);
  return {
    el,
    set(value) {
      current = value;
      paint();
    },
    setHelp(value) {
      help.set(value, (p) => {
        if (text) { text.append(p); el.classList.add('has-help'); } else el.append(p);
      });
    },
    setDisabled(disabled) {
      for (const b of buttons) b.disabled = disabled;
    },
  };
}

export interface SwitchControl {
  el: HTMLElement;
  /** Zustand von außen setzen (ruft onChange nicht) */
  set(checked: boolean): void;
  setDisabled(disabled: boolean): void;
  setHelp(text: string): void;
}

/** Zeile mit Switch (51 × 31, role=switch). Das Label ist mit dem Switch verknüpft und ebenfalls klickbar. */
export function switchRow(o: {
  label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}): SwitchControl {
  const id = nextId('switch');
  let on = o.checked;
  const sw: HTMLButtonElement = h('button', {
    type: 'button', class: 'switch', role: 'switch', id, 'aria-checked': String(on), disabled: o.disabled === true,
    onclick: () => {
      on = !on;
      sw.setAttribute('aria-checked', String(on));
      o.onChange(on);
    },
  }, h('span', { class: 'switch-knob', 'aria-hidden': 'true' }));
  const help = helpSlot({ text: o.help, describe: sw });
  const text = h('div', { class: 'control-text' }, h('label', { class: 'control-label', for: id }, o.label), help.el);
  const el = h('div', { class: `control is-inline${help.el ? ' has-help' : ''}` }, text, sw);
  return {
    el,
    set(checked) {
      on = checked;
      sw.setAttribute('aria-checked', String(on));
    },
    setDisabled(disabled) { sw.disabled = disabled; },
    setHelp(value) {
      help.set(value, (p) => { text.append(p); el.classList.add('has-help'); });
    },
  };
}

/** Stepper (− / Wert / +). Grenzen per aria-disabled, damit der Fokus auf dem Button bleibt. */
export function stepper(o: {
  label: string; value: number; min: number; max: number; step: number;
  format: (n: number) => string; onChange: (n: number) => void;
}): HTMLElement {
  const labelId = nextId('stepper');
  const clamp = (n: number): number => Number(Math.min(o.max, Math.max(o.min, n)).toFixed(6));
  let value = clamp(o.value);
  const out = h('output', { class: 'stepper-value num', 'aria-live': 'polite' }, o.format(value));
  const btn = (dir: -1 | 1): HTMLButtonElement => h('button', {
    type: 'button', class: 'stepper-btn press',
    'aria-label': t(dir < 0 ? 'common.decrease' : 'common.increase', { label: o.label }),
    onclick: () => set(value + dir * o.step),
  }, dir < 0 ? '−' : '+');
  const dec = btn(-1);
  const inc = btn(1);
  function paint(): void {
    dec.setAttribute('aria-disabled', String(value <= o.min));
    inc.setAttribute('aria-disabled', String(value >= o.max));
  }
  function set(n: number): void {
    const next = clamp(n);
    if (next === value) return;
    value = next;
    out.textContent = o.format(value);
    paint();
    o.onChange(value);
  }
  paint();
  return h('div', { class: 'control is-inline' },
    h('p', { class: 'control-label', id: labelId }, o.label),
    h('div', { class: 'stepper', role: 'group', 'aria-labelledby': labelId }, dec, out, inc));
}

/** Chip (Link/Button/Text) mit optionalem Meisterungs-Punkt; die Stufe wird für Screenreader mitgelesen. */
export function chip(o: { label: string; href?: string; onClick?: () => void; mastery?: Mastery }): HTMLElement {
  const kids: Child[] = [
    o.mastery ? masteryDot(o.mastery) : null,
    o.label,
    o.mastery ? h('span', { class: 'sr-only' }, `, ${t(MASTERY_KEY[o.mastery])}`) : null,
  ];
  const onclick = o.onClick ? (): void => o.onClick?.() : null;
  if (o.href) return h('a', { class: 'chip press', href: o.href, onclick }, ...kids);
  if (o.onClick) return h('button', { type: 'button', class: 'chip press', onclick }, ...kids);
  return h('span', { class: 'chip' }, ...kids);
}

/** Horizontaler Chip-Scroller (läuft bis an den Bildschirmrand); `wrap`: ab 768 px umbrechen statt scrollen. */
export function chips(items: HTMLElement[], o: { wrap?: boolean } = {}): HTMLElement {
  return h('div', { class: `chips${o.wrap ? ' is-wrap' : ''}` }, ...items);
}

/** Suchfeld (label.search mit Icon, verstecktem Label und input[type=search]). */
export function searchField(o: { label: string; placeholder: string; onInput: (q: string) => void }): HTMLLabelElement {
  const input = h('input', {
    type: 'search', placeholder: o.placeholder, autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
  });
  input.addEventListener('input', () => o.onInput(input.value));
  return h('label', { class: 'search' }, icon('search', 20), h('span', { class: 'sr-only' }, o.label), input);
}

/** Aufklappbarer Abschnitt (.fold): Kopf-Button mit aria-expanded, Inhalt blendet mit .rise ein. */
export function fold(o: { label: string; open?: boolean; children: Child[] }): HTMLElement {
  const bodyId = nextId('fold');
  let open = o.open ?? false;
  const body = h('div', { class: 'fold-body rise', id: bodyId, hidden: !open });
  appendChildren(body, o.children);
  const head: HTMLButtonElement = h('button', {
    type: 'button', class: 'fold-head press', 'aria-expanded': String(open), 'aria-controls': bodyId,
    onclick: () => {
      open = !open;
      head.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
    },
  }, h('span', null, o.label), h('span', { class: 'fold-chevron' }, icon('chevron-down', 18)));
  return h('div', { class: 'fold' }, head, body);
}

/** Nummerierte Schritte (Lösungsweg, Methode); Nummern per CSS-Zähler. */
export function steps(items: readonly Child[]): HTMLOListElement {
  return h('ol', { class: 'steps' }, items.map((s) => h('li', null, s)));
}

/* ---------- Fortschritt & Status ---------- */

/** Meisterung aus dem Score (E8): ≥ 70 voll, 40–69 halb, sonst (auch ohne Daten) leer. */
export function masteryOf(score: number | null | undefined): Mastery {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'empty';
  if (score >= 70) return 'full';
  if (score >= 40) return 'half';
  return 'empty';
}

/** Meisterungs-Punkt 10 × 10 (voll, halb, leer), Farbe --accent, aria-hidden. */
export function masteryDot(m: Mastery): SVGElement {
  const root = svg('svg', { class: `mastery is-${m}`, width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': 'true', focusable: 'false' });
  if (m === 'full') {
    root.append(svg('circle', { cx: 5, cy: 5, r: 4.25, fill: 'currentColor' }));
  } else {
    root.append(svg('circle', { cx: 5, cy: 5, r: 4, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
    if (m === 'half') root.append(svg('path', { d: 'M5 1a4 4 0 0 1 0 8Z', fill: 'currentColor' }));
  }
  return root;
}

/** Meisterungs-Punkt mit der Stufe als Text für Screenreader davor („sicher, …“) – für row({ leading }) und Statuszeilen. */
export function masteryMark(m: Mastery): HTMLElement {
  return h('span', { class: 'mastery-mark' }, masteryDot(m), h('span', { class: 'sr-only' }, `${t(MASTERY_KEY[m])}, `));
}

/**
 * Segment-Fortschritt im Trainingskopf (10 Segmente à 4 px). `set(done, current)`: Segmente < done sind erledigt,
 * Segment `done` ist mit current = true die laufende Aufgabe. Über 20 Aufgaben ein durchgehender Balken (E12).
 */
export function segments(o: { total: number; done: number; current?: boolean }): {
  el: HTMLElement; set(done: number, current: boolean): void;
} {
  const total = Math.max(1, Math.floor(o.total));
  const el = h('div', { class: 'segments', role: 'img' });
  const norm = (done: number): number => Math.max(0, Math.min(total, Math.floor(done)));
  const label = (d: number): void => el.setAttribute('aria-label', t('common.segmentsAria', { done: d, total }));
  let set: (done: number, current: boolean) => void;
  if (total > 20) {
    el.classList.add('is-bar');
    const fill = h('span', { class: 'seg-fill' });
    el.append(fill);
    set = (done) => {
      const d = norm(done);
      setW(fill, d / total);
      label(d);
    };
  } else {
    el.style.setProperty('--n', String(total));
    const segs = Array.from({ length: total }, () => h('span', { class: 'seg' }));
    el.append(...segs);
    set = (done, current) => {
      const d = norm(done);
      segs.forEach((s, i) => {
        s.classList.toggle('is-done', i < d);
        s.classList.toggle('is-current', current && i === d);
      });
      label(d);
    };
  }
  set(o.done, o.current ?? false);
  return { el, set };
}

/** Ergebnis-Segmente (8 px, richtig/falsch) mit Zusammenfassung als aria-label. */
export function resultSegments(results: readonly boolean[]): HTMLElement {
  const good = results.filter(Boolean).length;
  const el = h('div', {
    class: `segments is-result${results.length > 20 ? ' is-many' : ''}`, role: 'img',
    'aria-label': t('common.resultAria', { good, bad: results.length - good }),
  }, results.map((ok) => h('span', { class: `seg ${ok ? 'is-good' : 'is-bad'}` })));
  el.style.setProperty('--n', String(Math.max(1, results.length)));
  return el;
}

/** Zeitlinie (2 px): set(Anteil bis zur Zielzeit, über Zielzeit?). Ab der Zielzeit einmal weich nach Ocker. */
export function timeLine(): { el: HTMLElement; set(fraction: number, over: boolean): void } {
  const fill = h('span', { class: 'timeline-fill' });
  const el = h('div', { class: 'timeline', 'aria-hidden': 'true' }, fill);
  return {
    el,
    set(fraction: number, over: boolean): void {
      setW(fill, fraction);
      el.classList.toggle('is-over', over);
    },
  };
}

/** Mini-Ring 20 × 20 (Tagesziel), aria-hidden – der Text daneben trägt die Information. */
export function miniRing(fraction: number): SVGElement {
  const r = 8.5;
  const circ = 2 * Math.PI * r;
  const f = clamp01(fraction);
  const root = svg('svg', { class: 'mini-ring', width: 20, height: 20, viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' });
  root.append(svg('circle', { class: 'mini-ring-track', cx: 10, cy: 10, r, 'stroke-width': 3 }));
  if (f > 0) {
    root.append(svg('circle', {
      class: 'mini-ring-value', cx: 10, cy: 10, r, 'stroke-width': 3, 'stroke-linecap': 'round',
      'stroke-dasharray': circ.toFixed(2), 'stroke-dashoffset': (circ * (1 - f)).toFixed(2),
    }));
  }
  return root;
}

/** Balkenliste (genau ein Muster): Label · Balken · Wert. Ton 'warn'/'bad' färbt den Balken. */
export function barList(items: Array<{ label: string; value: number; max: number; text: string; tone?: 'accent' | 'warn' | 'bad' }>): HTMLElement {
  return h('ul', { class: 'bar-list' }, items.map((it) => {
    const fill = h('span', { class: 'bar-list-fill' });
    setW(fill, it.max > 0 ? it.value / it.max : 0);
    return h('li', { class: it.tone && it.tone !== 'accent' ? `is-${it.tone}` : null },
      h('span', { class: 'bar-list-label' }, it.label),
      h('span', { class: 'bar-list-track', 'aria-hidden': 'true' }, fill),
      h('span', { class: 'bar-list-value' }, it.text));
  }));
}

/* ---------- Rückmeldung ---------- */

export type FeedbackTone = 'good' | 'bad' | 'skip';

const FEEDBACK_ICON: Record<FeedbackTone, IconName> = { good: 'check', bad: 'undo', skip: 'bulb' };

/**
 * Kopf einer Rückmeldung (Feedback-Sheet im Training und in den Spielmodi): Icon im Soft-Kreis (Haken, Korrektur,
 * Glühbirne), Titel, Detail (Zahlenschrift) und optional ein dezenter Hinweis. `live`: als Live-Region ansagen.
 */
export function feedbackHead(o: { tone: FeedbackTone; title: string; detail?: string; note?: string; live?: boolean }): HTMLElement {
  return h('div', { class: 'fb-head', 'aria-live': o.live ? 'polite' : null },
    h('span', { class: `fb-icon is-${o.tone}` }, icon(FEEDBACK_ICON[o.tone], 22)),
    h('div', { class: 'fb-text' },
      h('p', { class: 'fb-title' }, o.title),
      o.detail ? h('p', { class: 'fb-detail num' }, o.detail) : null,
      o.note ? h('p', { class: 'fb-note' }, o.note) : null));
}

/* ---------- Aktionen ---------- */

export interface ButtonOptions {
  label: string;
  /** Standard 'outline' */
  kind?: 'primary' | 'soft' | 'outline' | 'link' | 'quiet';
  icon?: IconName;
  href?: string;
  /** Ziel externer Links ('_blank'); setzt rel="noopener" */
  target?: string;
  onClick?: () => void;
  full?: boolean;
  /** Zusatz nach einem Mittelpunkt, z. B. „ca. 4 min“ → „Jetzt üben · ca. 4 min“ */
  meta?: string;
  /** Gloss + einmaliger Glanz (.cta); Standard: true bei 'primary' */
  cta?: boolean;
  /** Destruktive Aktion (Text in --bad) */
  tone?: 'danger';
  /** Nur Buttons: gesperrt (Links haben keinen gesperrten Zustand) */
  disabled?: boolean;
  /** Nur Buttons: 'submit' in Formularen */
  type?: 'button' | 'submit';
}

/** Button oder Link-Button (.btn + Art). Primär: 56 px, --cta-bg, --cta-shadow. Mit href ein <a>, sonst ein <button>. */
export function button(o: ButtonOptions & { href: string }): HTMLAnchorElement;
export function button(o: ButtonOptions & { href?: undefined }): HTMLButtonElement;
export function button(o: ButtonOptions): HTMLAnchorElement | HTMLButtonElement;
export function button(o: ButtonOptions): HTMLAnchorElement | HTMLButtonElement {
  const kind = o.kind ?? 'outline';
  const cta = o.cta ?? kind === 'primary';
  const cls = cx('btn', kind, 'press', cta && 'cta', o.full && 'is-full', o.tone === 'danger' && 'danger');
  const kids: Child[] = [
    o.icon ? icon(o.icon, kind === 'primary' ? 20 : 18) : null,
    h('span', { class: 'btn-label' }, o.label),
    o.meta ? h('span', { class: 'btn-meta' }, `· ${o.meta}`) : null,
  ];
  const onclick = o.onClick ? (): void => o.onClick?.() : null;
  if (o.href) return h('a', { class: cls, href: o.href, ...linkAttrs(o.target), onclick }, ...kids);
  return h('button', { type: o.type ?? 'button', class: cls, disabled: o.disabled === true, onclick }, ...kids);
}

/** Beschriftung eines Kit-Buttons ändern (Icon und Zusatz bleiben stehen). */
export function setButtonLabel(btn: HTMLElement, label: string): void {
  const el = btn.querySelector('.btn-label');
  if (el) el.textContent = label;
  else btn.textContent = label;
}

/* ---------- Fokus-Modus ---------- */

export interface FocusHeadOptions {
  /** aria-label des ✕ (Standard: „Beenden“) */
  closeLabel?: string;
  /** Ziel des ✕ als Link (Standard '#/', wenn kein onClose) */
  href?: string;
  onClose?: () => void;
  /** Titel neben dem ✕ (Spielmodi); im Training stehen dort die Segmente */
  title?: string;
  /** Kurzer Titel unter 360 px Breite (der volle bleibt für Screenreader), z. B. „Parallel“ */
  shortTitle?: string;
  /** Weitere Elemente in der Kopfzeile (Segmente, Zeitangabe) */
  children?: Child[];
}

/** Kopf im Fokus-Modus: ✕ links, daneben Titel/Segmente. Die Zeitlinie hängt der Aufrufer an den Header an. */
export function focusHead(o: FocusHeadOptions = {}): HTMLElement {
  const label = o.closeLabel ?? t('common.exitFocus');
  const href = o.href ?? (o.onClose ? undefined : '#/');
  const onclick = o.onClose ? (): void => o.onClose?.() : null;
  const close = href
    ? h('a', { class: 'focus-close press', href, 'aria-label': label, onclick }, icon('close', 24))
    : h('button', { type: 'button', class: 'focus-close press', 'aria-label': label, onclick }, icon('close', 24));
  const title = o.title
    ? h('h1', { class: `focus-title${o.shortTitle ? ' has-short' : ''}` },
      o.shortTitle
        ? [h('span', { class: 'focus-title-full' }, o.title), h('span', { class: 'focus-title-short', 'aria-hidden': 'true' }, o.shortTitle)]
        : o.title)
    : null;
  return h('header', { class: 'focus-head' },
    h('div', { class: 'focus-bar' }, close, title, ...(o.children ?? [])));
}
