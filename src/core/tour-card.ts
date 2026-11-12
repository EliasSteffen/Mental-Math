// Rundgang (ohne DOM): Wohin die Textkarte gehört und wie sie dorthin gleitet. Statt zwischen oberem und unterem Rand zu
// springen, steht die Karte direkt neben der hervorgehobenen Stelle. Gerechnet in Koordinaten der Bühne (Sichtbereich ohne
// Rand und Safe Area, Ursprung oben links); ui/tour-overlay.ts misst, bewegt und zeichnet den Pfeil.

export interface Box { x: number; y: number; w: number; h: number }
export interface Size { w: number; h: number }

/** below/above/right/left: neben dem Ziel (mit Pfeil), bottom/top: am Rand der Bühne (ohne Pfeil) */
export type CardSide = 'below' | 'above' | 'right' | 'left' | 'bottom' | 'top';
export interface CardPlacement { x: number; y: number; side: CardSide }

/** Abstand zwischen Spotlight und Karte (px); Platz für den Pfeil */
export const CARD_GAP = 16;
/** Zeit, in der Karte und Spotlight ein neues Ziel im Wesentlichen erreichen (s); ruhig, aber nicht träge */
export const GLIDE_S = 0.3;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Am Rand der Bühne, waagerecht mittig (ohne Ziel bzw. wenn neben dem Ziel kein Platz ist). */
export function edgePlacement(card: Size, stage: Size, edge: 'bottom' | 'top', centerX = stage.w / 2): CardPlacement {
  return {
    x: clamp(centerX - card.w / 2, 0, stage.w - card.w),
    y: edge === 'top' ? 0 : Math.max(0, stage.h - card.h),
    side: edge,
  };
}

/** Liegt die Karte an `at` über `box`? */
export function overlaps(at: { x: number; y: number }, card: Size, box: Box): boolean {
  return at.x < box.x + box.w && box.x < at.x + card.w && at.y < box.y + box.h && box.y < at.y + card.h;
}

/** Rand für die Karte: bevorzugt `edge`; verdeckt sie dort etwas Freizuhaltendes und am anderen Rand nicht, dann dort. */
function freeEdge(card: Size, stage: Size, edge: 'bottom' | 'top', centerX: number, clear: readonly Box[]): CardPlacement {
  const first = edgePlacement(card, stage, edge, centerX);
  if (!clear.some((b) => overlaps(first, card, b))) return first;
  const other = edgePlacement(card, stage, edge === 'top' ? 'bottom' : 'top', centerX);
  return clear.some((b) => overlaps(other, card, b)) ? first : other;
}

/**
 * Neben das Ziel: darunter, darüber, rechts, links – die erste Seite, auf der die Karte ganz in die Bühne passt und nichts
 * Freizuhaltendes (`clear`, z. B. das Antwortfeld) verdeckt, mittig am Ziel ausgerichtet. Passt keine (Ziel füllt fast
 * alles), an den Rand, der weiter von der sichtbaren Zielmitte weg ist.
 */
export function placeBeside(target: Box, card: Size, stage: Size, clear: readonly Box[] = [], gap = CARD_GAP): CardPlacement {
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const x = clamp(cx - card.w / 2, 0, stage.w - card.w);
  const y = clamp(cy - card.h / 2, 0, stage.h - card.h);
  const free = (at: { x: number; y: number }): boolean => !clear.some((b) => overlaps(at, card, b));
  const fitsY = (top: number): boolean => top >= 0 && top + card.h <= stage.h && free({ x, y: top });
  const fitsX = (left: number): boolean => left >= 0 && left + card.w <= stage.w && free({ x: left, y });

  const below = target.y + target.h + gap;
  if (fitsY(below)) return { x, y: below, side: 'below' };
  const above = target.y - gap - card.h;
  if (fitsY(above)) return { x, y: above, side: 'above' };
  const right = target.x + target.w + gap;
  if (fitsX(right)) return { x: right, y, side: 'right' };
  const left = target.x - gap - card.w;
  if (fitsX(left)) return { x: left, y, side: 'left' };

  const top = Math.max(target.y, 0);
  const bottom = Math.min(target.y + target.h, stage.h);
  const visibleCy = bottom > top ? (top + bottom) / 2 : cy;
  return freeEdge(card, stage, visibleCy < stage.h / 2 ? 'bottom' : 'top', cx, clear);
}

/** Stelle festhalten (zwischen zwei Texten), dabei in der Bühne halten – sie kann sich gedreht haben. */
export function holdPlacement(at: CardPlacement, card: Size, stage: Size): CardPlacement {
  return { x: clamp(at.x, 0, stage.w - card.w), y: clamp(at.y, 0, stage.h - card.h), side: at.side };
}

/**
 * Touch-Punkt und Freizuhaltendes (Antwortfeld) nicht verdecken: Liegt die Karte darüber, weicht sie an den Rand gegenüber
 * aus. Bewusst nicht direkt neben den Punkt – sonst hüpfte sie beim Eintippen einer Zahl mit jeder Taste mit.
 */
export function keepClear(at: CardPlacement, card: Size, stage: Size, clear: readonly Box[]): CardPlacement {
  const hit = clear.filter((b) => overlaps(at, card, b));
  if (hit.length === 0) return at;
  const cy = hit.reduce((sum, b) => sum + b.y + b.h / 2, 0) / hit.length;
  return freeEdge(card, stage, cy > stage.h / 2 ? 'top' : 'bottom', at.x + card.w / 2, clear);
}

/** Pfeil der Karte: Lage auf ihrer Kante (px ab links bzw. oben), zur Zielmitte, mit Abstand zu den Ecken. */
export function arrowOffset(side: CardSide, at: { x: number; y: number }, card: Size, target: Box, inset = 22): number | null {
  switch (side) {
    case 'below':
    case 'above': return clamp(target.x + target.w / 2 - at.x, inset, card.w - inset);
    case 'right':
    case 'left': return clamp(target.y + target.h / 2 - at.y, inset, card.h - inset);
    default: return null;
  }
}

/**
 * Ein Schritt einer kritisch gedämpften Feder („SmoothDamp“): startet sanft, kommt ohne Überschwingen an und folgt
 * einem wandernden Ziel (Scrollen) stetig. Stabil für jede Bildrate. Gibt neue Position und Geschwindigkeit zurück.
 */
export function glide(pos: number, vel: number, target: number, dt: number, time = GLIDE_S): [number, number] {
  const omega = 2 / Math.max(time, 1e-4);
  const k = omega * dt;
  const decay = 1 / (1 + k + 0.48 * k * k + 0.235 * k * k * k);
  const change = pos - target;
  const temp = (vel + omega * change) * dt;
  const nextVel = (vel - omega * temp) * decay;
  const next = target + (change + temp) * decay;
  // Angekommen: einrasten, damit keine Subpixel-Bewegung weiterläuft
  if (Math.abs(next - target) < 0.25 && Math.abs(nextVel) < 2) return [target, 0];
  return [next, nextVel];
}
