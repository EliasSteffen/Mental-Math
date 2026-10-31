import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { allKeys, detectLang, getLang, locale, setLang, t } from '../src/i18n/index.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';
import { fmt, fmtSeconds, parseAnswer, unitFactor } from '../src/core/numbers.ts';
import { CATEGORIES, SUBTYPES, LEVEL_NAMES } from '../src/core/catalog.ts';
import { generate } from '../src/core/generators/index.ts';
import { modeName } from '../src/core/modes.ts';
import { dailyShareText } from '../src/core/daily.ts';
import { recommendation } from '../src/core/progress.ts';

afterEach(() => setLang('de'));

const dicts = { de, en } as unknown as Record<'de' | 'en', Record<string, Record<string, string>>>;
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

test('Schlüsselparität de/en in allen Namespaces', () => {
  const a = allKeys('de').sort();
  const b = allKeys('en').sort();
  assert.deepEqual(b.filter((k) => !a.includes(k)), [], 'nur in en');
  assert.deepEqual(a.filter((k) => !b.includes(k)), [], 'nur in de');
  assert.ok(a.length > 200, 'core ist befüllt');
});

test('keine leeren Werte, Platzhalter stimmen überein', () => {
  for (const ns of Object.keys(dicts.de)) {
    for (const [k, v] of Object.entries(dicts.de[ns] ?? {})) {
      const e = dicts.en[ns]?.[k] ?? '';
      assert.ok(v.trim() !== '', `de.${ns}.${k} leer`);
      assert.ok(e.trim() !== '', `en.${ns}.${k} leer`);
      assert.deepEqual(placeholders(e), placeholders(v), `Platzhalter ${ns}.${k}`);
    }
  }
});

test('t(): Fallback auf Deutsch und auf den Schlüssel, Platzhalter', () => {
  assert.equal(t('core.level.1'), 'Leicht');
  setLang('en');
  assert.equal(t('core.level.1'), 'Easy');
  assert.equal(t('core.rec.review.many', { n: 3 }), '3 reviews due');
  assert.equal(t('core.nix.nope' as 'core.x'), 'core.nix.nope');
  assert.equal(t('core.rec.review.many'), '{n} reviews due');
  // Fallback auf de, wenn en den Schlüssel nicht kennt
  const enCore = dicts.en['core'] as Record<string, string>;
  const saved = enCore['level.1'];
  delete enCore['level.1'];
  try { assert.equal(t('core.level.1'), 'Leicht'); } finally { enCore['level.1'] = saved as string; }
});

test('detectLang', () => {
  assert.equal(detectLang('de', ['en-US']), 'de');
  assert.equal(detectLang('en', ['de-DE']), 'en');
  assert.equal(detectLang('auto', ['de-AT', 'en']), 'de');
  assert.equal(detectLang('auto', ['fr-FR']), 'en');
  assert.equal(detectLang('auto', ['en-GB']), 'en');
  assert.equal(detectLang('auto', []), 'de');
  assert.equal(locale('de'), 'de-DE');
  assert.equal(locale('en'), 'en-US');
});

test('fmt / fmtSeconds in beiden Sprachen', () => {
  assert.equal(fmt(1234.5), '1.234,5');
  assert.equal(fmtSeconds(2500), '2,5 s');
  setLang('en');
  assert.equal(fmt(1234.5), '1,234.5');
  assert.equal(fmt(2025), '2,025');
  assert.equal(fmt(1000000), '1,000,000');
  assert.equal(fmt(-4), '−4');
  assert.equal(fmt(0.09), '0.09');
  assert.equal(fmtSeconds(2500), '2.5 s');
});

test('parseAnswer in beiden Sprachen', () => {
  assert.equal(parseAnswer('1.234,5'), 1234.5);
  assert.equal(parseAnswer('1.200'), 1200);
  assert.equal(parseAnswer('2,5 Mio.'), 2500000);
  setLang('en');
  assert.equal(parseAnswer('1,234.5'), 1234.5);
  assert.equal(parseAnswer('37.5'), 37.5);
  assert.equal(parseAnswer('1,200'), 1200);
  assert.equal(parseAnswer('−4'), -4);
  assert.equal(parseAnswer('15 %'), 15);
  assert.equal(parseAnswer('2.5M'), 2500000);
  assert.equal(parseAnswer('3 bn'), 3e9);
  assert.equal(parseAnswer('abc'), null);
  assert.equal(parseAnswer(''), null);
});

test('Katalog, Modi, Empfehlung, Daily folgen der Sprache', () => {
  assert.equal(SUBTYPES['mult.2x1']?.name, '2-stellig × 1-stellig');
  assert.equal(modeName('mult.2x1'), 'Multiplikation · 2-stellig × 1-stellig');
  setLang('en');
  assert.equal(SUBTYPES['mult.2x1']?.name, '2-digit × 1-digit');
  assert.equal(CATEGORIES.find((c) => c.id === 'mult')?.name, 'Multiplication');
  assert.equal(CATEGORIES[0]?.name, 'Times tables');
  assert.equal(LEVEL_NAMES[3], 'Hard');
  assert.equal(modeName('weak'), 'Weak spots');
  assert.equal(modeName('mult.2x1'), 'Multiplication · 2-digit × 1-digit');
  assert.equal(recommendation([], null, Date.now()).reason, 'Never practised');
  const share = dailyShareText({ correct: 13, n: 15, points: 1240, timeMs: 151000 } as never, '2026-10-30', 'https://x');
  assert.equal(share, 'Mental Math Daily 10/30/2026: 13/15 · 1,240 pts · 2:31 min\nhttps://x');
  setLang('de');
  assert.equal(dailyShareText({ correct: 13, n: 15, points: 1240, timeMs: 151000 } as never, '2026-10-30', 'https://x'),
    'Mental Math Daily 30.10.2026: 13/15 · 1.240 Pkt · 2:31 min\nhttps://x');
});

test('Generatoren liefern englische Texte bei setLang(en)', () => {
  const seq = (): (() => number) => { let i = 0; return () => ((i = (i * 7 + 3) % 97) + 0.5) / 100; };
  setLang('en');
  const german = /\b(von|auf|Mio\.|Mrd\.|Tsd\.|Jahre|Umsatz|Wachstum|Nachkomma|ganze Zahl|Einwohner|Fixkosten|Stück)\b/;
  for (const id of Object.keys(SUBTYPES)) {
    for (const level of [1, 2, 3] as const) {
      const task = generate(id, seq(), { level });
      for (const text of [task.prompt, task.hint, task.unit, ...(task.kind === 'choice' ? task.choices : [])]) {
        assert.ok(!german.test(text), `${id} L${level}: deutscher Rest in "${text}"`);
      }
    }
  }
  assert.match(generate('pct.of', seq(), { level: 1 }).prompt, /^\d+% of [\d,]+$/);
  assert.match(generate('big.percapita', seq()).prompt, /per person\?$/);
  assert.equal(generate('div.round', seq()).hint, 'round to a whole number');
  const big = generate('big.mult', seq());
  assert.match(big.prompt, / (K|M) × /);
  assert.ok(unitFactor(big.kind === 'choice' ? '' : big.unit) > 1);
  assert.equal(unitFactor('K €/month'), 1e3);
  assert.equal(unitFactor('km/h'), 1);
  assert.equal(unitFactor('m/s'), 1);
  setLang('de');
  assert.match(generate('pct.of', seq(), { level: 1 }).prompt, /^\d+ % von [\d.]+$/);
  assert.equal(generate('div.round', seq()).hint, 'auf ganze Zahl runden');
  assert.equal(getLang(), 'de');
});

test('Einheiten-Auswahlaufgabe: Optionen lokalisiert, Index bleibt gültig', () => {
  setLang('en');
  for (let i = 0; i < 20; i++) {
    const task = generate('units.result', undefined, { level: 2 });
    assert.equal(task.kind, 'choice');
    if (task.kind !== 'choice') return;
    assert.ok(task.choices[task.expected] !== undefined);
    assert.ok(task.choices.every((c, j) => task.params['c' + j] === c));
    assert.ok(!task.choices.some((c) => /Jahr|Stück|Mitarbeiter/.test(c)));
  }
});
