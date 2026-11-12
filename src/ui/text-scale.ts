// Textgröße des Systems (iOS „Größerer Text“ / Dynamic Type, Browser-Grundschrift) → --type-scale auf <html>.
// Die Text-Tokens in public/css/tokens.css rechnen damit; ab LARGE_TEXT_FROM kommt die Klasse is-large-text
// (entspanntere Layouts, siehe layout.css). Gemessen wird ein unsichtbarer Probe-Span (.text-probe in base.css).
import { h } from './dom.ts';

/** Untere und obere Grenze des Faktors. */
export const SCALE_MIN = 0.9;
export const SCALE_MAX = 1.5;
/** Ab diesem Faktor gilt is-large-text. */
export const LARGE_TEXT_FROM = 1.15;
/** Normale Schriftgröße von `font: -apple-system-body` (iOS, Standard-Textgröße). */
export const BASE_APPLE_BODY_PX = 17;
/** Normale Browser-Grundgröße (`font-size: medium`). */
export const BASE_MEDIUM_PX = 16;

/** Faktor aus gemessener und Normalgröße; auf 0,9–1,5 begrenzt, auf 0,01 gerundet; Unsinn → 1. */
export function textScaleFrom(probePx: number, basePx: number): number {
  if (!Number.isFinite(probePx) || !Number.isFinite(basePx) || probePx <= 0 || basePx <= 0) return 1;
  const v = Math.min(SCALE_MAX, Math.max(SCALE_MIN, probePx / basePx));
  return Math.round(v * 100) / 100;
}

/** Misst die Systemschrift: `-apple-system-body` (WebKit/iOS), sonst die Browser-Grundgröße (`medium`). */
export function measureTextScale(): number {
  const apple = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('font', '-apple-system-body');
  const probe = h('span', { class: apple ? 'text-probe is-apple' : 'text-probe', 'aria-hidden': 'true' }, 'M');
  (document.body ?? document.documentElement).appendChild(probe);
  try {
    const px = parseFloat(getComputedStyle(probe).fontSize);
    return textScaleFrom(px, apple ? BASE_APPLE_BODY_PX : BASE_MEDIUM_PX);
  } finally {
    probe.remove();
  }
}

/** Setzt --type-scale und is-large-text auf <html>. */
export function applyTextScale(scale: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--type-scale', String(scale));
  root.classList.toggle('is-large-text', scale >= LARGE_TEXT_FROM);
}

/** Misst jetzt, bei Rückkehr in die App und bei Größenänderung neu. Rückgabe: Abmelden. */
export function watchTextScale(): () => void {
  let last = 0;
  const update = (): void => {
    let scale = 1;
    try { scale = measureTextScale(); } catch { /* ohne Messung bleibt es bei 1 */ }
    if (scale === last) return;
    last = scale;
    applyTextScale(scale);
  };
  const onVisible = (): void => { if (!document.hidden) update(); };
  update();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('resize', update);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('resize', update);
  };
}
