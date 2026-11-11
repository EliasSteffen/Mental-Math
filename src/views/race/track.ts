// Rennbahn (v12 R1): senkrechte Bahnen nebeneinander, je eine Rakete; Höhe = richtige Antworten.
// Reine Darstellung – die Zahlen kommen vom Aufrufer (eigene Antworten, Wiederholung, Geister, Live). Wiederverwendbar für R2/R3.
import { RACE_MAX_LANES, RACE_MILESTONES, trackMax, visibleLanes } from '../../core/race.ts';
import { t } from '../../i18n/index.ts';
import { h, svg } from '../../ui/dom.ts';

/** Farbe je Bahn (Ursprungs-Index, bleibt stabil, auch wenn die Auswahl der sichtbaren Bahnen wechselt) */
const LANE_COLORS = [
  'var(--accent)', 'var(--good)', 'var(--streak)', 'var(--league-master)',
  'var(--league-platinum)', 'var(--league-champion)', 'var(--warn)', 'var(--league-diamond)',
] as const;
export const laneColor = (i: number): string => LANE_COLORS[((i % LANE_COLORS.length) + LANE_COLORS.length) % LANE_COLORS.length] ?? 'var(--accent)';

export interface TrackLane { name: string; me?: boolean }

export interface RaceTrack {
  el: HTMLElement;
  /** Höhen aller Teilnehmer (Reihenfolge wie `lanes`); `instant`: ohne Gleiten (Wiederholung, Bild für Bild) */
  set(altitudes: readonly number[], o?: { instant?: boolean }): void;
}

/** Rakete als SVG; Farbe über `--lane` der umgebenden Bahn (oder des Aufrufers). */
export function rocketSvg(): SVGElement {
  const el = svg('svg', { class: 'race-rocket-svg', viewBox: '-6 0 36 50', width: 28, height: 40, focusable: 'false', 'aria-hidden': 'true' });
  el.append(
    svg('path', { class: 'rk-flame', d: 'M8 36 Q12 50 16 36 Z' }),
    svg('path', { class: 'rk-fin', d: 'M4 24 L-4 38 L5 33 Z' }),
    svg('path', { class: 'rk-fin', d: 'M20 24 L28 38 L19 33 Z' }),
    svg('path', { class: 'rk-body', d: 'M12 0 C19 8 21 20 20 36 L4 36 C3 20 5 8 12 0 Z' }),
    svg('circle', { class: 'rk-window', cx: 12, cy: 17, r: 3.4 }));
  return el;
}

/**
 * Rennbahn mit 1 bis 8 sichtbaren Bahnen. Bei mehr Teilnehmern bleiben die eigene und die sieben nächsten Raketen
 * (`visibleLanes`). Die Skala wächst in Stufen mit dem Führenden; bei 10, 20 und 30 liegen dezente Linien (Mond, Mars, Jupiter).
 */
export function createTrack(lanes: readonly TrackLane[]): RaceTrack {
  const me = lanes.findIndex((l) => l.me === true);
  const field = h('div', { class: 'race-lanes' });
  const sky = h('div', { class: 'race-sky', 'aria-hidden': 'true' });
  const miles = RACE_MILESTONES.map((m) => {
    const el = h('div', { class: 'race-mile' }, h('span', { class: 'race-mile-label' }, t(`race.mile.${m.id}`)));
    sky.append(el);
    return { at: m.at, el };
  });
  const el = h('div', { class: 'race-track', 'aria-hidden': 'true', 'data-lanes': String(Math.min(lanes.length, RACE_MAX_LANES)) }, sky, field);

  let shown = '';
  let rockets: Array<{ index: number; lane: HTMLElement }> = [];

  const build = (indexes: readonly number[]): void => {
    rockets = indexes.map((index) => {
      const l = lanes[index] ?? { name: '' };
      const lane = h('div', { class: `race-lane${l.me ? ' is-me' : ''}` },
        h('div', { class: 'race-lane-field' }, h('span', { class: 'race-rail' }), h('span', { class: 'race-rocket' }, rocketSvg())),
        h('span', { class: 'race-name' }, l.name));
      lane.style.setProperty('--lane', laneColor(index));
      lane.style.setProperty('--alt', '0');
      return { index, lane };
    });
    field.replaceChildren(...rockets.map((r) => r.lane));
    el.dataset['lanes'] = String(rockets.length);
  };

  return {
    el,
    set(altitudes, o = {}) {
      el.classList.toggle('is-instant', o.instant === true);
      const idx = visibleLanes(altitudes, me);
      const key = idx.join(',');
      if (key !== shown) { shown = key; build(idx); }
      const leader = idx.reduce((m, i) => Math.max(m, altitudes[i] ?? 0), 0);
      const max = trackMax(leader);
      for (const r of rockets) {
        const a = Math.max(0, altitudes[r.index] ?? 0);
        r.lane.style.setProperty('--alt', String(Math.min(1, a / max)));
        r.lane.classList.toggle('is-leader', leader > 0 && a === leader);
      }
      for (const m of miles) {
        m.el.hidden = m.at >= max;
        m.el.style.setProperty('--at', String(m.at / max));
      }
    },
  };
}
