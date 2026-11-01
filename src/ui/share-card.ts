// Teilbare Ergebniskarte: zeichnet das Modell (features/share-card.ts) als Bild 1080 × 1350 (4:5) im Stil „Ruhiger Fokus“ –
// Farben des aktiven Themes (tokens.css), Systemschriften der App. PNG-Blob zum Teilen, data:-URL für die Vorschau
// (CSP img-src erlaubt data:, kein blob:). Dazu der Button „Ergebnis teilen“ mit Vorschau-Sheet für beide Ergebnis-Screens.
import { cardSummary, fitLines, rgba, type Measure, type ShareCard } from '../features/share-card.ts';
import { shareImage } from '../platform/index.ts';
import { t } from '../i18n/index.ts';
import { h } from './dom.ts';
import { button, setButtonLabel } from './kit.ts';
import { openSheet } from './sheet.ts';
import { toast } from './toast.ts';

export const CARD_W = 1080;
export const CARD_H = 1350;
/** Rand und Innenbreite */
const PAD = 96;
const INNER = CARD_W - 2 * PAD;

export interface RenderedCard { blob: Blob; dataUrl: string }

interface Palette {
  bg: string; surface: string; border: string; text: string; muted: string;
  accent: string; good: string; bad: string; font: string; fontNum: string;
}

/** Farben und Schriften des aktiven Themes (Fallback: Papier). */
function palette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--bg', '#F6F4EF'), surface: v('--surface', '#FFFFFF'), border: v('--border', '#E2DDD3'),
    text: v('--text', '#1E2227'), muted: v('--muted', '#5C636D'), accent: v('--accent', '#3A5A8A'),
    good: v('--good', '#3D7A59'), bad: v('--bad', '#A9533A'),
    font: v('--font', 'system-ui, sans-serif'), fontNum: v('--font-num', 'system-ui, sans-serif'),
  };
}

type Ctx = CanvasRenderingContext2D;

function setFont(ctx: Ctx, weight: number, size: number, family: string): void {
  ctx.font = `${weight} ${size}px ${family}`;
}

function measurer(ctx: Ctx, weight: number, family: string): Measure {
  return (s, size) => { setFont(ctx, weight, size, family); return ctx.measureText(s).width; };
}

/** Abgerundetes Rechteck als Pfad (ctx.roundRect fehlt in älteren WebViews). */
function roundRect(ctx: Ctx, x: number, y: number, w: number, hgt: number, r: number): void {
  const rr = Math.min(r, w / 2, hgt / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + hgt, rr);
  ctx.arcTo(x + w, y + hgt, x, y + hgt, rr);
  ctx.arcTo(x, y + hgt, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Kopf: Titel (bis 2 Zeilen, sonst kleiner bzw. gekürzt), darunter das Datum. Rückgabe: Unterkante. */
function drawHead(ctx: Ctx, card: ShareCard, p: Palette): number {
  const title = fitLines(card.title, INNER, 2, [64, 58, 52, 46], measurer(ctx, 600, p.font));
  const lh = title.size * 1.2;
  setFont(ctx, 600, title.size, p.font);
  ctx.fillStyle = p.text;
  let y = PAD + title.size;
  title.lines.forEach((line, i) => ctx.fillText(line, PAD, y + i * lh));
  y += (title.lines.length - 1) * lh + 60;
  setFont(ctx, 400, 40, p.font);
  ctx.fillStyle = p.muted;
  ctx.fillText(card.date, PAD, y);
  return y + 16;
}

/** Fuß: Trennlinie, Akzentpunkt + App-Name links, Host rechts. Rückgabe: Oberkante (Linie). */
function drawFoot(ctx: Ctx, card: ShareCard, p: Palette): number {
  const base = CARD_H - PAD;
  const line = base - 84;
  ctx.fillStyle = p.border;
  ctx.fillRect(PAD, line, INNER, 2);
  ctx.fillStyle = p.accent;
  ctx.beginPath();
  ctx.arc(PAD + 10, base - 13, 10, 0, Math.PI * 2);
  ctx.fill();
  setFont(ctx, 600, 38, p.font);
  ctx.fillStyle = p.text;
  ctx.fillText(card.footer.app, PAD + 36, base);
  const appW = ctx.measureText(card.footer.app).width;
  if (card.footer.host) {
    const host = fitLines(card.footer.host, INNER - 36 - appW - 48, 1, [38, 32, 28], measurer(ctx, 400, p.font));
    setFont(ctx, 400, host.size, p.font);
    ctx.fillStyle = p.muted;
    ctx.textAlign = 'right';
    ctx.fillText(host.lines[0] ?? '', CARD_W - PAD, base);
    ctx.textAlign = 'left';
  }
  return line;
}

/** Kacheln der übrigen Kennzahlen (höchstens 3): Wert groß, Bezeichnung darunter. Rückgabe: Oberkante. */
function drawTiles(ctx: Ctx, stats: ShareCard['stats'], bottom: number, p: Palette): number {
  const tiles = stats.slice(0, 3);
  if (!tiles.length) return bottom;
  const gap = 24;
  const w = (INNER - gap * (tiles.length - 1)) / tiles.length;
  const innerW = w - 72;
  // Bezeichnungen in allen Kacheln gleich groß: möglichst einzeilig, sonst zweizeilig (höhere Kacheln)
  const measureLabel = measurer(ctx, 400, p.font);
  const oneLine = [34, 30].find((size) => tiles.every((s) => measureLabel(s.label, size) <= innerW));
  const labelSize = oneLine ?? 30;
  const tileH = oneLine ? 208 : 244;
  const top = bottom - tileH;
  tiles.forEach((s, i) => {
    const x = PAD + i * (w + gap);
    roundRect(ctx, x, top, w, tileH, 40);
    ctx.fillStyle = p.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = p.border;
    ctx.stroke();
    // feste Grundlinien: Werte und Bezeichnungen stehen in allen Kacheln auf einer Höhe
    const value = fitLines(s.value, innerW, 1, [76, 68, 60, 52, 44], measurer(ctx, 600, p.fontNum));
    setFont(ctx, 600, value.size, p.fontNum);
    ctx.fillStyle = p.text;
    ctx.fillText(value.lines[0] ?? '', x + 36, top + 108);
    const label = fitLines(s.label, innerW, oneLine ? 1 : 2, [labelSize, 28], measureLabel);
    setFont(ctx, 400, label.size, p.font);
    ctx.fillStyle = p.muted;
    label.lines.forEach((l, j) => ctx.fillText(l, x + 36, top + 164 + j * label.size * 1.2));
  });
  return top;
}

/** Ergebnis-Segmente wie in der App (richtig/falsch); bei sehr vielen ein geteilter Balken. Rückgabe: Oberkante. */
function drawMarks(ctx: Ctx, marks: readonly boolean[], bottom: number, p: Palette): number {
  const n = marks.length;
  const segH = 16;
  const top = bottom - segH;
  if (!n) return bottom;
  const gap = n > 20 ? 6 : 12;
  const w = (INNER - gap * (n - 1)) / n;
  if (w < 8) {
    const good = marks.filter(Boolean).length / n;
    roundRect(ctx, PAD, top, INNER, segH, segH / 2);
    ctx.fillStyle = p.bad;
    ctx.fill();
    if (good > 0) {
      roundRect(ctx, PAD, top, Math.max(segH, INNER * good), segH, segH / 2);
      ctx.fillStyle = p.good;
      ctx.fill();
    }
    return top;
  }
  marks.forEach((ok, i) => {
    roundRect(ctx, PAD + i * (w + gap), top, w, segH, segH / 2);
    ctx.fillStyle = ok ? p.good : p.bad;
    ctx.fill();
  });
  return top;
}

/** Hauptzahl („8/10“: Zähler kräftig, „/10“ gedämpft) mit Bezeichnung, mittig zwischen Kopf und Segmenten. */
function drawMain(ctx: Ctx, stat: ShareCard['stats'][number] | undefined, from: number, to: number, p: Palette): void {
  if (!stat) return;
  const slash = stat.value.indexOf('/');
  const head = slash > 0 ? stat.value.slice(0, slash) : stat.value;
  const tail = slash > 0 ? stat.value.slice(slash) : '';
  const value = fitLines(stat.value, INNER, 1, [300, 260, 220, 180, 150], measurer(ctx, 700, p.fontNum));
  const label = fitLines(stat.label, INNER, 1, [56, 48, 40], measurer(ctx, 600, p.font));
  setFont(ctx, 700, value.size, p.fontNum);
  const m = ctx.measureText(stat.value);
  const asc = m.actualBoundingBoxAscent || value.size * 0.72;
  // Unterlänge des „/“ einrechnen, sonst berührt sie die Bezeichnung
  const gap = (m.actualBoundingBoxDescent || 0) + 32;
  const block = asc + gap + label.size * 0.75;
  const baseline = Math.round((from + to) / 2 - block / 2 + asc);
  ctx.fillStyle = p.text;
  ctx.fillText(head, PAD - 6, baseline);
  if (tail) {
    ctx.fillStyle = p.muted;
    ctx.fillText(tail, PAD - 6 + ctx.measureText(head).width, baseline);
  }
  setFont(ctx, 600, label.size, p.font);
  ctx.fillStyle = p.muted;
  ctx.fillText(label.lines[0] ?? '', PAD, baseline + gap + label.size * 0.75);
}

function draw(ctx: Ctx, card: ShareCard, p: Palette): void {
  ctx.fillStyle = p.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // sanfter Akzent-Schein oben rechts (nur bei Hex-Farben; Aurora/Neon haben eigene Verläufe in der App)
  const glow = rgba(p.accent, 0.16);
  const clear = rgba(p.accent, 0);
  if (glow && clear) {
    const g = ctx.createRadialGradient(CARD_W, 0, 0, CARD_W, 0, CARD_W);
    g.addColorStop(0, glow);
    g.addColorStop(1, clear);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const [main, ...rest] = card.stats;
  const headBottom = drawHead(ctx, card, p);
  const footTop = drawFoot(ctx, card, p);
  const tilesTop = drawTiles(ctx, rest, footTop - 64, p);
  const marksTop = drawMarks(ctx, card.marks, tilesTop - 64, p);
  drawMain(ctx, main, headBottom, marksTop - 24, p);
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('FileReader'));
    r.readAsDataURL(blob);
  });
}

/** Karte zeichnen: PNG-Blob (Teilen) und data:-URL (Vorschau). */
export async function renderShareCard(card: ShareCard): Promise<RenderedCard> {
  // Systemschriften sind sofort da; geladene Webfonts (falls je) erst abwarten
  try { await document.fonts?.ready; } catch { /* ohne Warten zeichnen */ }
  const canvas = h('canvas', { width: CARD_W, height: CARD_H });
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d');
  draw(ctx, card, palette());
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png');
  });
  return { blob, dataUrl: await readDataUrl(blob) };
}

/** Vorschau im Sheet mit „Teilen“; nach dem Teilen bzw. Speichern schließt das Sheet. */
function openPreview(card: ShareCard, img: RenderedCard): void {
  let busy = false;
  const share = button({
    label: t('common.share'), kind: 'primary', icon: 'upload', full: true,
    onClick: () => {
      if (busy) return;
      busy = true;
      share.setAttribute('aria-disabled', 'true');
      // direkt im Klick (kein await davor): Web Share braucht die Nutzergeste
      void shareImage(img.blob, card.fileName, card.text).then((r) => {
        busy = false;
        share.removeAttribute('aria-disabled');
        if (r === 'saved') toast(t('common.shareSaved'));
        else if (r === 'failed') toast(t('common.shareFailed'));
        if (r === 'shared' || r === 'saved') sheet.close();
      });
    },
  });
  const sheet = openSheet({
    title: t('common.shareResult'),
    children: [
      h('img', { class: 'share-card-preview', src: img.dataUrl, alt: cardSummary(card), width: CARD_W, height: CARD_H }),
      share,
    ],
  });
}

/**
 * Button „Ergebnis teilen“: zeichnet die Karte beim ersten Klick (danach zwischengespeichert) und öffnet die Vorschau.
 * Während des Zeichnens gesperrt (aria-disabled statt disabled: der Fokus bleibt für die Rückkehr aus dem Sheet).
 */
export function shareCardButton(card: ShareCard): HTMLButtonElement {
  let rendered: Promise<RenderedCard> | null = null;
  let busy = false;
  const idle = (): void => {
    busy = false;
    btn.removeAttribute('aria-disabled');
    btn.removeAttribute('aria-busy');
    setButtonLabel(btn, t('common.shareResult'));
  };
  const btn = button({
    label: t('common.shareResult'), icon: 'upload',
    onClick: () => {
      if (busy) return;
      busy = true;
      btn.setAttribute('aria-disabled', 'true');
      btn.setAttribute('aria-busy', 'true');
      setButtonLabel(btn, t('common.shareRendering'));
      rendered ??= renderShareCard(card);
      rendered.then((img) => {
        idle();
        if (btn.isConnected) openPreview(card, img);
      }, () => {
        rendered = null;
        idle();
        toast(t('common.shareRenderFailed'));
      });
    },
  });
  return btn;
}
