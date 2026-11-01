// Update-Hinweis der iOS-App (features/app-update.ts): Drossel, Versionsvergleich, Meldepause, Ablauf um Runden herum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RENOTIFY_MS, STORE_CHECK_INTERVAL_MS, createStoreUpdateFlow, isNewer, shouldCheck, shouldNotify, storeVersionOf,
  type StoreUpdateDeps, type StoreUpdateState,
} from '../src/features/app-update.ts';
import { APP_BUNDLE_ID, APP_STORE_ID, APP_STORE_URL, fetchStoreVersion, openStorePage, requestStoreReview } from '../src/platform/index.ts';
import { appStorePlugin } from '../src/platform/native.ts';
import { getSettings, getSyncState, invalidateCache, resetAll, setDeviceSettings, setSettings } from '../src/data/storage.ts';

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 1, 12);

test('shouldCheck: noch nie, nach ≥ 24 h oder bei zurückgestellter Uhr', () => {
  assert.equal(STORE_CHECK_INTERVAL_MS, 24 * H);
  assert.equal(shouldCheck(T0, 0), true);
  assert.equal(shouldCheck(T0, T0), false);
  assert.equal(shouldCheck(T0 + 24 * H - 1, T0), false);
  assert.equal(shouldCheck(T0 + 24 * H, T0), true);
  assert.equal(shouldCheck(T0 - 1, T0), true);
  assert.equal(shouldCheck(T0, Number.NaN), true);
});

test('isNewer: SemVer-Vergleich, ungültige Angaben nie neuer', () => {
  assert.equal(isNewer('1.15.0', '1.14.0'), true);
  assert.equal(isNewer('1.10.0', '1.9.9'), true);
  assert.equal(isNewer('2.0', '1.99.99'), true);
  assert.equal(isNewer('1.14.0', '1.14.0'), false);
  assert.equal(isNewer('1.13.9', '1.14.0'), false);
  assert.equal(isNewer('', '1.14.0'), false);
  assert.equal(isNewer('1.15.0-beta', '1.14.0'), false);
  assert.equal(isNewer('1.15.0', ''), false);
});

test('shouldNotify: neuere Version, andere als zuletzt gemeldet oder ≥ 72 h seit der Meldung', () => {
  assert.equal(RENOTIFY_MS, 72 * H);
  const base = { store: '1.15.0', current: '1.14.0', notifiedVersion: '', notifiedAt: 0, now: T0 };
  assert.equal(shouldNotify(base), true);
  assert.equal(shouldNotify({ ...base, store: '1.14.0' }), false, 'nicht neuer');
  const same = { ...base, notifiedVersion: '1.15.0', notifiedAt: T0 - 71 * H };
  assert.equal(shouldNotify(same), false, 'dieselbe Version innerhalb von 72 h');
  assert.equal(shouldNotify({ ...same, notifiedAt: T0 - 72 * H }), true, 'dieselbe Version nach 72 h');
  assert.equal(shouldNotify({ ...same, store: '1.15.1' }), true, 'neuere Version sofort');
  assert.equal(shouldNotify({ ...same, notifiedAt: T0 + H }), true, 'Uhr zurückgestellt');
  assert.equal(shouldNotify({ ...same, current: '1.15.0', notifiedAt: 0 }), false, 'schon aktualisiert');
});

test('storeVersionOf: Objekt oder JSON-Text, sonst null', () => {
  assert.equal(storeVersionOf({ resultCount: 1, results: [{ version: '1.15.0' }] }), '1.15.0');
  assert.equal(storeVersionOf('{"resultCount":1,"results":[{"version":" 1.16.2 "}]}'), '1.16.2');
  assert.equal(storeVersionOf({ resultCount: 0, results: [] }), null, 'noch nicht im Store');
  for (const bad of [null, undefined, 5, '', 'kein json', {}, { results: 'x' }, { results: [null] }, { results: [{ version: 3 }] }, { results: [{ version: 'neu' }] }]) {
    assert.equal(storeVersionOf(bad), null, JSON.stringify(bad));
  }
});

test('Konstanten: Bundle-ID wie capacitor.config.json, App-Store-Link aus der ID', () => {
  const cfg = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8')) as { appId: string };
  assert.equal(APP_BUNDLE_ID, cfg.appId);
  assert.match(APP_STORE_ID, /^\d+$/);
  assert.equal(APP_STORE_URL, `https://apps.apple.com/app/id${APP_STORE_ID}`);
});

test('Website: App-Store-Funktionen ohne Wirkung', async () => {
  assert.equal(await requestStoreReview(), false);
  assert.equal(await openStorePage(true), undefined);
  assert.equal(await fetchStoreVersion(), null);
});

test('appStorePlugin: await liefert ein schlichtes Objekt (kein Proxy-then), Aufrufe gehen ans Plugin', async () => {
  const p = await appStorePlugin();
  assert.equal(typeof (p as unknown as { then?: unknown }).then, 'undefined');
  assert.equal(await appStorePlugin(), p);
  const code = await p.requestReview().then(() => 'ok', (e: { code?: unknown }) => e.code);
  assert.equal(code, 'UNIMPLEMENTED');
});

test('setDeviceSettings: nur geräte-lokale Schlüssel, ohne neues updatedAt und ohne Outbox (schlägt im Sync-LWW nichts)', () => {
  const raw = new Map<string, string>();
  const ls = {
    get length() { return raw.size; },
    clear() { raw.clear(); },
    key: (i: number) => [...raw.keys()][i] ?? null,
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => { raw.set(k, String(v)); },
    removeItem: (k: string) => { raw.delete(k); },
  } as Storage;
  resetAll();
  (globalThis as { localStorage?: Storage }).localStorage = ls;
  invalidateCache();
  try {
    setSettings({ theme: 'oled' });
    const doc = (): Record<string, unknown> => JSON.parse(raw.get('mm:v3:doc:settings') ?? '{}') as Record<string, unknown>;
    const updatedAt = doc().updatedAt;
    const pending = getSyncState().pending.length;
    assert.equal(typeof updatedAt, 'number');
    const s = setDeviceSettings({ lastStoreCheck: 123, reviewAskedVersion: '1.15.0', theme: 'neon' });
    assert.equal(s.lastStoreCheck, 123);
    assert.equal(s.reviewAskedVersion, '1.15.0');
    assert.equal(s.theme, 'oled', 'synchronisierte Einstellung bleibt unverändert');
    assert.equal(doc().updatedAt, updatedAt);
    assert.equal(doc().lastStoreCheck, 123);
    assert.equal(getSyncState().pending.length, pending);
    assert.equal(getSettings().lastStoreCheck, 123);
  } finally {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    invalidateCache();
    resetAll();
  }
});

interface Harness {
  deps: StoreUpdateDeps;
  log: string[];
  state: StoreUpdateState;
  set(o: { hash?: string; now?: number; store?: string | null }): void;
  click(): void;
}

function harness(): Harness {
  let hash = '#/';
  let now = T0;
  let store: string | null = '1.15.0';
  let onUpdate: (() => void) | null = null;
  const log: string[] = [];
  const state: StoreUpdateState = { lastStoreCheck: 0, updateNotifiedVersion: '', updateNotifiedAt: 0 };
  const deps: StoreUpdateDeps = {
    now: () => now,
    hash: () => hash,
    current: '1.14.0',
    load: () => ({ ...state }),
    save: (p) => { Object.assign(state, p); },
    fetchVersion: () => { log.push('fetch'); return Promise.resolve(store); },
    showHint: (fn) => {
      onUpdate = fn;
      log.push('show');
      return () => { onUpdate = null; log.push('hide'); };
    },
    openStore: () => { log.push('store'); },
  };
  return {
    deps, log, state,
    set: (o) => {
      if (o.hash !== undefined) hash = o.hash;
      if (o.now !== undefined) now = o.now;
      if (o.store !== undefined) store = o.store;
    },
    click: () => { assert.ok(onUpdate, 'kein Hinweis sichtbar'); const fn = onUpdate; onUpdate = null; fn(); },
  };
}

test('Ablauf: Start fragt, Hinweis → „Aktualisieren“ öffnet den Store; resume innerhalb von 24 h fragt nicht erneut', async () => {
  const h = harness();
  const flow = createStoreUpdateFlow(h.deps);
  await Promise.all([flow.check(), flow.check()]); // Start und resume gleichzeitig: eine Abfrage
  assert.deepEqual(h.log, ['fetch', 'show']);
  assert.deepEqual(h.state, { lastStoreCheck: T0, updateNotifiedVersion: '1.15.0', updateNotifiedAt: T0 });
  h.click();
  assert.deepEqual(h.log, ['fetch', 'show', 'store']);
  flow.routeChanged();
  h.set({ now: T0 + 23 * H });
  await flow.check();
  assert.deepEqual(h.log, ['fetch', 'show', 'store']);
});

test('Ablauf: dieselbe Version erst nach 72 h erneut, eine neuere sofort; ohne Store-Eintrag nichts', async () => {
  const h = harness();
  const flow = createStoreUpdateFlow(h.deps);
  await flow.check();
  h.click();
  h.set({ now: T0 + 25 * H });
  await flow.check();
  assert.deepEqual(h.log, ['fetch', 'show', 'store', 'fetch'], 'nach 25 h: abgefragt, aber nicht gemeldet');
  h.set({ now: T0 + 50 * H, store: '1.15.1' });
  await flow.check();
  assert.deepEqual(h.log.slice(-2), ['fetch', 'show']);
  h.click();
  h.set({ now: T0 + 200 * H, store: null }); // noch nicht live bzw. offline
  await flow.check();
  assert.deepEqual(h.log.slice(-2), ['store', 'fetch']);
  assert.equal(h.state.lastStoreCheck, T0 + 200 * H);
});

test('Ablauf: nie während einer Runde – Abfrage danach, Hinweis während der Runde ausgeblendet', async () => {
  const h = harness();
  h.set({ hash: '#/train/mult?n=10' });
  const flow = createStoreUpdateFlow(h.deps);
  await flow.check();
  assert.deepEqual(h.log, []);
  h.set({ hash: '#/train/mult?n=10&intro=1' });
  flow.routeChanged();
  assert.deepEqual(h.log, []);
  h.set({ hash: '#/' });
  flow.routeChanged();
  await new Promise((r) => setImmediate(r)); // fetchVersion ist asynchron
  assert.deepEqual(h.log, ['fetch', 'show']);
  h.set({ hash: '#/parallel' });
  flow.routeChanged();
  assert.deepEqual(h.log, ['fetch', 'show', 'hide']);
  h.set({ hash: '#/fortschritt' });
  flow.routeChanged();
  flow.routeChanged();
  assert.deepEqual(h.log, ['fetch', 'show', 'hide', 'show'], 'nach der Runde wieder da, ohne neue Meldung');
  assert.equal(h.state.updateNotifiedAt, T0);
});

test('Ablauf: Antwort kommt erst, wenn schon eine Runde läuft → Hinweis danach', async () => {
  const h = harness();
  let resolve: (v: string | null) => void = () => undefined;
  h.deps.fetchVersion = () => new Promise((r) => { resolve = r; });
  const flow = createStoreUpdateFlow(h.deps);
  const done = flow.check();
  h.set({ hash: '#/chain' });
  flow.routeChanged();
  resolve('1.15.0');
  await done;
  assert.deepEqual(h.log, []);
  h.set({ hash: '#/' });
  flow.routeChanged();
  assert.deepEqual(h.log, ['show']);
});
