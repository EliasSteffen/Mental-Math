// Live-Updates der iOS-App (docs/PLAN-live-updates.md): Manifest-Prüfung, Signatur, Versions- und Kompatibilitätsregeln,
// Zustandsmaschine (Start, Probelauf, Rollback, Not-Aus), Bundle-Erzeugung, nativer Fingerprint und Workflows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CHECK_INTERVAL_MS, LIMITS, betaAllowed, bootStep, bundleId, channelFor, checkStep, compatible, downloadedStep, dueForCheck,
  emptyState, fromBase64, isUpdate, keepIds, parseManifest, parseState, readManifest, readyStep, safePath, toBase64,
  verifySignature,
  type LiveBundle, type LiveFile, type LiveManifest, type LiveState,
} from '../src/core/live-update.ts';
import {
  APP_ONLY_FILES, buildManifest, bundlePaths, keyIdOf, parseMode, publicKeyOf, signEnvelope,
} from '../scripts/live-update.ts';
import { fingerprint, nativeInputs, readNativeVersion } from '../scripts/native-fingerprint.ts';
import { parseLiveUpdateKeys, validManifestUrl } from '../scripts/build-info.ts';

function keypair(): { pem: string; pub: string } {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return { pem, pub: publicKeyOf(pem) };
}
const PROD = keypair();
const BETA = keypair();

const H = (c: string): string => c.repeat(64);
const FILES: LiveFile[] = [
  { path: '/index.html', sha256: H('a'), size: 1200 },
  { path: '/js/app.js', sha256: H('b'), size: 3400 },
  { path: '/css/base.css', sha256: H('c'), size: 560 },
];
const T0 = '2026-11-20T10:00:00.000Z';
const T1 = '2026-11-21T10:00:00.000Z';

async function manifest(o: Partial<{ version: string; minNative: string; channel: 'production' | 'beta'; createdAt: string; files: LiveFile[] }> = {}): Promise<LiveManifest> {
  return buildManifest({
    channel: o.channel ?? 'production', mode: 'on', createdAt: o.createdAt ?? T0,
    bundle: { version: o.version ?? '1.16.1', build: 'a1b2c3d', minNative: o.minNative ?? '1.16.0', files: o.files ?? FILES },
  });
}

function bundleOf(m: LiveManifest): LiveBundle {
  assert.ok(m.bundle);
  return m.bundle;
}

/* ---------- Manifest ---------- */

test('parseManifest: gültiges Manifest aus buildManifest', async () => {
  const m = await manifest();
  const r = parseManifest(JSON.stringify(m));
  assert.ok(r.ok, r.ok ? '' : r.error);
  assert.equal(r.value.bundle?.id, await bundleId(FILES));
  assert.match(r.value.bundle?.id ?? '', /^[0-9a-f]{16}$/);
});

test('parseManifest: off/reset brauchen kein Bundle', () => {
  for (const mode of ['off', 'reset']) {
    const r = parseManifest(JSON.stringify({ schema: 1, channel: 'production', createdAt: T0, mode }));
    assert.ok(r.ok && r.value.bundle === null, mode);
  }
});

test('parseManifest: lehnt Ungültiges ab', async () => {
  const base = await manifest();
  const b = bundleOf(base);
  const bad: Array<[string, unknown]> = [
    ['kein JSON', '{'],
    ['schema', { ...base, schema: 2 }],
    ['channel', { ...base, channel: 'nightly' }],
    ['createdAt', { ...base, createdAt: '20.11.2026' }],
    ['mode', { ...base, mode: 'maybe' }],
    ['on ohne Bundle', { ...base, bundle: null }],
    ['id', { ...base, bundle: { ...b, id: '../../etc' } }],
    ['version', { ...base, bundle: { ...b, version: '1.16' } }],
    ['minNative', { ...base, bundle: { ...b, minNative: 'x' } }],
    ['build', { ...base, bundle: { ...b, build: 'A B' } }],
    ['keine Dateien', { ...base, bundle: { ...b, files: [] } }],
    ['index.html fehlt', { ...base, bundle: { ...b, files: FILES.slice(1) } }],
    ['Pfad ..', { ...base, bundle: { ...b, files: [...FILES, { path: '/js/../../x.js', sha256: H('d'), size: 1 }] } }],
    ['Pfad relativ', { ...base, bundle: { ...b, files: [...FILES, { path: 'js/x.js', sha256: H('d'), size: 1 }] } }],
    ['Pfad //', { ...base, bundle: { ...b, files: [...FILES, { path: '//evil.example/x.js', sha256: H('d'), size: 1 }] } }],
    ['Pfad versteckt', { ...base, bundle: { ...b, files: [...FILES, { path: '/.well-known/x', sha256: H('d'), size: 1 }] } }],
    ['Pfad doppelt', { ...base, bundle: { ...b, files: [...FILES, FILES[1]] } }],
    ['Hash', { ...base, bundle: { ...b, files: [...FILES, { path: '/x.js', sha256: 'abc', size: 1 }] } }],
    ['Größe negativ', { ...base, bundle: { ...b, files: [...FILES, { path: '/x.js', sha256: H('d'), size: -1 }] } }],
    ['Datei zu groß', { ...base, bundle: { ...b, files: [...FILES, { path: '/x.js', sha256: H('d'), size: LIMITS.maxFileBytes + 1 }] } }],
    ['Bundle zu groß', { ...base, bundle: { ...b, files: [...FILES, ...Array.from({ length: 5 }, (_, i) => ({ path: `/big${i}.bin`, sha256: H('e'), size: LIMITS.maxFileBytes }))] } }],
    ['zu viele Dateien', { ...base, bundle: { ...b, files: Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => ({ path: i ? `/f${i}.js` : '/index.html', sha256: H('f'), size: 1 })) } }],
  ];
  for (const [name, raw] of bad) {
    const r = parseManifest(typeof raw === 'string' ? raw : JSON.stringify(raw));
    assert.equal(r.ok, false, `sollte abgelehnt werden: ${name}`);
  }
});

test('safePath: nur absolute, harmlose Pfade', () => {
  for (const p of ['/index.html', '/js/vendor/native.js', '/css/views/today.css', '/icons/icon-512.png']) assert.equal(safePath(p), true, p);
  for (const p of ['', '/', 'index.html', '/../x', '/a/../b', '/a//b', '/.env', '/a/.git/config', '/a b', '/ä.js', '/a\\b']) assert.equal(safePath(p), false, p);
});

/* ---------- Signatur ---------- */

test('Signatur: Node signiert, WebCrypto prüft; Manipulation und fremde Schlüssel fallen durch', async () => {
  const payload = JSON.stringify(await manifest());
  const env = signEnvelope(payload, PROD.pem);
  assert.equal(env.kid, keyIdOf(PROD.pub));
  assert.equal(await verifySignature(env, [PROD.pub]), true);
  assert.equal(await verifySignature(env, [BETA.pub, PROD.pub]), true, 'mehrere Schlüssel (Wechsel)');
  assert.equal(await verifySignature({ ...env, kid: '' }, [PROD.pub]), true, 'ohne kid: alle Schlüssel versuchen');
  assert.equal(await verifySignature(env, [BETA.pub]), false, 'fremder Schlüssel');
  assert.equal(await verifySignature(env, []), false);
  assert.equal(await verifySignature({ ...env, payload: payload.replace('1.16.1', '1.16.2') }, [PROD.pub]), false, 'Inhalt geändert');
  assert.equal(await verifySignature({ ...env, sig: env.sig.slice(0, -4) }, [PROD.pub]), false, 'Signatur gekürzt');
  assert.equal(await verifySignature(env, ['kein-schluessel']), false);
});

test('readManifest: Umschlag als Objekt oder Text, Kanal und Bundle-ID werden geprüft', async () => {
  const m = await manifest();
  const env = signEnvelope(JSON.stringify(m), PROD.pem);
  const ok = await readManifest(env, [PROD.pub], 'production');
  assert.ok(ok.ok && ok.value.bundle?.version === '1.16.1');
  assert.ok((await readManifest(JSON.stringify(env), [PROD.pub], 'production')).ok, 'als Text');

  assert.equal((await readManifest(env, [PROD.pub], 'beta')).ok, false, 'falscher Kanal');
  assert.equal((await readManifest(env, [], 'production')).ok, false, 'kein Schlüssel = aus');
  assert.equal((await readManifest({ payload: 1 }, [PROD.pub], 'production')).ok, false);
  assert.equal((await readManifest('kein json', [PROD.pub], 'production')).ok, false);

  // Beta-Schlüssel signiert ein Produktions-Manifest: die App vertraut ihm für production nicht
  const betaSigned = signEnvelope(JSON.stringify(m), BETA.pem);
  assert.equal((await readManifest(betaSigned, [PROD.pub], 'production')).ok, false);

  // ID passt nicht zu den Dateien (Ordnername nicht an den Inhalt gebunden)
  const forged = { ...m, bundle: { ...bundleOf(m), id: '0123456789abcdef' } };
  const r = await readManifest(signEnvelope(JSON.stringify(forged), PROD.pem), [PROD.pub], 'production');
  assert.ok(!r.ok && /id/.test(r.error));
});

test('Base64: Rundreise, Base64url, Ungültiges', () => {
  const bytes = new Uint8Array(70_000).map((_, i) => (i * 7) % 256);
  const b64 = toBase64(bytes);
  assert.deepEqual(fromBase64(b64), bytes);
  assert.deepEqual(fromBase64(b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')), bytes);
  assert.equal(fromBase64('!!'), null);
});

/* ---------- Versionen und Kompatibilität ---------- */

test('compatible: native Version ≥ minNative', () => {
  assert.equal(compatible('1.16.0', '1.16.0'), true);
  assert.equal(compatible('1.16.0', '1.16.3'), true);
  assert.equal(compatible('1.16.0', '2.0'), true);
  assert.equal(compatible('1.16.0', '1.15.9'), false);
  assert.equal(compatible('1.16.0', '1.0'), false, 'Xcode-Standard 1.0');
  assert.equal(compatible('1.16.0', ''), false);
  assert.equal(compatible('x', '1.16.0'), false);
});

test('isUpdate: production nur höher, beta auch gleich; nie dasselbe Bundle', () => {
  const run = { id: null, version: '1.16.0' };
  assert.equal(isUpdate({ id: 'aaaaaaaaaaaaaaaa', version: '1.16.1' }, 'production', run), true);
  assert.equal(isUpdate({ id: 'aaaaaaaaaaaaaaaa', version: '1.16.0' }, 'production', run), false, 'gleiche Version');
  assert.equal(isUpdate({ id: 'aaaaaaaaaaaaaaaa', version: '1.15.9' }, 'production', run), false, 'kein Downgrade');
  assert.equal(isUpdate({ id: 'aaaaaaaaaaaaaaaa', version: '1.16.0' }, 'beta', run), true);
  assert.equal(isUpdate({ id: 'aaaaaaaaaaaaaaaa', version: '1.15.9' }, 'beta', run), false);
  assert.equal(isUpdate({ id: 'aaaaaaaaaaaaaaaa', version: '1.16.1' }, 'production', { id: 'aaaaaaaaaaaaaaaa', version: '1.16.1' }), false);
  assert.equal(isUpdate({ id: 'aaaaaaaaaaaaaaaa', version: '1.10.0' }, 'production', { id: null, version: '1.9.9' }), true, 'numerisch');
});

test('channelFor: beta nur TestFlight + Zustimmung', () => {
  assert.equal(channelFor(false, false), 'production');
  assert.equal(channelFor(false, true), 'production', 'App Store: nie beta');
  assert.equal(channelFor(true, false), 'production', 'TestFlight/App Review ohne Zustimmung');
  assert.equal(channelFor(true, true), 'beta');
});

test('channelFor/betaAllowed: versteckte Freischaltung erlaubt beta auch im App Store', () => {
  assert.equal(betaAllowed(false, false), false, 'App Store ohne Freischaltung');
  assert.equal(betaAllowed(false, true), true, 'App Store freigeschaltet');
  assert.equal(betaAllowed(true, false), true, 'TestFlight');
  assert.equal(channelFor(false, true, true), 'beta', 'freigeschaltet + Zustimmung');
  assert.equal(channelFor(false, false, true), 'production', 'freigeschaltet, aber nicht gewählt');
  assert.equal(channelFor(false, true, false), 'production', 'Zustimmung allein reicht im App Store nicht');
});

test('parseState: Freischaltung bleibt erhalten, Fremdwerte zählen nicht', () => {
  assert.equal(emptyState().unlocked, false);
  assert.equal(parseState(JSON.stringify({ unlocked: true })).unlocked, true);
  assert.equal(parseState(JSON.stringify({ unlocked: 'yes' })).unlocked, false);
  assert.equal(parseState(JSON.stringify({ beta: true })).unlocked, false, 'alter Zustand ohne Feld');
});

test('dueForCheck: höchstens alle 30 min, zurückgestellte Uhr zählt als fällig', () => {
  const now = Date.UTC(2026, 10, 20);
  assert.equal(dueForCheck(now, 0), true);
  assert.equal(dueForCheck(now, now - CHECK_INTERVAL_MS + 1), false);
  assert.equal(dueForCheck(now, now - CHECK_INTERVAL_MS), true);
  assert.equal(dueForCheck(now, now + 1000), true);
});

/* ---------- Zustandsmaschine ---------- */

const NATIVE = '1.16.0';
const BUILT_IN = { id: null, version: '1.16.0' };

test('checkStep: lädt passende neuere Bundles, sonst nicht', async () => {
  const m = await manifest();
  const id = bundleOf(m).id;
  const ctx = { running: BUILT_IN, nativeVersion: NATIVE, channel: 'production' as const };

  const r = checkStep(emptyState(), m, ctx);
  assert.equal(r.action.kind, 'download');
  assert.equal(r.state.seen.production, T0);

  assert.equal(checkStep(emptyState(), m, { ...ctx, nativeVersion: '1.15.0' }).action.kind, 'none', 'minNative zu hoch');
  assert.equal(checkStep(emptyState(), m, { ...ctx, running: { id: null, version: '1.16.1' } }).action.kind, 'none', 'schon aktuell');
  assert.equal(checkStep(emptyState(), m, { ...ctx, running: { id, version: '1.16.1' } }).action.kind, 'none', 'läuft schon');
  assert.equal(checkStep({ ...emptyState(), bad: [id] }, m, ctx).action.kind, 'none', 'schwarze Liste');
  const pending = downloadedStep(emptyState(), bundleOf(m), 'production', T0);
  assert.equal(checkStep(pending, m, ctx).action.kind, 'none', 'schon vorgemerkt');
  assert.equal(checkStep(emptyState(), m, { ...ctx, channel: 'beta' }).action.kind, 'none', 'Kanal');
});

test('checkStep: alte Manifeste werden ignoriert (kein Wiedereinspielen)', async () => {
  const s = { ...emptyState(), seen: { production: T1 } };
  const r = checkStep(s, await manifest({ createdAt: T0 }), { running: BUILT_IN, nativeVersion: NATIVE, channel: 'production' });
  assert.equal(r.action.kind, 'none');
  assert.equal(r.state.seen.production, T1);
  const reset: LiveManifest = { schema: 1, channel: 'production', createdAt: T0, mode: 'reset', bundle: null };
  assert.equal(checkStep(s, reset, { running: { id: 'aaaaaaaaaaaaaaaa', version: '1.16.1' }, nativeVersion: NATIVE, channel: 'production' }).state.reset, false,
    'altes Reset-Manifest wirkt nicht');
});

test('Not-Aus: off verwirft Vorgemerktes, reset führt zum eingebauten Bundle', async () => {
  const m = await manifest();
  const pending = downloadedStep(emptyState(), bundleOf(m), 'production', T0);
  const ota = { id: 'aaaaaaaaaaaaaaaa', version: '1.16.1' };
  const off: LiveManifest = { schema: 1, channel: 'production', createdAt: T1, mode: 'off', bundle: null };
  const r1 = checkStep(pending, off, { running: ota, nativeVersion: NATIVE, channel: 'production' });
  assert.equal(r1.action.kind, 'none');
  assert.equal(r1.state.pending, null);
  assert.equal(r1.state.reset, false, 'off lässt laufende Bundles in Ruhe');

  const reset: LiveManifest = { ...off, mode: 'reset' };
  const r2 = checkStep(pending, reset, { running: ota, nativeVersion: NATIVE, channel: 'production' });
  assert.equal(r2.state.reset, true);
  assert.equal(r2.state.pending, null);
  const b1 = bootStep(r2.state, { running: ota, nativeVersion: NATIVE, failed: [] });
  assert.deepEqual(b1.action, { kind: 'reset' });
  // nach dem Neuladen läuft das eingebaute: Reset erledigt
  const b2 = bootStep(b1.state, { running: BUILT_IN, nativeVersion: NATIVE, failed: [] });
  assert.deepEqual(b2.action, { kind: 'none' });
  assert.equal(b2.state.reset, false);
  // Reset auf dem eingebauten Bundle: nichts zu tun
  assert.equal(checkStep(emptyState(), reset, { running: BUILT_IN, nativeVersion: NATIVE, channel: 'production' }).state.reset, false);
  // Server wieder an: Reset-Wunsch fällt weg
  const on = await manifest({ createdAt: '2026-11-22T10:00:00.000Z' });
  assert.equal(checkStep(r2.state, on, { running: ota, nativeVersion: NATIVE, channel: 'production' }).state.reset, false);
});

test('Ablauf: Download → Start im Probelauf → ready → Startbundle', async () => {
  const m = await manifest();
  const b = bundleOf(m);
  let s: LiveState = downloadedStep(emptyState(), b, 'production', T0);

  // Kaltstart im eingebauten Bundle: Probelauf starten
  const boot = bootStep(s, { running: BUILT_IN, nativeVersion: NATIVE, failed: [] });
  assert.deepEqual(boot.action, { kind: 'trial', id: b.id });
  assert.equal(boot.state.pending, null);
  assert.equal(boot.state.trial?.id, b.id);
  s = boot.state;

  // Das neue Bundle startet: Start-Schritt lässt den Probelauf stehen, ready bestätigt ihn
  const running = { id: b.id, version: b.version };
  const again = bootStep(s, { running, nativeVersion: NATIVE, failed: [] });
  assert.deepEqual(again.action, { kind: 'none' });
  assert.equal(again.state.trial?.id, b.id);
  s = readyStep(again.state, running);
  assert.equal(s.trial, null);
  assert.deepEqual(s.bad, []);
  assert.deepEqual([...keepIds(s, running)], [b.id]);
});

test('Rollback: Probelauf ohne ready → schwarze Liste, kein zweiter Versuch', async () => {
  const m = await manifest();
  const b = bundleOf(m);
  const trial = bootStep(downloadedStep(emptyState(), b, 'production', T0), { running: BUILT_IN, nativeVersion: NATIVE, failed: [] }).state;

  // Wächter hat zurückgeschaltet (failed) bzw. App wurde beendet: das alte Bundle läuft wieder
  for (const failed of [[b.id], []]) {
    const r = bootStep(trial, { running: BUILT_IN, nativeVersion: NATIVE, failed });
    assert.deepEqual(r.action, { kind: 'none' });
    assert.equal(r.state.trial, null);
    assert.deepEqual(r.state.bad, [b.id]);
    assert.equal(checkStep(r.state, m, { running: BUILT_IN, nativeVersion: NATIVE, channel: 'production' }).action.kind, 'none');
  }
  // Startschutz meldet ein gespeichertes Bundle: ebenfalls schwarze Liste
  const r = bootStep(emptyState(), { running: BUILT_IN, nativeVersion: NATIVE, failed: ['bbbbbbbbbbbbbbbb'] });
  assert.deepEqual(r.state.bad, ['bbbbbbbbbbbbbbbb']);
});

test('Start nach Store-Update: vorgemerktes Bundle wird erneut geprüft', async () => {
  const b = bundleOf(await manifest({ version: '1.16.1', minNative: '1.16.0' }));
  const s = downloadedStep(emptyState(), b, 'production', T0);
  // neues Binary 1.17.0 mit eingebautem 1.17.0: das alte vorgemerkte 1.16.1 wäre ein Downgrade
  const r = bootStep(s, { running: { id: null, version: '1.17.0' }, nativeVersion: '1.17.0', failed: [] });
  assert.deepEqual(r.action, { kind: 'none' });
  assert.equal(r.state.pending, null);
  // native Version zu alt (Binary zurückgespielt): nicht starten
  const r2 = bootStep(s, { running: { id: null, version: '1.15.0' }, nativeVersion: '1.15.0', failed: [] });
  assert.deepEqual(r2.action, { kind: 'none' });
});

test('parseState: tolerant gegen Unsinn, behält Gültiges', () => {
  assert.deepEqual(parseState(null), emptyState());
  assert.deepEqual(parseState('kaputt'), emptyState());
  assert.deepEqual(parseState('[1,2]'), emptyState());
  const s = parseState(JSON.stringify({
    pending: { id: 'aaaaaaaaaaaaaaaa', version: '1.16.1', minNative: '1.16.0', channel: 'production', createdAt: T0 },
    trial: { id: '../x' }, bad: ['bbbbbbbbbbbbbbbb', 'nope', 3], lastCheck: 42, seen: { production: T0, beta: 'x' }, reset: 'ja', beta: true,
  }));
  assert.equal(s.pending?.id, 'aaaaaaaaaaaaaaaa');
  assert.equal(s.trial, null);
  assert.deepEqual(s.bad, ['bbbbbbbbbbbbbbbb']);
  assert.equal(s.lastCheck, 42);
  assert.deepEqual(s.seen, { production: T0 });
  assert.equal(s.reset, false);
  assert.equal(s.beta, true);
});

/* ---------- Veröffentlichen ---------- */

test('bundlePaths: Precache plus App-Bundles, ohne JSON', () => {
  const paths = bundlePaths(['/index.html', '/js/app.js', '/css/base.css']);
  for (const p of APP_ONLY_FILES) assert.ok(paths.includes(p), p);
  assert.deepEqual(paths, [...paths].sort());
  assert.throws(() => bundlePaths(['/index.html', '/data.json']), /JSON/);
  assert.throws(() => bundlePaths(['/js/app.js']), /index\.html/);
});

test('Manifest vom Skript besteht die Prüfung der App (Ende zu Ende)', async () => {
  const m = await buildManifest({ channel: 'beta', mode: 'on', createdAt: T1, bundle: { version: '1.16.0', build: 'dev', minNative: '1.16.0', files: [...FILES].reverse() } });
  assert.deepEqual(bundleOf(m).files.map((f) => f.path), ['/css/base.css', '/index.html', '/js/app.js'], 'sortiert');
  const env = JSON.parse(JSON.stringify(signEnvelope(JSON.stringify(m), BETA.pem))) as unknown;
  const r = await readManifest(env, [BETA.pub], 'beta');
  assert.ok(r.ok, r.ok ? '' : r.error);
  assert.equal(checkStep(emptyState(), r.value, { running: { id: null, version: '1.16.0' }, nativeVersion: '1.16.0', channel: 'beta' }).action.kind, 'download');
  await assert.rejects(buildManifest({ channel: 'production', mode: 'on', createdAt: T1 }));
  assert.throws(() => signEnvelope('x', generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()), /P-256/);
});

test('parseMode: Not-Aus-Schalter LIVE_UPDATE', () => {
  assert.equal(parseMode(undefined), 'on');
  assert.equal(parseMode(''), 'on');
  assert.equal(parseMode(' OFF '), 'off');
  assert.equal(parseMode('reset'), 'reset');
  assert.throws(() => parseMode('aus'));
});

test('Build-Konfiguration: Schlüssel und Manifest-Adressen', () => {
  assert.deepEqual(parseLiveUpdateKeys(`${PROD.pub}, kaputt ,${BETA.pub}`), [PROD.pub, BETA.pub]);
  assert.deepEqual(parseLiveUpdateKeys(undefined), []);
  assert.equal(validManifestUrl('https://mental-math.elias-steffen.de/ota/manifest.json'), true);
  assert.equal(validManifestUrl('http://localhost:8099/ota/manifest.json'), true, 'Simulator-Test');
  assert.equal(validManifestUrl('http://example.com/ota/manifest.json'), false);
  assert.equal(validManifestUrl('https://user:pw@example.com/x'), false);
  assert.equal(validManifestUrl('kein url'), false);
});

/* ---------- native Kompatibilität ---------- */

test('ios/native-version.json passt zu den nativen Teilen (sonst: npm run native:stamp)', () => {
  const saved = readNativeVersion();
  assert.match(saved.minNative, /^\d+\.\d+\.\d+$/);
  const inputs = nativeInputs();
  const names = inputs.map(([n]) => n);
  for (const f of ['ios/App/App/LiveUpdatePlugin.swift', 'ios/App/App/Info.plist', 'ios/App/App.xcodeproj/project.pbxproj', 'capacitor.config.json']) {
    assert.ok(names.includes(f), `${f} gehört zum Fingerprint`);
  }
  assert.ok(!names.some((n) => n.includes('/public/') || n.includes('.xcassets')), 'erzeugte Web-Dateien und Icons zählen nicht');
  assert.equal(saved.fingerprint, fingerprint(inputs),
    'Native Teile geändert: Version in package.json auf die nächste Store-Version setzen, dann npm run native:stamp');
});

test('Fingerprint reagiert auf native Änderungen, nicht auf die App-Version', () => {
  const inputs = nativeInputs();
  const fp = fingerprint(inputs);
  const changed = inputs.map(([n, c]): [string, Buffer] => [n, n.endsWith('Info.plist') ? Buffer.concat([c, Buffer.from(' ')]) : c]);
  assert.notEqual(fingerprint(changed), fp);
  assert.ok(!inputs.some(([n]) => n === 'package.json'), 'nur @capacitor-Versionen aus package.json');
});

/* ---------- Workflows ---------- */

test('Workflows: Schlüssel in jedem Build, Manifest beim Deploy von release und develop', () => {
  const deploy = readFileSync(new URL('../.github/workflows/deploy.yml', import.meta.url), 'utf8');
  const ios = readFileSync(new URL('../.github/workflows/ios.yml', import.meta.url), 'utf8');
  // Fehlen die Schlüssel in einem Build, nimmt dieses Bundle nach dem Update keine weiteren Updates an
  for (const [name, text] of [['deploy.yml', deploy], ['ios.yml', ios]] as const) {
    assert.match(text, /PUBLIC_LIVE_UPDATE_KEYS: \$\{\{ vars\.LIVE_UPDATE_PUBLIC_KEYS \}\}/, `${name}: Produktionsschlüssel`);
    assert.match(text, /PUBLIC_LIVE_UPDATE_BETA_KEYS: \$\{\{ vars\.LIVE_UPDATE_BETA_PUBLIC_KEYS \}\}/, `${name}: Beta-Schlüssel`);
  }
  assert.match(deploy, /node scripts\/live-update\.ts publish --channel/);
  assert.match(deploy, /LIVE_UPDATE_SIGNING_KEY: \$\{\{ secrets\.LIVE_UPDATE_SIGNING_KEY \}\}/);
  assert.match(deploy, /LIVE_UPDATE: \$\{\{ vars\.LIVE_UPDATE \}\}/);
  // veröffentlicht wird vor dem Upload zu Cloudflare (dist/ota/manifest.json gehört zum Deploy)
  assert.ok(deploy.indexOf('scripts/live-update.ts publish') < deploy.indexOf('cloudflare/wrangler-action'));
});
