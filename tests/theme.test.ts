// Ruhiger Fokus: Theme-Auflösung und Migration der Einstellungen (pastel → paper, timer → timerDisplay).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTheme, themeMeta, THEMES, themeLabel } from '../src/ui/theme.ts';
import { DEFAULT_SETTINGS, normalize, normalizeSettings, normalizeTheme, THEME_SETTINGS } from '../src/data/schema.ts';
import { getRepository, getSettings, invalidateCache, resetAll, setSettings } from '../src/data/storage.ts';
import { importJSON } from '../src/data/transfer.ts';
import { setLang } from '../src/i18n/index.ts';
import type { Settings, Theme } from '../src/types.ts';

afterEach(() => {
  setLang('de');
  resetAll();
});

function fresh(): void {
  invalidateCache();
  resetAll();
}

test('resolveTheme: system folgt prefers-color-scheme, feste Themes bleiben', () => {
  assert.equal(resolveTheme('system', false), 'paper');
  assert.equal(resolveTheme('system', true), 'night');
  for (const th of ['paper', 'night', 'oled', 'aurora', 'neon'] as const) {
    assert.equal(resolveTheme(th, false), th);
    assert.equal(resolveTheme(th, true), th);
  }
});

test('themeMeta: theme-color = --bg, color-scheme hell nur bei Papier', () => {
  const expected: Record<Theme, [string, 'light' | 'dark']> = {
    paper: ['#F6F4EF', 'light'], night: ['#141619', 'dark'], oled: ['#000000', 'dark'],
    aurora: ['#0B0A14', 'dark'], neon: ['#08090A', 'dark'],
  };
  for (const [th, [color, scheme]] of Object.entries(expected) as Array<[Theme, [string, 'light' | 'dark']]>) {
    assert.deepEqual(themeMeta(th), { color, scheme });
  }
});

test('THEMES: alle sechs Einstellungen mit übersetztem Namen', () => {
  assert.deepEqual(THEMES.map((x) => x.value), [...THEME_SETTINGS]);
  assert.equal(themeLabel('paper'), 'Papier');
  assert.equal(themeLabel('night'), 'Nacht');
  setLang('en');
  assert.equal(themeLabel('paper'), 'Paper');
  assert.equal(themeLabel('oled'), 'OLED');
});

test('normalizeTheme: pastel → paper, neon/oled bleiben, Unbekanntes → system', () => {
  assert.equal(normalizeTheme('pastel'), 'paper');
  assert.equal(normalizeTheme('neon'), 'neon');
  assert.equal(normalizeTheme('oled'), 'oled');
  assert.equal(normalizeTheme('aurora'), 'aurora');
  assert.equal(normalizeTheme('bunt'), 'system');
  assert.equal(normalizeTheme(undefined), 'system');
  assert.equal(normalizeTheme(42), 'system');
});

test('normalizeSettings: timerDisplay aus timer, neue Schalter standardmäßig aus', () => {
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ timer: false }).timerDisplay, 'off');
  assert.equal(normalizeSettings({ timer: true }).timerDisplay, 'calm');
  assert.equal(normalizeSettings({}).timerDisplay, 'calm');
  // vorhandene gültige Werte gewinnen über die Ableitung
  assert.equal(normalizeSettings({ timer: false, timerDisplay: 'precise' }).timerDisplay, 'precise');
  assert.equal(normalizeSettings({ timer: true, timerDisplay: 'off' }).timerDisplay, 'off');
  // ungültige Werte → Ableitung bzw. Default
  assert.equal(normalizeSettings({ timer: false, timerDisplay: 'laut' }).timerDisplay, 'off');
  const s = normalizeSettings({ breathe: 'ja', confetti: 1 });
  assert.equal(s.breathe, false);
  assert.equal(s.confetti, false);
  assert.equal(normalizeSettings({ breathe: true, confetti: true }).confetti, true);
  // die Zeitwertung bleibt unabhängig von der Anzeige erhalten
  assert.equal(normalizeSettings({ timer: false }).timer, false);
});

test('normalize (Import, Migration v1): alte Werte werden migriert', () => {
  const st = normalize({ version: 1, settings: { theme: 'pastel', timer: false, sessionLength: 20 } });
  assert.equal(st.settings.theme, 'paper');
  assert.equal(st.settings.timerDisplay, 'off');
  assert.equal(st.settings.sessionLength, 20);
  assert.equal(normalize({ settings: { theme: 'neon' } }).settings.theme, 'neon');
  assert.equal(normalize({ settings: { theme: 'regenbogen' } }).settings.theme, 'system');
});

test('getSettings migriert gespeicherte (auch synchronisierte) alte Werte', () => {
  fresh();
  getRepository().putDoc('settings', { theme: 'pastel', timer: false, sessionLength: 30, updatedAt: 5 });
  const s: Settings = getSettings();
  assert.equal(s.theme, 'paper');
  assert.equal(s.timerDisplay, 'off');
  assert.equal(s.sessionLength, 30);
  assert.equal(s.breathe, false);
  // unbekanntes Theme aus einem anderen Gerät
  getRepository().putDoc('settings', { theme: 'sepia', updatedAt: 6 });
  assert.equal(getSettings().theme, 'system');
  assert.equal(getSettings().timerDisplay, 'calm');
});

test('setSettings speichert normalisiert, neue Felder überleben den Round-Trip', () => {
  fresh();
  setSettings({ theme: 'pastel' as Settings['theme'], timerDisplay: 'precise', breathe: true, confetti: true });
  const doc = getRepository().getDoc<Record<string, unknown>>('settings') ?? {};
  assert.equal(doc.theme, 'paper');
  assert.equal(doc.timerDisplay, 'precise');
  const s = getSettings();
  assert.equal(s.breathe, true);
  assert.equal(s.confetti, true);
});

test('importJSON lässt neue Felder und Theme-Werte durch und migriert alte', () => {
  fresh();
  const ok = importJSON(JSON.stringify({ version: 3, settings: { theme: 'aurora', timerDisplay: 'precise', breathe: true, confetti: true } }));
  assert.equal(ok.ok, true);
  let s = getSettings();
  assert.equal(s.theme, 'aurora');
  assert.equal(s.timerDisplay, 'precise');
  assert.equal(s.breathe, true);
  assert.equal(s.confetti, true);
  assert.equal(importJSON(JSON.stringify({ version: 2, settings: { theme: 'pastel', timer: false } })).ok, true);
  s = getSettings();
  assert.equal(s.theme, 'paper');
  assert.equal(s.timerDisplay, 'off');
});
