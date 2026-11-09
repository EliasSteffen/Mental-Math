import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { tourMs, type TourStep } from '../src/core/tour.ts';
import { TOURS } from '../src/features/tour-scripts.ts';
import { demoChallengeResponder, demoTasks, seedDemoData } from '../src/features/tour-demo.ts';
import { RELEASES } from '../src/releases.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';
import {
  addAttempt, enterDemoData, exitDemoData, getAttempts, getRepository, getSettings, isDemoData, onChange, resetAll, setSettings,
} from '../src/data/storage.ts';
import { getAccountState, setDemoAccount, type AccountState } from '../src/features/account.ts';
import { loadBoard, loadOverview, setDemoChallenge } from '../src/features/challenge.ts';

const PHONE = { tablet: false, wide: false };
const TABLET = { tablet: true, wide: true };
const allSteps = (): TourStep[] => Object.values(TOURS).flatMap((tour) => tour.chapters.flatMap((c) => c.steps));

afterEach(() => { exitDemoData(); setDemoAccount(null); setDemoChallenge(null); });

test('Rundgang: alle Texte gibt es auf Deutsch und Englisch', () => {
  const keys = new Set<string>();
  for (const tour of Object.values(TOURS)) for (const c of tour.chapters) keys.add(c.title);
  for (const s of allSteps()) if (s.kind === 'say' || s.kind === 'ask') keys.add(s.text);
  for (const key of keys) {
    const name = key.replace('tour.', '') as keyof typeof de.tour;
    assert.ok(de.tour[name], `de ${key}`);
    assert.ok(en.tour[name], `en ${key}`);
  }
});

test('Store-Video bleibt in Apples Vorgabe von 15 bis 30 Sekunden', () => {
  for (const layout of [PHONE, TABLET]) {
    const s = tourMs(TOURS.store.chapters, layout) / 1000;
    assert.ok(s >= 15 && s <= 30, `${s} s`);
  }
});

test('Einführung dauert rund anderthalb Minuten, Update-Rundgang rund 20 Sekunden', () => {
  const intro = tourMs(TOURS.intro.chapters, PHONE) / 1000;
  assert.ok(intro >= 70 && intro <= 120, `${intro} s`);
  const update = tourMs(TOURS.v2.chapters, TABLET) / 1000;
  assert.ok(update >= 12 && update <= 30, `${update} s`);
});

test('Releases verweisen nur auf vorhandene Rundgänge', () => {
  for (const r of RELEASES) if (r.tour) assert.ok(TOURS[r.tour], r.version);
});

test('Demo-Aufgaben sind reproduzierbar und per Tastenfeld tippbar', () => {
  const a = demoTasks(['mult.2x1', 'mult.square'], 7);
  assert.deepEqual(a.map((t) => t.prompt), demoTasks(['mult.2x1', 'mult.square'], 7).map((t) => t.prompt));
  for (const t of a) assert.ok(Number.isInteger(t.expected) && t.expected > 0, t.prompt);
});

test('Demo-Daten berühren die echten Daten nicht, und Sync bleibt am echten Repository', () => {
  resetAll();
  setSettings({ sessionLength: 20 });
  const realRepo = getRepository();
  const before = getAttempts().length;
  enterDemoData();
  assert.equal(isDemoData(), true);
  assert.equal(getRepository(), realRepo, 'Sync sieht weiter das echte Repository');
  seedDemoData({ lang: 'de', theme: 'paper', keypadSide: 'right', numpadLayout: 'calculator' });
  assert.ok(getAttempts().length > 100);
  assert.equal(getSettings().keypad, 'on');
  assert.equal(getSettings().sessionLength, 10);
  exitDemoData();
  assert.equal(isDemoData(), false);
  assert.equal(getAttempts().length, before);
  assert.equal(getSettings().sessionLength, 20);
  assert.equal(getSettings().keypad, 'auto');
});

test('Demo-Daten: echte Änderungen währenddessen werden nachgemeldet, Demo-Schreiben nie', () => {
  resetAll();
  const seen: string[] = [];
  const off = onChange((source) => seen.push(source));
  enterDemoData();
  addAttempt({
    ts: 1, sessionId: 's', mode: 'all', category: 'pct', subtype: 'pct.of', prompt: '', unit: '', expected: 1, given: 1,
    correct: true, errorType: null, timeMs: 1, targetMs: 2, weight: 1, points: 1,
  });
  assert.deepEqual(seen, []);
  exitDemoData();
  assert.deepEqual(seen, [], 'ohne Änderung von außen keine Meldung');
  off();
});

test('Demo-Konto: Sitzung nur für die Oberfläche, Wettkampf ohne Netz', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('kein Netz im Rundgang'); };
  try {
    const before = getAccountState();
    setDemoAccount({ status: 'signed-in', user: { id: 'demo', username: 'Demo' } } as AccountState);
    assert.equal(getAccountState().status, 'signed-in');
    setDemoChallenge(demoChallengeResponder(Date.UTC(2026, 10, 9, 12)));
    const o = await loadOverview();
    assert.equal(o.daily.state, 'open');
    const b = await loadBoard(o.daily.id, null);
    assert.equal(b.top.length, 8);
    setDemoAccount(null);
    assert.equal(getAccountState(), before);
  } finally {
    globalThis.fetch = realFetch;
  }
});
