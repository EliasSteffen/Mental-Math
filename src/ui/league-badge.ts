// Liga-Emblem (v9 J): Wappen als SVG, Farbe über Tokens (--league-*), Stufe als römische Zahl, Meister mit Stern,
// Champion zusätzlich mit Krone. Nur DOM-APIs, kein innerHTML.
import { svg } from './dom.ts';
import { tierInfo, type ChampionInfo, type LeagueId } from '../core/league.ts';
import { t } from '../i18n/index.ts';

const ROMAN = ['I', 'II', 'III'] as const;
const SHIELD = 'M24 7 L42 13 V30 C42 42 34 50 24 55 C14 50 6 42 6 30 V13 Z';
const INNER = 'M24 12 L37.5 16.5 V30 C37.5 39 31.5 45.5 24 49.5 C16.5 45.5 10.5 39 10.5 30 V16.5 Z';
const STAR = 'M24 21.5 L26.9 28 L34 28.7 L28.7 33.4 L30.2 40.4 L24 36.8 L17.8 40.4 L19.3 33.4 L14 28.7 L21.1 28 Z';
const CROWN = 'M14.5 11 L16 2.5 L20.5 7 L24 1.5 L27.5 7 L32 2.5 L33.5 11 Z';

export function leagueLabel(league: LeagueId): string {
  return t(`rewards.league_${league}`);
}

/** „Gold II“, „Meister“; mit `champion` „Champion“. */
export function tierName(tier: number, champion?: ChampionInfo | null): string {
  if (champion) return t('rewards.champion');
  const info = tierInfo(tier);
  return info.step === null ? leagueLabel(info.league) : `${leagueLabel(info.league)} ${ROMAN[info.step - 1] ?? ''}`;
}

export interface EmblemOptions {
  /** Stufe 0–15 */
  tier: number;
  /** Kantenlänge der Breite in px (Höhe folgt) */
  size?: number;
  /** Champion-Status vom Server (Paket K); wirkt nur bei Meister */
  champion?: ChampionInfo | null;
  /** false = nur Optik (aria-hidden), wenn daneben der Name steht */
  labelled?: boolean;
  /** Eigene Beschriftung (Standard: tierName) */
  label?: string;
}

export function leagueEmblem(o: EmblemOptions): SVGElement {
  const info = tierInfo(o.tier);
  const champion = Boolean(o.champion) && info.league === 'master';
  const size = o.size ?? 56;
  const root = svg('svg', {
    class: `league-emblem is-${champion ? 'champion' : info.league}`, viewBox: '0 0 48 58', width: size, height: Math.round((size * 58) / 48),
    focusable: 'false',
  });
  if (o.labelled === false) {
    root.setAttribute('aria-hidden', 'true');
  } else {
    root.setAttribute('role', 'img');
    root.setAttribute('aria-label', o.label ?? tierName(o.tier, champion ? o.champion : null));
  }
  root.append(svg('path', { class: 'le-shield', d: SHIELD }), svg('path', { class: 'le-inner', d: INNER }));
  if (info.step === null) {
    root.append(svg('path', { class: 'le-star', d: STAR }));
    if (champion) root.append(svg('path', { class: 'le-crown', d: CROWN }));
  } else {
    const text = svg('text', { class: 'le-step', x: 24, y: 37, 'text-anchor': 'middle' });
    text.textContent = ROMAN[info.step - 1] ?? '';
    root.append(text);
  }
  return root;
}
