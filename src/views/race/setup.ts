// Einrichten (v12 R1): Rennen-Einstellungen (Dauer, Kategorie, Stufe) – von „Reihum“ genutzt, R2 setzt sie im Gruppen-Sheet ein –
// und die Spielerliste für „Reihum“ (2–6 Namen). Zuletzt verwendete Namen und Einstellungen merkt sich der Browser (localStorage).
import {
  RACE_DEFAULT_DURATION, RACE_DEFAULT_LEVEL, RACE_DURATIONS, RACE_NAME_MAX, cleanRaceName, decodeRaceConfig, encodeRaceConfig,
  raceCategories, type RaceConfig, type RaceDuration,
} from '../../core/race.ts';
import { CATEGORIES, LEVEL_NAMES } from '../../core/catalog.ts';
import type { CategoryId } from '../../types.ts';
import { t } from '../../i18n/index.ts';
import { h } from '../../ui/dom.ts';
import { button, icon, segmented } from '../../ui/kit.ts';

export const REIHUM_MIN_PLAYERS = 2;
export const REIHUM_MAX_PLAYERS = 6;
const NAMES_KEY = 'mm.race.names';
const CFG_KEY = 'mm.race.cfg';

/* ---------- Gemerkte Werte (nur dieses Gerät, nie in den Einstellungen) ---------- */

export function loadNames(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, REIHUM_MAX_PLAYERS).map(cleanRaceName).filter((n) => n !== '');
  } catch {
    return [];
  }
}

export function saveNames(names: readonly string[]): void {
  try { localStorage.setItem(NAMES_KEY, JSON.stringify(names.slice(0, REIHUM_MAX_PLAYERS))); } catch { /* Speicher gesperrt: ohne Vorschlag */ }
}

export const DEFAULT_RACE_CONFIG: RaceConfig = { durationS: RACE_DEFAULT_DURATION, cat: 'all', lvl: RACE_DEFAULT_LEVEL };

export function loadConfig(): RaceConfig {
  try { return decodeRaceConfig(localStorage.getItem(CFG_KEY)) ?? DEFAULT_RACE_CONFIG; } catch { return DEFAULT_RACE_CONFIG; }
}

export function saveConfig(cfg: RaceConfig): void {
  try { localStorage.setItem(CFG_KEY, encodeRaceConfig(cfg)); } catch { /* ignorieren */ }
}

/** „Gemischt · 60 s · Mittel“ */
export function configLine(cfg: RaceConfig): string {
  const cat = cfg.cat === 'all' ? t('race.catAll') : (CATEGORIES.find((c) => c.id === cfg.cat)?.name ?? cfg.cat);
  return [cat, t('race.seconds', { n: cfg.durationS }), LEVEL_NAMES[cfg.lvl]].join(' · ');
}

/* ---------- Einstellungen ---------- */

export interface ConfigForm { el: HTMLElement; get(): RaceConfig }

let uid = 0;

/** Dauer · Kategorie · Stufe (Regeln: PLAN-v12 §1). Gleich für Reihum, Geister- und Live-Rennen. */
export function configForm(initial: RaceConfig = DEFAULT_RACE_CONFIG): ConfigForm {
  let cfg: RaceConfig = { ...initial };
  const catId = `race-cat-${uid += 1}`;
  const duration = segmented<string>({
    label: t('race.duration'), numeric: true,
    options: RACE_DURATIONS.map((d) => [String(d), t('race.seconds', { n: d })] as const),
    value: String(cfg.durationS),
    onChange: (v) => { cfg = { ...cfg, durationS: Number(v) as RaceDuration }; },
  });
  const level = segmented<'1' | '2' | '3'>({
    label: t('race.level'),
    options: [['1', LEVEL_NAMES[1]], ['2', LEVEL_NAMES[2]], ['3', LEVEL_NAMES[3]]],
    value: String(cfg.lvl) as '1' | '2' | '3',
    onChange: (v) => { cfg = { ...cfg, lvl: Number(v) as 1 | 2 | 3 }; },
  });
  const select = h('select', { class: 'prof-input', id: catId },
    h('option', { value: 'all' }, t('race.catAll')),
    ...raceCategories().map((id) => h('option', { value: id }, CATEGORIES.find((c) => c.id === id)?.name ?? id)));
  select.value = cfg.cat;
  select.addEventListener('change', () => { cfg = { ...cfg, cat: select.value as CategoryId | 'all' }; });
  const el = h('div', { class: 'race-config' },
    duration.el,
    h('div', { class: 'control' }, h('label', { class: 'control-label', for: catId }, t('race.category')), select),
    level.el);
  return { el, get: () => ({ ...cfg }) };
}

/* ---------- Spieler für „Reihum“ ---------- */

export interface PlayersForm { el: HTMLElement; get(): string[] }

/** Leere Namen werden „Spieler N“, doppelte bekommen eine Zählung („Anna“, „Anna 2“). */
export function finalizeNames(raw: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((r, i) => {
    const base = cleanRaceName(r) || t('race.playerN', { n: i + 1 });
    const key = base.toLowerCase();
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return n === 1 ? base : `${base} ${n}`.slice(0, RACE_NAME_MAX + 2);
  });
}

/** 2–6 Namensfelder; Vorschläge aus den zuletzt verwendeten Namen. */
export function playersForm(initial: readonly string[]): PlayersForm {
  const values: string[] = Array.from({ length: Math.max(REIHUM_MIN_PLAYERS, Math.min(REIHUM_MAX_PLAYERS, initial.length)) }, (_, i) => initial[i] ?? '');
  const rows = h('div', { class: 'race-players-rows' });
  const add = button({ label: t('race.addPlayer'), kind: 'soft', onClick: () => { sync(); values.push(''); draw(); } });
  const el = h('div', { class: 'race-players' }, rows, add);
  const base = (uid += 1);

  function sync(): void {
    rows.querySelectorAll<HTMLInputElement>('input').forEach((input, i) => { values[i] = input.value; });
  }
  function draw(): void {
    rows.replaceChildren(...values.map((v, i) => {
      const id = `race-p-${base}-${i}`;
      const input = h('input', {
        class: 'prof-input race-player-input', id, type: 'text', maxlength: RACE_NAME_MAX, autocomplete: 'off', autocapitalize: 'words',
        spellcheck: 'false', placeholder: t('race.playerN', { n: i + 1 }), value: v, enterkeyhint: 'next',
      });
      const remove = values.length > REIHUM_MIN_PLAYERS
        ? h('button', {
          type: 'button', class: 'race-player-remove press', 'aria-label': t('race.removePlayer', { n: i + 1 }),
          onclick: () => { sync(); values.splice(i, 1); draw(); },
        }, icon('close', 18))
        : null;
      return h('div', { class: 'race-player' },
        h('label', { class: 'race-player-no num', for: id }, String(i + 1), h('span', { class: 'sr-only' }, ` ${t('race.player')}`)),
        input, remove);
    }));
    add.hidden = values.length >= REIHUM_MAX_PLAYERS;
  }
  draw();
  return { el, get: () => { sync(); return finalizeNames(values); } };
}
