import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSettings, setSettings, getReviews, setReviews, getActivity, addActivityMs, resetAll, load, save,
  getDailyResults, setDailyResult, getChainBest, setChainBest, addAttempt, addSession, getAttempts, getSessions,
  invalidateCache, exportJSON, DEFAULT_SETTINGS, getParallelStats, getProfile,
} from '../src/data/storage.ts';
import type { Attempt, DailyResult, Session, State } from '../src/types.ts';

const KEY = 'kopfrechner.v1';
const V3 = 'mm:v3:';

interface FakeStorage extends Storage { reads: number; writes: number; raw: Map<string, string> }

function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const raw = new Map(Object.entries(initial));
  const fs = {
    reads: 0,
    writes: 0,
    raw,
    get length() { return raw.size; },
    clear() { raw.clear(); },
    key(i: number) { return [...raw.keys()][i] ?? null; },
    getItem(k: string) { fs.reads++; return raw.get(k) ?? null; },
    setItem(k: string, v: string) { fs.writes++; raw.set(k, String(v)); },
    removeItem(k: string) { raw.delete(k); },
  };
  return fs;
}

function withStorage(fs: Storage | null, fn: () => void): void {
  resetAll();
  if (fs) (globalThis as { localStorage?: Storage }).localStorage = fs;
  invalidateCache();
  try {
    fn();
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    resetAll();
  }
}

const att = (o: Partial<Attempt> = {}): Attempt => ({
  ts: 1, sessionId: 's', mode: 'all', category: 'pct', subtype: 'pct.of', prompt: '', unit: '', expected: 1, given: 1,
  correct: true, errorType: null, timeMs: 1000, targetMs: 2000, weight: 1, points: 100, ...o,
});

test('Defaults, alte Daten werden ergänzt (In-Memory)', () => {
  resetAll();
  assert.deepEqual(getSettings(), {
    sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto', timer: true, sound: false, haptics: true, celebrated: '', keypad: 'auto', enabledCategories: null,
    autoSubmit: false, numpadLayout: 'calculator', estimateMode: false, ghost: true, autoFail: false,
    lang: 'auto', lastSeenVersion: '', timerDisplay: 'calm', breathe: false, confetti: false,
    lastStoreCheck: 0, updateNotifiedVersion: '', updateNotifiedAt: 0, reviewAskedVersion: '', reviewAskedAt: 0,
  });
  assert.deepEqual(getReviews(), {});
  assert.deepEqual(getActivity(), {});
  save({ version: 1, attempts: [], sessions: [], settings: { sessionLength: 20 } } as unknown as State);
  assert.equal(getSettings().sessionLength, 20);
  assert.equal(getSettings().dailyGoalMin, 15);
  assert.deepEqual(getReviews(), {});
});

test('settings, reviews, activity', () => {
  resetAll();
  setSettings({ theme: 'oled' });
  assert.equal(getSettings().theme, 'oled');
  setReviews({ a: { box: 1, dueAt: 5, lastTs: 1 } });
  assert.deepEqual(getReviews(), { a: { box: 1, dueAt: 5, lastTs: 1 } });
  const ts = new Date(2026, 5, 10, 12).getTime();
  addActivityMs(5000, ts);
  addActivityMs(5000, ts + 1000);
  assert.deepEqual(getActivity(), { '2026-06-10': 10000 });
  assert.equal(load().settings.theme, 'oled');
});

test('Activity: max. 400 Tage', () => {
  resetAll();
  for (let i = 0; i < 410; i++) addActivityMs(1000, new Date(2025, 0, 1 + i, 12).getTime());
  const keys = Object.keys(getActivity()).sort();
  assert.equal(keys.length, 400);
  assert.equal(keys[keys.length - 1], '2026-02-14');
  assert.ok(!('2025-01-01' in getActivity()));
});

test('Kaputtes localStorage fällt auf Memory zurück', () => {
  resetAll();
  const broken = {
    getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); },
  } as unknown as Storage;
  (globalThis as { localStorage?: Storage }).localStorage = broken;
  try {
    addActivityMs(1000, new Date(2026, 0, 1, 12).getTime());
    assert.equal(getActivity()['2026-01-01'], 1000);
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    resetAll();
  }
});

// ---------- v2: Migration ----------
test('Migration v1 → v2: Daten bleiben, neue Felder und Defaults kommen dazu', () => {
  const v1 = {
    version: 1,
    attempts: [att({ ts: 42 })],
    sessions: [{ id: 's1', ts: 1, mode: 'all', n: 10, correct: 8, points: 900, avgTimeMs: 4000 }],
    settings: { sessionLength: 20, theme: 'neon', dailyGoalMin: 15, difficulty: 2, timer: false, sound: true, haptics: false, celebrated: '2026-06-01', keypad: 'on', enabledCategories: ['mult'] },
    reviews: { 'pct.of': { box: 1, dueAt: 5, lastTs: 1 } },
    activity: { '2026-06-10': 60000 },
  };
  const fs = fakeStorage({ [KEY]: JSON.stringify(v1) });
  withStorage(fs, () => {
    const s = load();
    assert.equal(s.version, 2);
    assert.deepEqual(s.dailyResults, {});
    assert.deepEqual(s.chainBest, {});
    assert.deepEqual(s.parallel, { nextStart: 2, bestChains: 0, bestCorrectStreak: 0, rounds: 0 });
    assert.equal(s.settings.autoSubmit, false);
    assert.equal(s.settings.numpadLayout, 'calculator');
    assert.equal(s.settings.estimateMode, false);
    assert.equal(s.settings.ghost, true);
    // bestehende Werte bleiben
    assert.equal(s.settings.sessionLength, 20);
    assert.equal(s.settings.theme, 'neon');
    assert.equal(s.settings.difficulty, 2);
    assert.equal(s.settings.timer, false);
    // Ruhiger Fokus: Zeitanzeige folgt dem alten timer, neue Schalter aus
    assert.equal(s.settings.timerDisplay, 'off');
    assert.equal(s.settings.breathe, false);
    assert.equal(s.settings.confetti, false);
    assert.deepEqual(s.settings.enabledCategories, ['mult']);
    assert.equal(s.attempts[0]?.ts, 42);
    assert.equal(s.sessions.length, 1);
    assert.deepEqual(s.reviews, v1.reviews);
    assert.deepEqual(s.activity, v1.activity);
    // Nach der Migration liegt v3 im Speicher, der alte Stand bleibt als Backup
    setSettings({ ghost: false });
    const stored = JSON.parse(fs.raw.get(V3 + 'doc:settings') ?? '{}') as Record<string, unknown>;
    assert.equal(stored.ghost, false);
    assert.equal(stored.sessionLength, 20);
    assert.equal((JSON.parse(fs.raw.get(V3 + 'col:results') ?? '[]') as unknown[]).length, 1);
    assert.ok(!fs.raw.has(KEY));
    assert.equal(fs.raw.get(KEY + '.bak'), JSON.stringify(v1));
  });
});

test('Kaputtes JSON im localStorage → Defaults, kein Absturz', () => {
  withStorage(fakeStorage({ [KEY]: '{nicht json' }), () => {
    const s = load();
    assert.equal(s.version, 2);
    assert.deepEqual(s.attempts, []);
    assert.deepEqual(s.settings, DEFAULT_SETTINGS);
  });
});

test('Falsch typisierte Felder werden durch Defaults ersetzt', () => {
  withStorage(fakeStorage({ [KEY]: JSON.stringify({ version: 1, attempts: 'x', sessions: 5, settings: [], reviews: [], activity: null, dailyResults: [], chainBest: 3 }) }), () => {
    const s = load();
    assert.deepEqual(s.attempts, []);
    assert.deepEqual(s.sessions, []);
    assert.deepEqual(s.settings, DEFAULT_SETTINGS);
    assert.deepEqual(s.reviews, {});
    assert.deepEqual(s.activity, {});
    assert.deepEqual(s.dailyResults, {});
    assert.deepEqual(s.chainBest, {});
  });
});

// ---------- Cache ----------
test('Cache: Getter lesen den Speicher nur einmal', () => {
  const fs = fakeStorage({ [KEY]: JSON.stringify({ version: 2, attempts: [att()] }) });
  withStorage(fs, () => {
    const all = (): void => { getAttempts(); getSessions(); getSettings(); getReviews(); getActivity(); getDailyResults(); getChainBest(); getParallelStats(); };
    all();
    const reads = fs.reads;
    for (let i = 0; i < 10; i++) all();
    assert.equal(fs.reads, reads, 'wiederholte Getter treffen den Cache');
    assert.equal(getAttempts().length, 1);
  });
});

test('Cache: Write-Through bei Mutationen, ohne erneutes Lesen', () => {
  const fs = fakeStorage();
  withStorage(fs, () => {
    getSettings();
    getAttempts();
    getSessions();
    getReviews();
    getActivity();
    getDailyResults();
    getChainBest();
    getProfile(); // liest auch die Geräte-ID
    const reads = fs.reads;
    const writes = fs.writes;
    setSettings({ theme: 'paper' });
    assert.ok(fs.writes > writes);
    addAttempt(att({ ts: 7 }));
    addSession({ id: 'x', ts: 1, mode: 'all', n: 1, correct: 1, points: 1, avgTimeMs: 1 } satisfies Session);
    setReviews({ a: { box: 0, dueAt: 1, lastTs: 0 } });
    addActivityMs(100, new Date(2026, 0, 1, 12).getTime());
    setDailyResult('2026-01-01', { n: 15, correct: 12, points: 1000, timeMs: 90000, ts: 5 });
    setChainBest(2, 6);
    assert.equal(fs.reads, reads, 'Mutationen lesen nicht erneut');
    const doc = (n: string): Record<string, unknown> => JSON.parse(fs.raw.get(V3 + n) ?? '{}') as Record<string, unknown>;
    assert.equal(doc('doc:settings').theme, 'paper');
    assert.equal((JSON.parse(fs.raw.get(V3 + 'col:results') ?? '[]') as Attempt[])[0]?.ts, 7);
    assert.equal((JSON.parse(fs.raw.get(V3 + 'col:sessions') ?? '[]') as unknown[]).length, 1);
    assert.deepEqual(doc('doc:chainBest'), { 2: 6 });
    assert.equal((doc('doc:dailyResults')['2026-01-01'] as DailyResult).correct, 12);
    assert.equal(getAttempts().length, 1);
    assert.equal(getSessions().length, 1);
  });
});

test('Cache: invalidateCache liest geänderte Daten neu ein', () => {
  const fs = fakeStorage();
  withStorage(fs, () => {
    assert.equal(getSettings().sessionLength, 10);
    fs.raw.set(V3 + 'doc:settings', JSON.stringify({ sessionLength: 30, updatedAt: 1 }));
    assert.equal(getSettings().sessionLength, 10, 'ohne Invalidierung bleibt der Cache');
    invalidateCache();
    assert.equal(getSettings().sessionLength, 30);
  });
});

test('Cache: storage-Event aus anderem Tab invalidiert (nur Schlüssel oder clear)', async () => {
  const handlers: Array<(e: Event) => void> = [];
  const g = globalThis as { addEventListener?: unknown };
  const prev = g.addEventListener;
  g.addEventListener = (type: string, h: (e: Event) => void) => { if (type === 'storage') handlers.push(h); };
  try {
    const url = new URL('../src/data/storage.ts?events', import.meta.url).href;
    const mod = (await import(url)) as typeof import('../src/data/storage.ts');
    assert.equal(handlers.length, 1);
    const fs = fakeStorage();
    (globalThis as { localStorage?: Storage }).localStorage = fs;
    try {
      assert.equal(mod.getSettings().sessionLength, 10);
      fs.raw.set(V3 + 'doc:settings', JSON.stringify({ sessionLength: 25 }));
      const fire = (key: string | null): void => {
        const e = new Event('storage') as Event & { key: string | null };
        e.key = key;
        handlers[0]?.(e);
      };
      fire('anderer.key');
      assert.equal(mod.getSettings().sessionLength, 10, 'fremder Schlüssel ignorieren');
      fire(V3 + 'doc:settings');
      assert.equal(mod.getSettings().sessionLength, 25);
      fs.raw.set(V3 + 'doc:settings', JSON.stringify({ sessionLength: 40 }));
      fire(null);
      assert.equal(mod.getSettings().sessionLength, 40);
    } finally {
      delete (globalThis as { localStorage?: Storage }).localStorage;
      mod.resetAll();
    }
  } finally {
    g.addEventListener = prev;
  }
});

// ---------- v2: Daily & Kettenrechnen ----------
test('dailyResults und chainBest', () => {
  resetAll();
  assert.deepEqual(getDailyResults(), {});
  assert.deepEqual(getChainBest(), {});
  const r: DailyResult = { n: 15, correct: 13, points: 1234, timeMs: 80000, ts: 99 };
  setDailyResult('2026-06-10', r);
  assert.deepEqual(getDailyResults(), { '2026-06-10': r });
  setDailyResult('2026-06-10', { ...r, correct: 14 });
  assert.equal(getDailyResults()['2026-06-10']?.correct, 14);
  setChainBest(1, 4);
  setChainBest(3, 9);
  setChainBest(1, 5);
  assert.deepEqual(getChainBest(), { 1: 5, 3: 9 });
  assert.equal(load().version, 2);
  assert.deepEqual(JSON.parse(exportJSON()).chainBest, { 1: 5, 3: 9 });
  resetAll();
  assert.deepEqual(getDailyResults(), {});
  assert.deepEqual(getChainBest(), {});
});

test('resetAll leert Speicher und Cache', () => {
  const fs = fakeStorage();
  withStorage(fs, () => {
    setSettings({ sessionLength: 99 });
    assert.ok(fs.raw.has(V3 + 'doc:settings'));
    resetAll();
    assert.ok(!fs.raw.has(V3 + 'doc:settings'));
    assert.equal(getSettings().sessionLength, 10);
  });
});
