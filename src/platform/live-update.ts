// Live-Updates in der iOS-App (docs/PLAN-live-updates.md): verdrahtet die reine Logik (core/live-update.ts) mit dem
// eigenen Plugin LiveUpdate (ios/App/App/LiveUpdatePlugin.swift: umschalten, Wächter, Startschutz), dem Dateisystem
// und CapacitorHttp. Nur in der App geladen (platform/index.ts importiert dynamisch); die Website bleibt unberührt.
//
// Bundles liegen in Library/NoCloud/ionic_built_snapshots/<id>/ – dort sucht Capacitor einen gespeicherten
// serverBasePath beim Start. Zustand (vorgemerkt, Probelauf, schwarze Liste) in localStorage: gilt für alle Bundles,
// weil alle unter derselben Origin capacitor://localhost laufen.
import { BUILD_INFO } from '../generated/build-info.ts';
import { PUBLIC_CONFIG } from '../generated/public-config.ts';
import {
  READY_TIMEOUT_MS, bootStep, channelFor, checkStep, downloadedStep, dueForCheck, fromBase64, keepIds, parseState,
  readManifest, readyStep, sha256Hex, toBase64,
  type LiveBundle, type LiveChannel, type LiveFile, type LiveState, type Running,
} from '../core/live-update.ts';
import { liveUpdatePlugin, loadNative, onNativeResume, type LiveUpdateInfo } from './native.ts';

const KEY = 'mm-live-update';
/** relativ zu Directory.Library (Capacitor: CAPBridgeViewController.instanceDescriptor) */
const SNAPSHOTS = 'NoCloud/ionic_built_snapshots';
const HTTP_TIMEOUT_MS = 20_000;
/** Erste Prüfung nach dem Start: erst die Oberfläche, dann das Netz */
const FIRST_CHECK_DELAY_MS = 3_000;
const PARALLEL = 4;

function log(...args: unknown[]): void {
  console.info('[live-update]', ...args);
}

function load(): LiveState {
  try { return parseState(globalThis.localStorage.getItem(KEY)); } catch { return parseState(null); }
}

function save(s: LiveState): void {
  try { globalThis.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* Speicher nicht verfügbar */ }
}

const runningOf = (info: { running: string | null }): Running => ({ id: info.running, version: BUILD_INFO.version });

function channelConfig(channel: LiveChannel): { url: string; keys: readonly string[] } {
  return channel === 'beta'
    ? { url: PUBLIC_CONFIG.liveUpdateBetaUrl, keys: PUBLIC_CONFIG.liveUpdateBetaKeys }
    : { url: PUBLIC_CONFIG.liveUpdateUrl, keys: PUBLIC_CONFIG.liveUpdateKeys };
}

/**
 * Beim Start, bevor die Oberfläche zeichnet: offenen Probelauf auswerten, Reset oder vorgemerktes Bundle anwenden.
 * 'reload': Die WebView lädt gleich ein anderes Bundle – nichts zeichnen. Ohne Zustand (nie ein Update) sofort 'ok'.
 */
export async function bootLiveUpdate(): Promise<'ok' | 'reload'> {
  const state = load();
  if (!state.pending && !state.trial && !state.reset) return 'ok';
  const lu = await liveUpdatePlugin();
  const info = await lu.info();
  const r = bootStep(state, { running: runningOf(info), nativeVersion: info.nativeVersion, failed: info.failed });
  save(r.state);
  if (r.action.kind === 'trial') {
    log('Probelauf', r.action.id);
    try {
      await lu.trial({ id: r.action.id, timeoutMs: READY_TIMEOUT_MS });
      return 'reload';
    } catch (e) {
      // Bundle fehlt oder ist unvollständig: gleich als fehlgeschlagen merken, weiter mit dem laufenden
      log('Probelauf nicht möglich', e);
      save(bootStep(r.state, { running: runningOf(info), nativeVersion: info.nativeVersion, failed: [r.action.id] }).state);
      return 'ok';
    }
  }
  if (r.action.kind === 'reset') {
    log('zurück zum eingebauten Bundle');
    await lu.reset();
    return 'reload';
  }
  return 'ok';
}

let checking = false;

/** Manifest holen, prüfen und ein passendes Bundle im Hintergrund laden (gilt ab dem nächsten Start). */
async function check(force: boolean): Promise<void> {
  if (checking) return;
  checking = true;
  try {
    const now = Date.now();
    let state = load();
    if (!force && !dueForCheck(now, state.lastCheck)) return;
    const lu = await liveUpdatePlugin();
    const info = await lu.info();
    const channel = channelFor(info.testFlight, state.beta);
    const { url, keys } = channelConfig(channel);
    if (!url || !keys.length) return; // Not-Aus im Build: kein vertrauter Schlüssel
    save({ ...state, lastCheck: now });

    const m = await loadNative();
    const res = await m.CapacitorHttp.get({
      url: `${url}?t=${now}`, connectTimeout: HTTP_TIMEOUT_MS, readTimeout: HTTP_TIMEOUT_MS, responseType: 'json',
    });
    if (res.status !== 200) { log('kein Manifest', res.status); return; }
    const read = await readManifest(res.data, keys, channel);
    if (!read.ok) { log('Manifest verworfen:', read.error); return; }

    const running = runningOf(info);
    const r = checkStep(load(), read.value, { running, nativeVersion: info.nativeVersion, channel });
    save(r.state);
    state = r.state;
    await cleanup(state, running);
    if (r.action.kind !== 'download') { log(r.action.reason); return; }

    const bundle = r.action.bundle;
    log('lade', bundle.version, bundle.id);
    await download(bundle, url);
    save(downloadedStep(load(), bundle, channel, read.value.createdAt));
    log('bereit für den nächsten Start', bundle.version, bundle.id);
  } catch (e) {
    log('Prüfung fehlgeschlagen', e);
  } finally {
    checking = false;
  }
}

/** Datei aus dem laufenden Bundle (gleiche Origin), wenn sie unverändert ist – spart den Download. */
async function localCopy(f: LiveFile): Promise<string | null> {
  try {
    const res = await fetch(f.path, { cache: 'no-store' });
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length === f.size && (await sha256Hex(bytes)) === f.sha256 ? toBase64(bytes) : null;
  } catch {
    return null;
  }
}

/** Datei vom Server (CapacitorHttp: ohne CORS), Größe und SHA-256 geprüft; als Base64. */
async function remoteCopy(f: LiveFile, origin: string): Promise<string> {
  const m = await loadNative();
  const res = await m.CapacitorHttp.get({
    url: `${origin}${f.path}`, responseType: 'arraybuffer', connectTimeout: HTTP_TIMEOUT_MS, readTimeout: HTTP_TIMEOUT_MS,
  });
  if (res.status !== 200 || typeof res.data !== 'string') throw new Error(`${f.path}: HTTP ${res.status}`);
  const bytes = fromBase64(res.data);
  if (!bytes || bytes.length !== f.size || (await sha256Hex(bytes)) !== f.sha256) throw new Error(`${f.path}: Hash passt nicht`);
  return res.data;
}

/**
 * Bundle nach SNAPSHOTS/<id>/ schreiben. index.html zuletzt: Das native Plugin startet nur Ordner mit index.html,
 * und vorgemerkt wird erst nach dem letzten geprüften Schreiben – ein abgebrochener Download wird nie gestartet und beim
 * nächsten Aufräumen gelöscht.
 */
async function download(bundle: LiveBundle, manifestUrl: string): Promise<void> {
  const m = await loadNative();
  const dir = `${SNAPSHOTS}/${bundle.id}`;
  const origin = new URL(manifestUrl).origin;
  await m.Filesystem.rmdir({ path: dir, directory: m.Directory.Library, recursive: true }).catch(() => undefined);
  const files = [...bundle.files].sort((a, b) => Number(a.path === '/index.html') - Number(b.path === '/index.html'));
  const last = files.pop();
  let fetched = 0;
  const write = async (f: LiveFile): Promise<void> => {
    let data = await localCopy(f);
    if (data === null) { data = await remoteCopy(f, origin); fetched++; }
    await m.Filesystem.writeFile({ path: `${dir}${f.path}`, data, directory: m.Directory.Library, recursive: true });
  };
  for (let i = 0; i < files.length; i += PARALLEL) await Promise.all(files.slice(i, i + PARALLEL).map(write));
  if (last) await write(last);
  log(`${bundle.files.length} Dateien, davon ${fetched} geladen`);
}

/** Alte Bundles und abgebrochene Downloads löschen; behalten: laufendes, vorgemerktes, im Probelauf. */
async function cleanup(state: LiveState, running: Running): Promise<void> {
  const m = await loadNative();
  const keep = keepIds(state, running);
  let names: string[];
  try {
    const r = await m.Filesystem.readdir({ path: SNAPSHOTS, directory: m.Directory.Library });
    names = r.files.map((f) => f.name);
  } catch {
    return; // noch kein Ordner
  }
  for (const name of names) {
    if (keep.has(name)) continue;
    await m.Filesystem.rmdir({ path: `${SNAPSHOTS}/${name}`, directory: m.Directory.Library, recursive: true }).catch(() => undefined);
  }
}

/** Nach dem ersten Bild: Oberfläche meldet sich (Wächter aus, Startbundle merken), dann nach Updates suchen. */
export async function liveUpdateReady(): Promise<void> {
  const lu = await liveUpdatePlugin();
  const { running } = await lu.ready();
  const before = load();
  const after = readyStep(before, runningOf({ running }));
  if (after.trial !== before.trial || after.reset !== before.reset) {
    save(after);
    if (before.trial && !after.trial) log('Probelauf bestanden', before.trial.version, before.trial.id);
  }
  // Bei jedem Start prüfen (Kaltstarts sind selten, Fehlerbehebungen sollen schnell ankommen), bei Rückkehr gedrosselt
  setTimeout(() => { void check(true); }, FIRST_CHECK_DELAY_MS);
  onNativeResume(() => { void check(false); });
}

/** Für Profil → Über: Stand der Live-Updates. */
export async function liveUpdateStatus(): Promise<{ info: LiveUpdateInfo; state: LiveState; channel: LiveChannel; betaAvailable: boolean }> {
  const info = await (await liveUpdatePlugin()).info();
  const state = load();
  return {
    info, state, channel: channelFor(info.testFlight, state.beta),
    betaAvailable: info.testFlight && PUBLIC_CONFIG.liveUpdateBetaKeys.length > 0,
  };
}

/** Beta-Updates ein/aus (nur TestFlight); prüft danach sofort. */
export function setLiveUpdateBeta(on: boolean): void {
  // seen bleibt je Kanal; beim Wechsel zählt das nächste Manifest des neuen Kanals
  save({ ...load(), beta: on, pending: null });
  void check(true);
}

/** Sofort prüfen (ohne Drossel) – z. B. aus Profil → Über. */
export function checkLiveUpdateNow(): void {
  void check(true);
}
