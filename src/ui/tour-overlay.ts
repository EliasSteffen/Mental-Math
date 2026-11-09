// Oberfläche des Rundgangs: Textkarte mit Bedienleiste, Spotlight und Touch-Punkt (bei Maus ein Zeiger, public/css/views/tour.css).
// Liegt über allem, fängt selbst keine Tipps außer auf der Karte. Das Ziel wird in jedem Frame neu gesucht: Drehen,
// Scrollen und Neuzeichnen verschieben es jederzeit. Der Rundgang öffnet bewusst keine modalen Dialoge (Top-Layer läge darüber).
import { h } from './dom.ts';
import { icon, type IconName } from './kit.ts';
import { t } from '../i18n/index.ts';

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
  /** Spotlight auf das erste sichtbare Element; null nimmt es weg */
  spot(selector: string | null): void;
  /** Touch-Punkt auf das erste sichtbare Element; null nimmt ihn weg */
  point(selector: string | null, fast?: boolean): void;
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
  const card = h('section', { class: 'tour-card', 'aria-label': t('tour.label') }, chapter, text, o.record ? null : bar);
  const spotEl = h('div', { class: 'tour-spot', 'aria-hidden': 'true' });
  const pointEl = h('div', { class: 'tour-point', 'aria-hidden': 'true' });
  const root = h('div', { class: `tour-ui${o.record ? ' is-record' : ''}${o.shots ? ' is-shots' : ''}` }, spotEl, pointEl, card);
  document.body.append(root);

  let spotSel: string | null = null;
  let pointSel: string | null = null;
  let raf = 0;

  /** Rechteck als CSS-Variablen; keine Inline-Styles außer Variablen (CSP). */
  function place(el: HTMLElement, node: HTMLElement): void {
    const r = el.getBoundingClientRect();
    node.style.setProperty('--x', String(Math.round(r.left)));
    node.style.setProperty('--y', String(Math.round(r.top)));
    node.style.setProperty('--w', String(Math.round(r.width)));
    node.style.setProperty('--h', String(Math.round(r.height)));
  }

  function frame(): void {
    const spotTarget = spotSel ? firstVisible(spotSel) : null;
    const pointTarget = pointSel ? firstVisible(pointSel) : null;
    root.classList.toggle('is-spot', spotTarget !== null);
    root.classList.toggle('is-point', pointTarget !== null);
    if (spotTarget) place(spotTarget, spotEl);
    if (pointTarget) place(pointTarget, pointEl);
    // Karte auf die Seite, auf der das Ziel nicht liegt
    const focus = pointTarget ?? spotTarget;
    if (focus) {
      const r = focus.getBoundingClientRect();
      root.classList.toggle('is-card-top', r.top + r.height / 2 > window.innerHeight * 0.5);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    setChapter(index, title) {
      chapter.textContent = title;
      dots.querySelectorAll('.tour-dot').forEach((d, i) => d.classList.toggle('is-active', i === index));
    },
    say(value) { text.textContent = value; },
    setPaused(paused) {
      pause.replaceChildren(icon(paused ? 'play' : 'pause', 22));
      pause.setAttribute('aria-label', t(paused ? 'tour.resume' : 'tour.pause'));
    },
    spot(selector) { spotSel = selector; },
    point(selector, fast = false) {
      pointSel = selector;
      root.classList.toggle('is-fast', fast);
    },
    press(down) { root.classList.toggle('is-down', down); },
    destroy() {
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
}
