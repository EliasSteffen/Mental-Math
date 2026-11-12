// Oberfläche des Rundgangs: Textkarte mit Bedienleiste, Spotlight und Touch-Punkt (bei Maus ein Zeiger, public/css/views/tour.css).
// Liegt über allem, fängt selbst keine Tipps außer auf der Karte. Das Ziel wird in jedem Frame neu gesucht: Drehen,
// Scrollen und Neuzeichnen verschieben es jederzeit. Der Rundgang öffnet bewusst keine modalen Dialoge (Top-Layer läge darüber).
// Die Karte steht neben der hervorgehobenen Stelle und zeigt mit einem Pfeil darauf (core/tour-card.ts); Karte und
// Spotlight gleiten gemeinsam zum nächsten Ziel. Zwischen zwei Texten (Tippen, Seitenwechsel) bleibt die Karte stehen.
import { h } from './dom.ts';
import { icon, type IconName } from './kit.ts';
import { t } from '../i18n/index.ts';
import {
  arrowOffset, edgePlacement, glide, holdPlacement, keepClear, placeBeside, type Box, type CardPlacement, type Size,
} from '../core/tour-card.ts';

export interface TourOverlayOptions {
  /** Aufnahme fürs Store-Video: nur Text und Touch-Punkt */
  record: boolean;
  /** Aufnahme der Screenshots: ohne Abdunklung und Touch-Punkt */
  shots: boolean;
  chapters: number;
  onPause(): void;
  onBack(): void;
  onNext(): void;
  onSkip(): void;
}

export interface TourOverlay {
  setChapter(index: number, title: string): void;
  say(text: string): void;
  setPaused(paused: boolean): void;
  /** Spotlight auf das erste sichtbare Element, die Karte daneben; null nimmt es weg (die Karte bleibt stehen) */
  spot(selector: string | null): void;
  /** Kein Ziel: Spotlight weg, Karte gleitet an ihren Ruheplatz unten */
  rest(): void;
  /** Touch-Punkt auf das erste sichtbare Element; null nimmt ihn weg */
  point(selector: string | null, fast?: boolean): void;
  /** Dieses Element (z. B. das Antwortfeld) verdeckt die Karte nicht; null hebt es auf */
  clear(selector: string | null): void;
  press(down: boolean): void;
  destroy(): void;
}

/** Erstes sichtbares Element außerhalb der Rundgang-Oberfläche. */
export function firstVisible(selector: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    if (!el.closest('.tour-ui') && el.getClientRects().length > 0) return el;
  }
  return null;
}

/** Rand des Spotlights um das Ziel (px, wie in tour.css) */
const SPOT_PAD = 6;
/** So viel Luft hält die Karte um Touch-Punkt und Freizuhaltendes (px) */
const CLEAR_PAD = 10;
/** Ab dieser Restentfernung (px) gilt die Karte als angekommen: dann erscheint der Pfeil */
const ARRIVED_PX = 6;

interface Spring { x: number; y: number; vx: number; vy: number }
interface SpotSpring extends Spring { w: number; h: number; vw: number; vh: number }

export function createTourOverlay(o: TourOverlayOptions): TourOverlay {
  const iconBtn = (name: IconName, label: string, onclick: () => void): HTMLButtonElement =>
    h('button', { type: 'button', class: 'tour-icon press', 'aria-label': label, onclick }, icon(name, 22));

  const chapter = h('p', { class: 'tour-chapter' });
  const text = h('p', { class: 'tour-text', 'aria-live': 'polite' });
  const dots = h('div', { class: 'tour-dots', 'aria-hidden': 'true' },
    ...Array.from({ length: o.chapters }, () => h('span', { class: 'tour-dot' })));
  const pause = iconBtn('pause', t('tour.pause'), o.onPause);
  const bar = h('div', { class: 'tour-bar' },
    dots,
    iconBtn('chevron-left', t('tour.back'), o.onBack),
    pause,
    iconBtn('chevron-right', t('tour.next'), o.onNext),
    h('button', { type: 'button', class: 'tour-skip press', onclick: o.onSkip }, t('tour.skip')));
  const arrow = h('span', { class: 'tour-arrow', 'aria-hidden': 'true' });
  const card = h('section', { class: 'tour-card', 'aria-label': t('tour.label') }, arrow, chapter, text, o.record ? null : bar);
  // Bühne: Sichtbereich ohne Rand und Safe Area – darin bewegt sich die Karte
  const stage = h('div', { class: 'tour-stage' }, card);
  const spotEl = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
  const pointEl = h('div', { class: 'tour-point', 'aria-hidden': 'true' });
  // Touch-Punkt zuletzt: liegt notfalls über der Karte statt unter ihr
  const root = h('div', { class: `tour-ui${o.record ? ' is-record' : ''}${o.shots ? ' is-shots' : ''}` }, spotEl, stage, pointEl);
  document.body.append(root);

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let spotSel: string | null = null;
  let pointSel: string | null = null;
  let clearSel: string | null = null;
  /** Ohne Spotlight: Karte bleibt, wo sie ist (hold), oder geht an den Ruheplatz (rest) */
  let idle: 'hold' | 'rest' = 'rest';
  let goal: CardPlacement | null = null;
  let cardAt: Spring | null = null;
  let spotAt: SpotSpring | null = null;
  let raf = 0;
  let last = 0;

  /** Rechteck als CSS-Variablen; keine Inline-Styles außer Variablen (CSP). */
  function setVars(node: HTMLElement, vars: Record<string, number>): void {
    for (const [k, v] of Object.entries(vars)) node.style.setProperty(`--${k}`, String(Math.round(v)));
  }

  function placeEl(el: HTMLElement, node: HTMLElement): void {
    const r = el.getBoundingClientRect();
    setVars(node, { x: r.left, y: r.top, w: r.width, h: r.height });
  }

  /** Spotlight gleitet mit der Karte (gleiche Feder); erscheint es neu, startet es dort, wo es zuletzt war. true = angekommen. */
  function moveSpot(r: DOMRect, dt: number): boolean {
    const s = spotAt;
    if (!s || reduced) {
      spotAt = { x: r.left, y: r.top, w: r.width, h: r.height, vx: 0, vy: 0, vw: 0, vh: 0 };
    } else {
      [s.x, s.vx] = glide(s.x, s.vx, r.left, dt);
      [s.y, s.vy] = glide(s.y, s.vy, r.top, dt);
      [s.w, s.vw] = glide(s.w, s.vw, r.width, dt);
      [s.h, s.vh] = glide(s.h, s.vh, r.height, dt);
    }
    if (!spotAt) return true;
    setVars(spotEl, { x: spotAt.x, y: spotAt.y, w: spotAt.w, h: spotAt.h });
    return Math.abs(spotAt.x - r.left) + Math.abs(spotAt.y - r.top) + Math.abs(spotAt.w - r.width) + Math.abs(spotAt.h - r.height) < ARRIVED_PX;
  }

  /** Ziel der Karte in Bühnen-Koordinaten. Store-Video: wie eine Untertitelzeile am Rand gegenüber dem Geschehen. */
  function cardGoal(size: Size, area: Size, spot: Box | null, clear: readonly Box[], pointR: DOMRect | null, spotR: DOMRect | null): CardPlacement {
    if (o.record) {
      const focus = pointR ?? spotR;
      const low = focus ? focus.top + focus.height / 2 > window.innerHeight * 0.5 : goal?.side === 'top';
      return edgePlacement(size, area, low ? 'top' : 'bottom');
    }
    if (spot) return placeBeside(spot, size, area, clear);
    const base = idle === 'hold' && goal ? holdPlacement(goal, size, area) : edgePlacement(size, area, 'bottom');
    return keepClear(base, size, area, clear);
  }

  function frame(now: number): void {
    const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.05);
    last = now;
    // Erst alles messen, dann schreiben (ein Layout pro Frame)
    const spotTarget = spotSel ? firstVisible(spotSel) : null;
    const pointTarget = pointSel ? firstVisible(pointSel) : null;
    const spotR = spotTarget?.getBoundingClientRect() ?? null;
    const pointR = pointTarget?.getBoundingClientRect() ?? null;
    const clearR = clearSel ? firstVisible(clearSel)?.getBoundingClientRect() ?? null : null;
    const stageR = stage.getBoundingClientRect();
    const area: Size = { w: stageR.width, h: stageR.height };
    const size: Size = { w: card.offsetWidth, h: card.offsetHeight };
    const toStage = (r: DOMRect, pad: number): Box =>
      ({ x: r.left - stageR.left - pad, y: r.top - stageR.top - pad, w: r.width + 2 * pad, h: r.height + 2 * pad });

    root.classList.toggle('is-spot', spotTarget !== null);
    root.classList.toggle('is-point', pointTarget !== null);
    const spotArrived = spotR ? moveSpot(spotR, dt) : false;
    if (pointTarget) placeEl(pointTarget, pointEl);

    const clear = [pointR, clearR].filter((r): r is DOMRect => r !== null).map((r) => toStage(r, CLEAR_PAD));
    goal = cardGoal(size, area, spotR ? toStage(spotR, SPOT_PAD) : null, clear, pointR, spotR);
    const c = cardAt;
    if (!c || reduced) {
      cardAt = { x: goal.x, y: goal.y, vx: 0, vy: 0 };
    } else {
      [c.x, c.vx] = glide(c.x, c.vx, goal.x, dt);
      [c.y, c.vy] = glide(c.y, c.vy, goal.y, dt);
    }
    const at = cardAt ?? goal;
    setVars(card, { cx: at.x, cy: at.y });

    // Pfeil erst, wenn Karte und Spotlight angekommen sind – unterwegs zeigte er ins Leere
    const arrived = spotArrived && Math.hypot(goal.x - at.x, goal.y - at.y) < ARRIVED_PX;
    const offset = spotR && arrived ? arrowOffset(goal.side, at, size, toStage(spotR, 0)) : null;
    if (offset !== null) {
      card.dataset['side'] = goal.side;
      setVars(card, { a: offset });
    }
    card.classList.toggle('has-arrow', offset !== null);
    root.classList.add('is-placed');
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setChapter(index, title) {
      chapter.textContent = title;
      dots.querySelectorAll('.tour-dot').forEach((d, i) => d.classList.toggle('is-active', i === index));
    },
    say(value) {
      if (text.textContent === value) return;
      text.textContent = value;
      // Neuer Text blendet sanft ein: so ist zu sehen, dass jetzt etwas anderes gemeint ist
      text.classList.remove('is-new');
      if (value !== '' && !reduced) {
        void text.offsetWidth; // Animation neu starten
        text.classList.add('is-new');
      }
    },
    setPaused(paused) {
      pause.replaceChildren(icon(paused ? 'play' : 'pause', 22));
      pause.setAttribute('aria-label', t(paused ? 'tour.resume' : 'tour.pause'));
    },
    spot(selector) {
      spotSel = selector;
      idle = 'hold';
    },
    rest() {
      spotSel = null;
      idle = 'rest';
    },
    point(selector, fast = false) {
      pointSel = selector;
      root.classList.toggle('is-fast', fast);
    },
    clear(selector) { clearSel = selector; },
    press(down) { root.classList.toggle('is-down', down); },
    destroy() {
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
