// Live-Updates der Web-Schicht in der iOS-App (docs/PLAN-live-updates.md) – reine Logik ohne DOM und Capacitor:
// Manifest und Signatur prüfen, Versions- und Kompatibilitätsregeln, Start-, Prüf- und Bereit-Schritte als
// Zustandsmaschine. Verdrahtung in der App: src/platform/live-update.ts; Manifest bauen und signieren:
// scripts/live-update.ts.
import { compareVersions } from '../releases.ts';

export type LiveChannel = 'production' | 'beta';
/** on: Bundle anbieten · off: Not-Aus, nichts Neues laden · reset: zurück zum eingebauten Bundle */
export type LiveMode = 'on' | 'off' | 'reset';

export interface LiveFile { path: string; sha256: string; size: number }
export interface LiveBundle {
  /** Ordnername: erste 16 Hex-Zeichen von SHA-256 über alle Pfade und Hashes (bundleId) */
  id: string;
  /** Version der Web-App (package.json) */
  version: string;
  /** Git-Kurz-Hash */
  build: string;
  /** kleinste native App-Version (CFBundleShortVersionString), die das Bundle ausführen kann */
  minNative: string;
  files: LiveFile[];
}
export interface LiveManifest {
  schema: 1;
  channel: LiveChannel;
  /** ISO-Zeitpunkt; ältere Manifeste als das zuletzt gesehene werden ignoriert (kein Wiedereinspielen) */
  createdAt: string;
  mode: LiveMode;
  /** nur bei mode 'on' */
  bundle: LiveBundle | null;
}
/** Signierter Umschlag: Die Signatur gilt für die exakten Bytes von payload (JSON-Text des Manifests). */
export interface LiveEnvelope { kid: string; payload: string; sig: string }

const MB = 1024 * 1024;
export const LIMITS = { maxFiles: 2000, maxFileBytes: 10 * MB, maxTotalBytes: 40 * MB } as const;
/** So lange hat ein neues Bundle Zeit, sich mit ready() zu melden, sonst lädt die App wieder das vorherige (nativ). */
export const READY_TIMEOUT_MS = 10_000;
/** Höchstens eine Manifest-Abfrage je Zeitraum. */
export const CHECK_INTERVAL_MS = 30 * 60_000;
/** Schwarze Liste: so viele fehlgeschlagene Bundles merken. */
const MAX_BAD = 20;

const ID_RE = /^[0-9a-f]{16}$/;
const SHA_RE = /^[0-9a-f]{64}$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
/** Native Versionen dürfen kürzer sein (Xcode-Standard „1.0“). */
const NATIVE_VERSION_RE = /^\d+(?:\.\d+){0,2}$/;
const BUILD_RE = /^[0-9a-z]{1,40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const PATH_RE = /^(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)+$/;

/* ---------- Bytes, Base64, Hashes ---------- */

type Bytes = Uint8Array<ArrayBuffer>;

export function utf8(text: string): Bytes {
  return new TextEncoder().encode(text);
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Base64 oder Base64url → Bytes; ungültig → null. */
export function fromBase64(text: string): Bytes | null {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return null;
  try {
    const bin = atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export async function sha256Hex(bytes: Bytes): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Bundle-ID: Hash über die sortierte Dateiliste (Pfad + Hash), damit der Ordnername an den Inhalt gebunden ist. */
export async function bundleId(files: readonly LiveFile[]): Promise<string> {
  const lines = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.path}\n${f.sha256}\n`).join('');
  return (await sha256Hex(utf8(lines))).slice(0, 16);
}

/** Schlüssel-ID eines öffentlichen Schlüssels (SPKI, DER): erste 16 Hex-Zeichen von SHA-256. */
export async function keyId(spki: Bytes): Promise<string> {
  return (await sha256Hex(spki)).slice(0, 16);
}

/* ---------- Signatur ---------- */

/** Prüft die ECDSA-P-256/SHA-256-Signatur (r‖s, 64 Byte) gegen die vertrauten Schlüssel (Base64-SPKI). */
export async function verifySignature(env: LiveEnvelope, keys: readonly string[]): Promise<boolean> {
  const sig = fromBase64(env.sig);
  if (!sig || sig.length !== 64) return false;
  const data = utf8(env.payload);
  for (const k of keys) {
    const spki = fromBase64(k);
    if (!spki) continue;
    if (env.kid && (await keyId(spki)) !== env.kid) continue;
    try {
      const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      if (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, data)) return true;
    } catch { /* ungültiger Schlüssel: nächsten versuchen */ }
  }
  return false;
}

/* ---------- Manifest prüfen ---------- */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Pfad im Bundle: absolut, nur [A-Za-z0-9._-], kein Segment, das mit einem Punkt beginnt (also auch kein ..). */
export function safePath(p: unknown): p is string {
  return typeof p === 'string' && p.length <= 200 && PATH_RE.test(p);
}

export function validVersion(v: unknown): v is string {
  return typeof v === 'string' && VERSION_RE.test(v);
}

function parseFiles(raw: unknown): Parsed<LiveFile[]> {
  if (!Array.isArray(raw) || raw.length === 0) return fail('files fehlt');
  if (raw.length > LIMITS.maxFiles) return fail('zu viele Dateien');
  const seen = new Set<string>();
  const files: LiveFile[] = [];
  let total = 0;
  for (const f of raw) {
    if (!isObj(f)) return fail('Datei ungültig');
    const { path, sha256, size } = f;
    if (!safePath(path)) return fail(`Pfad ungültig: ${String(path)}`);
    if (seen.has(path)) return fail(`Pfad doppelt: ${path}`);
    if (typeof sha256 !== 'string' || !SHA_RE.test(sha256)) return fail(`Hash ungültig: ${path}`);
    if (typeof size !== 'number' || !Number.isInteger(size) || size < 0 || size > LIMITS.maxFileBytes) return fail(`Größe ungültig: ${path}`);
    total += size;
    seen.add(path);
    files.push({ path, sha256, size });
  }
  if (total > LIMITS.maxTotalBytes) return fail('Bundle zu groß');
  if (!seen.has('/index.html')) return fail('index.html fehlt');
  return { ok: true, value: files };
}

function parseBundle(raw: unknown): Parsed<LiveBundle> {
  if (!isObj(raw)) return fail('bundle fehlt');
  const { id, version, build, minNative } = raw;
  if (typeof id !== 'string' || !ID_RE.test(id)) return fail('id ungültig');
  if (!validVersion(version)) return fail('version ungültig');
  if (typeof build !== 'string' || !BUILD_RE.test(build)) return fail('build ungültig');
  if (!validVersion(minNative)) return fail('minNative ungültig');
  const files = parseFiles(raw.files);
  if (!files.ok) return files;
  return { ok: true, value: { id, version, build, minNative, files: files.value } };
}

/** Manifest-Text (payload) prüfen – Form und Grenzen, ohne Signatur und ohne die Bundle-ID nachzurechnen. */
export function parseManifest(payload: string): Parsed<LiveManifest> {
  let raw: unknown;
  try { raw = JSON.parse(payload); } catch { return fail('kein JSON'); }
  if (!isObj(raw)) return fail('kein Objekt');
  if (raw.schema !== 1) return fail('schema unbekannt');
  const { channel, createdAt, mode } = raw;
  if (channel !== 'production' && channel !== 'beta') return fail('channel ungültig');
  if (typeof createdAt !== 'string' || !ISO_RE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return fail('createdAt ungültig');
  if (mode !== 'on' && mode !== 'off' && mode !== 'reset') return fail('mode ungültig');
  if (mode !== 'on') return { ok: true, value: { schema: 1, channel, createdAt, mode, bundle: null } };
  const bundle = parseBundle(raw.bundle);
  if (!bundle.ok) return bundle;
  return { ok: true, value: { schema: 1, channel, createdAt, mode, bundle: bundle.value } };
}

/** Umschlag (CapacitorHttp liefert JSON als Objekt, sonst Text) → signiertes, gültiges Manifest des Kanals. */
export async function readManifest(raw: unknown, keys: readonly string[], channel: LiveChannel): Promise<Parsed<LiveManifest>> {
  let env: unknown = raw;
  if (typeof env === 'string') {
    try { env = JSON.parse(env); } catch { return fail('Umschlag kein JSON'); }
  }
  if (!isObj(env) || typeof env.payload !== 'string' || typeof env.sig !== 'string') return fail('Umschlag ungültig');
  const envelope: LiveEnvelope = { kid: typeof env.kid === 'string' ? env.kid : '', payload: env.payload, sig: env.sig };
  if (!keys.length) return fail('kein Schlüssel');
  if (!(await verifySignature(envelope, keys))) return fail('Signatur ungültig');
  const m = parseManifest(envelope.payload);
  if (!m.ok) return m;
  if (m.value.channel !== channel) return fail(`falscher Kanal: ${m.value.channel}`);
  if (m.value.bundle && (await bundleId(m.value.bundle.files)) !== m.value.bundle.id) return fail('id passt nicht zu den Dateien');
  return m;
}

/* ---------- Versionen und Kompatibilität ---------- */

/** Läuft das Bundle auf diesem Binary? Native Version ≥ minNative (ungültige Angaben: nein). */
export function compatible(minNative: string, nativeVersion: string): boolean {
  return validVersion(minNative) && NATIVE_VERSION_RE.test(nativeVersion) && compareVersions(nativeVersion, minNative) >= 0;
}

/** Laufende Oberfläche: id null = das eingebaute Bundle; version = BUILD_INFO.version. */
export interface Running { id: string | null; version: string }

/**
 * Ist das Bundle ein Update? production: nur höhere Versionen (nie zurück, kein Wechsel bei gleicher Version);
 * beta: auch gleiche Version mit anderem Inhalt (develop ändert sich ohne Versionssprung; ältere Manifeste fängt
 * checkStep über createdAt ab).
 */
export function isUpdate(b: { id: string; version: string }, channel: LiveChannel, running: Running): boolean {
  if (b.id === running.id || !validVersion(b.version)) return false;
  const d = compareVersions(b.version, running.version);
  return d > 0 || (channel === 'beta' && d === 0);
}

/** Kanal: beta nur in TestFlight-Installationen und nur nach Zustimmung (App Review soll das Eingereichte sehen). */
export function channelFor(testFlight: boolean, betaOptIn: boolean): LiveChannel {
  return testFlight && betaOptIn ? 'beta' : 'production';
}

export function dueForCheck(now: number, lastCheck: number): boolean {
  return !(lastCheck > 0) || now < lastCheck || now - lastCheck >= CHECK_INTERVAL_MS;
}

/* ---------- Zustand ---------- */

export interface PendingBundle { id: string; version: string; minNative: string; channel: LiveChannel; createdAt: string }

export interface LiveState {
  v: 1;
  /** fertig geladen und geprüft, wird beim nächsten Start ausprobiert */
  pending: PendingBundle | null;
  /** läuft gerade probeweise (nicht gespeichert); meldet es sich nicht, gilt es als fehlgeschlagen */
  trial: PendingBundle | null;
  /** fehlgeschlagene Bundle-IDs (schwarze Liste), neueste zuletzt */
  bad: string[];
  lastCheck: number;
  /** neuestes gesehenes Manifest je Kanal (createdAt) */
  seen: Partial<Record<LiveChannel, string>>;
  /** Server verlangt die Rückkehr zum eingebauten Bundle */
  reset: boolean;
  /** Beta-Updates gewünscht (wirkt nur in TestFlight) */
  beta: boolean;
}

export function emptyState(): LiveState {
  return { v: 1, pending: null, trial: null, bad: [], lastCheck: 0, seen: {}, reset: false, beta: false };
}

function parsePending(raw: unknown): PendingBundle | null {
  if (!isObj(raw)) return null;
  const { id, version, minNative, channel, createdAt } = raw;
  if (typeof id !== 'string' || !ID_RE.test(id) || !validVersion(version) || !validVersion(minNative)) return null;
  if (channel !== 'production' && channel !== 'beta') return null;
  if (typeof createdAt !== 'string') return null;
  return { id, version, minNative, channel, createdAt };
}

/** Gespeicherten Zustand lesen; Unlesbares wird zum leeren Zustand (Felder einzeln, damit nichts Gültiges verloren geht). */
export function parseState(raw: string | null): LiveState {
  let o: unknown = null;
  try { o = raw === null ? null : JSON.parse(raw); } catch { o = null; }
  const s = emptyState();
  if (!isObj(o)) return s;
  s.pending = parsePending(o.pending);
  s.trial = parsePending(o.trial);
  s.bad = Array.isArray(o.bad) ? o.bad.filter((x): x is string => typeof x === 'string' && ID_RE.test(x)).slice(-MAX_BAD) : [];
  s.lastCheck = typeof o.lastCheck === 'number' && Number.isFinite(o.lastCheck) ? o.lastCheck : 0;
  if (isObj(o.seen)) {
    for (const c of ['production', 'beta'] as const) {
      const v = o.seen[c];
      if (typeof v === 'string' && ISO_RE.test(v)) s.seen[c] = v;
    }
  }
  s.reset = o.reset === true;
  s.beta = o.beta === true;
  return s;
}

function addBad(bad: readonly string[], ids: readonly string[]): string[] {
  const out = bad.filter((b) => !ids.includes(b));
  out.push(...ids.filter((id, i) => ID_RE.test(id) && ids.indexOf(id) === i));
  return out.slice(-MAX_BAD);
}

const clone = (s: LiveState): LiveState => ({ ...s, bad: [...s.bad], seen: { ...s.seen } });

/* ---------- Schritte ---------- */

export type BootAction = { kind: 'none' } | { kind: 'trial'; id: string } | { kind: 'reset' };

/**
 * Beim Start, bevor die Oberfläche zeichnet. failed: vom nativen Wächter/Startschutz gemeldete Bundles.
 * - offener Probelauf, der nicht läuft → fehlgeschlagen (Absturz, Wächter, App beendet)
 * - Reset verlangt und ein geladenes Bundle läuft → zurück zum eingebauten
 * - vorgemerktes Bundle, das (noch) passt → Probelauf starten
 */
export function bootStep(state: LiveState, ctx: { running: Running; nativeVersion: string; failed: readonly string[] }): { state: LiveState; action: BootAction } {
  const s = clone(state);
  s.bad = addBad(s.bad, ctx.failed);
  if (s.trial) {
    if (s.trial.id === ctx.running.id) return { state: s, action: { kind: 'none' } };
    s.bad = addBad(s.bad, [s.trial.id]);
    s.trial = null;
  }
  if (s.reset) {
    s.pending = null;
    if (ctx.running.id !== null) return { state: s, action: { kind: 'reset' } };
    s.reset = false;
  }
  const p = s.pending;
  if (!p) return { state: s, action: { kind: 'none' } };
  s.pending = null;
  // Seit dem Download kann ein neues Binary installiert sein (andere native und eingebaute Version)
  if (s.bad.includes(p.id) || !compatible(p.minNative, ctx.nativeVersion) || !isUpdate(p, p.channel, ctx.running)) {
    return { state: s, action: { kind: 'none' } };
  }
  s.trial = p;
  return { state: s, action: { kind: 'trial', id: p.id } };
}

/** Die Oberfläche hat sich gemeldet (ready): ein laufender Probelauf ist bestanden. */
export function readyStep(state: LiveState, running: Running): LiveState {
  const s = clone(state);
  if (s.trial && s.trial.id === running.id) s.trial = null;
  if (s.reset && running.id === null) s.reset = false;
  return s;
}

export type CheckAction = { kind: 'none'; reason: string } | { kind: 'download'; bundle: LiveBundle };

/** Nach dem Abruf eines gültigen, signierten Manifests: Was ist zu tun? (Setzt seen, pending und reset.) */
export function checkStep(state: LiveState, m: LiveManifest, ctx: { running: Running; nativeVersion: string; channel: LiveChannel }): { state: LiveState; action: CheckAction } {
  const s = clone(state);
  const none = (reason: string): { state: LiveState; action: CheckAction } => ({ state: s, action: { kind: 'none', reason } });
  if (m.channel !== ctx.channel) return none('falscher Kanal');
  const seen = s.seen[ctx.channel];
  if (seen && Date.parse(m.createdAt) < Date.parse(seen)) return none('älter als das zuletzt gesehene Manifest');
  s.seen[ctx.channel] = m.createdAt;
  if (m.mode === 'off') {
    s.pending = null;
    return none('Live-Updates aus');
  }
  if (m.mode === 'reset') {
    s.pending = null;
    s.reset = ctx.running.id !== null;
    return none('Reset');
  }
  s.reset = false;
  const b = m.bundle;
  if (!b) return none('kein Bundle');
  if (s.bad.includes(b.id)) return none('Bundle ist fehlgeschlagen');
  if (!compatible(b.minNative, ctx.nativeVersion)) return none(`braucht App ${b.minNative}`);
  if (!isUpdate(b, ctx.channel, ctx.running)) return none('aktuell');
  if (s.pending?.id === b.id || s.trial?.id === b.id) return none('schon geladen');
  return { state: s, action: { kind: 'download', bundle: b } };
}

/** Download fertig und geprüft: beim nächsten Start ausprobieren (ersetzt ein älteres vorgemerktes Bundle). */
export function downloadedStep(state: LiveState, b: LiveBundle, channel: LiveChannel, createdAt: string): LiveState {
  const s = clone(state);
  s.pending = { id: b.id, version: b.version, minNative: b.minNative, channel, createdAt };
  return s;
}

/** Diese Bundle-Ordner bleiben beim Aufräumen. */
export function keepIds(state: LiveState, running: Running): Set<string> {
  return new Set([running.id, state.pending?.id, state.trial?.id].filter((x): x is string => typeof x === 'string'));
}
