// v10 P: XP-Shop – Preise und Regeln, Kauf, Themes (Normalisierung, Fallback, Kontrast), Rahmen.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canBuy, effectiveFrame, effectiveTheme, isPremiumTheme, missingXp, shopItem, SHOP_ITEMS } from '../src/core/shop.ts';
import { MAX_FREEZES } from '../src/core/habit.ts';
import { normalizeTheme, THEME_SETTINGS } from '../src/data/schema.ts';
import { getSettings, invalidateCache, resetAll, setSettings } from '../src/data/storage.ts';
import { buyItem, shopState, useFrame, activeFrame } from '../src/features/shop.ts';
import { grantXp, xpView } from '../src/features/xp.ts';
import { THEMES, themeLabel } from '../src/ui/theme.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';
import { setLang } from '../src/i18n/index.ts';

afterEach(() => { setLang('de'); resetAll(); });

function fresh(xp = 0): void {
  invalidateCache();
  resetAll();
  if (xp > 0) grantXp(xp);
}

const item = (id: string) => {
  const it = shopItem(id);
  assert.ok(it, id);
  return it;
};

test('Artikel und Preise laut Plan', () => {
  const prices = Object.fromEntries(SHOP_ITEMS.map((i) => [i.id, i.price]));
  assert.deepEqual(prices, {
    freeze: 1500, 'theme:sunset': 4000, 'theme:sand': 6000, 'theme:ocean': 8000,
    'frame:silver': 3000, 'frame:gold': 6000, 'frame:diamond': 12000, 'frame:chest': null,
  });
  assert.equal(new Set(SHOP_ITEMS.map((i) => i.id)).size, SHOP_ITEMS.length);
});

test('Artikeltexte in de und en vorhanden', () => {
  for (const it of SHOP_ITEMS) {
    for (const d of [de, en]) {
      assert.ok(d.shop[it.nameKey.replace('shop.', '') as keyof typeof d.shop], it.nameKey);
      assert.ok(d.shop[it.descKey.replace('shop.', '') as keyof typeof d.shop], it.descKey);
    }
  }
});

test('canBuy: alle Gründe', () => {
  const base = { balance: 10000, owned: false, freezes: 0 };
  assert.deepEqual(canBuy(item('theme:sunset'), base), { ok: true });
  assert.deepEqual(canBuy(item('theme:sunset'), { ...base, owned: true }), { ok: false, reason: 'owned' });
  assert.deepEqual(canBuy(item('theme:sunset'), { ...base, balance: 3999 }), { ok: false, reason: 'balance' });
  assert.deepEqual(canBuy(item('theme:sunset'), { ...base, balance: 4000 }), { ok: true });
  assert.deepEqual(canBuy(item('frame:chest'), base), { ok: false, reason: 'notForSale' });
  assert.deepEqual(canBuy(item('frame:chest'), { ...base, owned: true }), { ok: false, reason: 'owned' });
  assert.deepEqual(canBuy(item('freeze'), base), { ok: true });
  assert.deepEqual(canBuy(item('freeze'), { ...base, freezes: MAX_FREEZES - 1 }), { ok: true });
  assert.deepEqual(canBuy(item('freeze'), { ...base, freezes: MAX_FREEZES }), { ok: false, reason: 'max' });
  assert.deepEqual(canBuy(item('freeze'), { ...base, balance: 1499 }), { ok: false, reason: 'balance' });
  assert.equal(missingXp(item('theme:ocean'), 7340), 660);
  assert.equal(missingXp(item('theme:ocean'), 9000), 0);
  assert.equal(missingXp(item('frame:chest'), 0), 0);
});

test('Kauf zieht genau den Preis ab, Level bleibt', () => {
  fresh(5000);
  const before = xpView();
  assert.equal(before.balance, 5000);
  assert.equal(buyItem('theme:sunset', 1000), true);
  const after = xpView();
  assert.equal(after.balance, 1000);
  assert.equal(after.lifetime, before.lifetime);
  assert.equal(after.level, before.level);
  assert.equal(getSettings().purchases['theme:sunset'], 1000);
  // nicht doppelt kaufbar, Guthaben unverändert
  assert.equal(buyItem('theme:sunset'), false);
  assert.equal(xpView().balance, 1000);
});

test('Kauf scheitert ohne Guthaben und bei Truhen-Rahmen, ohne etwas zu ändern', () => {
  fresh(3999);
  assert.equal(buyItem('theme:sunset'), false);
  assert.equal(buyItem('frame:chest'), false);
  assert.equal(buyItem('nichts'), false);
  assert.equal(xpView().balance, 3999);
  assert.deepEqual(getSettings().purchases, {});
});

test('Freeze: nur unter dem Maximum, hängt Zeitpunkt an freezesBought', () => {
  fresh(10000);
  const t0 = new Date(2026, 5, 10, 12).getTime();
  const start = shopState(t0).freezes;
  assert.equal(buyItem('freeze', t0), true);
  assert.equal(xpView().balance, 8500);
  assert.deepEqual(getSettings().freezesBought, [t0]);
  assert.equal(shopState(t0).freezes, Math.min(MAX_FREEZES, start + 1));
  // bis zum Maximum aufstocken, dann ist Schluss
  let bought = 1;
  while (buyItem('freeze', t0 + bought)) bought++;
  assert.ok(shopState(t0 + bought).freezes >= MAX_FREEZES);
  assert.equal(buyItem('freeze', t0 + 99), false);
  assert.equal(xpView().balance, 10000 - 1500 * bought);
});

test('Rahmen: nur besessene wählbar, effectiveFrame ignoriert fremde', () => {
  fresh(7000);
  assert.equal(useFrame('frame:gold'), false);
  assert.equal(buyItem('frame:gold'), true);
  assert.equal(useFrame('frame:gold'), true);
  assert.equal(activeFrame(), 'frame:gold');
  assert.equal(useFrame(''), true);
  assert.equal(activeFrame(), '');
  // gewählt, aber nicht (mehr) besessen, z. B. durch Import
  setSettings({ frame: 'frame:diamond' });
  assert.equal(activeFrame(), '');
  assert.equal(effectiveFrame('frame:chest', { 'frame:chest': 1 }), 'frame:chest');
  assert.equal(effectiveFrame('theme:sand', { 'theme:sand': 1 }), '');
  assert.equal(effectiveFrame('frame:gibtsnicht', { 'frame:gibtsnicht': 1 }), '');
});

test('Themes: Normalisierung kennt die neuen, nicht Besessene fallen auf system zurück', () => {
  for (const th of ['sunset', 'sand', 'ocean'] as const) {
    assert.equal(normalizeTheme(th), th);
    assert.ok(THEME_SETTINGS.includes(th));
    assert.ok(isPremiumTheme(th));
    assert.equal(effectiveTheme(th, {}), 'system');
    assert.equal(effectiveTheme(th, { [`theme:${th}`]: 5 }), th);
  }
  assert.equal(effectiveTheme('neon', {}), 'neon');
  assert.equal(effectiveTheme('system', {}), 'system');
  assert.deepEqual(THEMES.map((x) => x.value), [...THEME_SETTINGS]);
  assert.equal(themeLabel('sunset'), 'Abendrot');
  assert.equal(themeLabel('ocean'), 'Tiefsee');
  setLang('en');
  assert.equal(themeLabel('ocean'), 'Deep sea');
});

/* ---------- Kontrast der neuen Token-Sätze ---------- */

const css = readFileSync(new URL('../public/css/tokens.css', import.meta.url), 'utf8');

function tokens(theme: string): Record<string, string> {
  const m = css.match(new RegExp(`:root\\[data-theme="${theme}"\\][^{]*\\{([^}]*)\\}`));
  assert.ok(m, `Token-Satz ${theme}`);
  const out: Record<string, string> = {};
  for (const x of (m[1] ?? '').matchAll(/([\w-]+):([^;]+);/g)) out[x[1] ?? ''] = (x[2] ?? '').trim();
  return out;
}

const lum = (hex: string): number => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
};
const ratio = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x ?? 0) + 0.05) / ((y ?? 0) + 0.05);
};

// Liga- und Seltenheits-Tokens: dunkle Themes teilen den Nacht-Satz, Sand erbt den hellen Standard (:root)
const LEAGUE_DARK = ['--league-bronze', '--league-silver', '--league-gold', '--league-platinum', '--league-diamond', '--league-master', '--league-champion'];
function leagueTokens(light: boolean): Record<string, string> {
  const block = light
    ? css.match(/--league-bronze:(#\w+); --league-silver:(#\w+); --league-gold:(#\w+); --league-platinum:(#\w+);\s*--league-diamond:(#\w+); --league-master:(#\w+); --league-champion:(#\w+);/)
    : css.match(/:root\[data-theme="night"\][^{]*\{\s*--league-bronze:(#\w+); --league-silver:(#\w+); --league-gold:(#\w+); --league-platinum:(#\w+);\s*--league-diamond:(#\w+); --league-master:(#\w+); --league-champion:(#\w+);/);
  assert.ok(block);
  return Object.fromEntries(LEAGUE_DARK.map((k, i) => [k, block[i + 1] ?? '']));
}

for (const [theme, light] of [['sunset', false], ['sand', true], ['ocean', false]] as const) {
  test(`Kontrast ${theme}: Text, Akzent, Status, Ligen`, () => {
    const k = tokens(theme);
    const need = (name: string): string => { const v = k[name]; assert.ok(v && v.startsWith('#'), `${theme} ${name}`); return v; };
    for (const bg of ['--bg', '--surface', '--surface-2']) {
      assert.ok(ratio(need('--text'), need(bg)) >= 4.5, `${theme} text auf ${bg}`);
      assert.ok(ratio(need('--muted'), need(bg)) >= 4.5, `${theme} muted auf ${bg}`);
      assert.ok(ratio(need('--accent-text'), need(bg)) >= 4.5, `${theme} accent-text auf ${bg}`);
    }
    for (const s of ['--good', '--bad', '--warn', '--streak']) {
      assert.ok(ratio(need(s), need('--surface')) >= 4.5, `${theme} ${s} auf Fläche`);
    }
    assert.ok(ratio(need('--on-accent'), need('--accent')) >= 4.5, `${theme} on-accent`);
    assert.equal(k['color-scheme'], light ? 'light' : 'dark');
    const league = leagueTokens(light);
    for (const [name, v] of Object.entries(league)) {
      assert.ok(ratio(v, need('--surface')) >= 3, `${theme} ${name} auf Fläche`);
      assert.ok(ratio(v, need('--bg')) >= 3, `${theme} ${name} auf Hintergrund`);
    }
  });
}
