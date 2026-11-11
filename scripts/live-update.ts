// Live-Updates der iOS-App (docs/PLAN-live-updates.md): Manifest bauen und signieren, Schlüssel erzeugen.
//   node scripts/live-update.ts publish --channel production|beta   (nach npm run build; schreibt dist/ota/manifest.json)
//   node scripts/live-update.ts keygen                               (neues Schlüsselpaar, Ausgabe nur im Terminal)
// Umgebung beim Veröffentlichen:
//   LIVE_UPDATE_SIGNING_KEY  privater Schlüssel (PEM, P-256) – nur im GitHub-Environment production bzw. preview.
//                            Fehlt er, entsteht kein Manifest (die Apps sehen 404 und tun nichts).
//   LIVE_UPDATE              on (Standard) | off (Not-Aus: nichts Neues laden) | reset (zurück zum eingebauten Bundle)
// Das Bundle ist dist/ selbst: alle Dateien aus precache.json plus die App-Bundles, die der Service Worker auslässt.
// Die Dateien liegen nach dem Deploy unter derselben Origin wie das Manifest.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bundleId, parseManifest, verifySignature,
  type LiveChannel, type LiveEnvelope, type LiveFile, type LiveManifest, type LiveMode,
} from '../src/core/live-update.ts';
import { fingerprint, nativeInputs, readNativeVersion } from './native-fingerprint.ts';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));
export const MANIFEST_PATH = 'ota/manifest.json';
/** Nur in der App gebraucht, deshalb nicht im Precache des Service Workers (scripts/precache.ts) */
export const APP_ONLY_FILES: readonly string[] = ['/js/vendor/auth.js', '/js/vendor/native.js'];

/** Dateien des Bundles: Precache-Liste plus App-Bundles, sortiert, ohne Dubletten. */
export function bundlePaths(precacheFiles: readonly string[], appOnly: readonly string[] = []): string[] {
  const paths = [...new Set([...precacheFiles, ...APP_ONLY_FILES, ...appOnly])].sort();
  // CapacitorHttp liefert JSON (Content-Type application/json) geparst statt als Bytes – solche Dateien gehören nicht hinein
  const json = paths.filter((p) => p.endsWith('.json'));
  if (json.length) throw new Error(`Bundle enthält JSON-Dateien: ${json.join(', ')}`);
  if (!paths.includes('/index.html')) throw new Error('Bundle ohne /index.html');
  return paths;
}

export function describeFiles(dist: string, paths: readonly string[]): LiveFile[] {
  return paths.map((path) => {
    const abs = join(dist, path);
    if (!existsSync(abs)) throw new Error(`fehlt in dist: ${path}`);
    const data = readFileSync(abs);
    return { path, sha256: createHash('sha256').update(data).digest('hex'), size: data.length };
  });
}

export function parseMode(raw: string | undefined): LiveMode {
  const m = (raw ?? '').trim().toLowerCase() || 'on';
  if (m !== 'on' && m !== 'off' && m !== 'reset') throw new Error(`LIVE_UPDATE muss on, off oder reset sein, nicht „${m}“`);
  return m;
}

export interface BuildInput {
  channel: LiveChannel;
  mode: LiveMode;
  createdAt: string;
  bundle?: { version: string; build: string; minNative: string; files: LiveFile[] };
}

export async function buildManifest(o: BuildInput): Promise<LiveManifest> {
  if (o.mode !== 'on') return { schema: 1, channel: o.channel, createdAt: o.createdAt, mode: o.mode, bundle: null };
  if (!o.bundle) throw new Error('mode on braucht ein Bundle');
  const files = [...o.bundle.files].sort((a, b) => (a.path < b.path ? -1 : 1));
  return {
    schema: 1, channel: o.channel, createdAt: o.createdAt, mode: 'on',
    bundle: { id: await bundleId(files), version: o.bundle.version, build: o.bundle.build, minNative: o.bundle.minNative, files },
  };
}

/** Öffentlicher Schlüssel (Base64-SPKI) zum privaten (PEM). */
export function publicKeyOf(privatePem: string): string {
  return createPublicKey(createPrivateKey(privatePem)).export({ type: 'spki', format: 'der' }).toString('base64');
}

export function keyIdOf(publicSpkiB64: string): string {
  return createHash('sha256').update(Buffer.from(publicSpkiB64, 'base64')).digest('hex').slice(0, 16);
}

/** Signierter Umschlag: ECDSA P-256/SHA-256 über die UTF-8-Bytes von payload, Signatur als r‖s (WebCrypto-Format). */
export function signEnvelope(payload: string, privatePem: string): LiveEnvelope {
  const key = createPrivateKey(privatePem);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new Error('Schlüssel ist kein P-256');
  const sig = sign('sha256', Buffer.from(payload, 'utf8'), { key, dsaEncoding: 'ieee-p1363' });
  return { kid: keyIdOf(publicKeyOf(privatePem)), payload, sig: sig.toString('base64url') };
}

function keygen(): void {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  console.log('Neues Schlüsselpaar für Live-Updates (docs/PLAN-live-updates.md → Einrichtung)\n');
  console.log(`Öffentlich (Repo-Variable LIVE_UPDATE_PUBLIC_KEYS bzw. LIVE_UPDATE_BETA_PUBLIC_KEYS), Schlüssel-ID ${keyIdOf(pub)}:\n${pub}\n`);
  console.log('Privat (Environment-Secret LIVE_UPDATE_SIGNING_KEY) – nirgends speichern außer dort:');
  console.log(pem);
}

async function publish(channel: LiveChannel): Promise<void> {
  const dist = join(ROOT, 'dist');
  const mode = parseMode(process.env.LIVE_UPDATE);
  const pem = (process.env.LIVE_UPDATE_SIGNING_KEY ?? '').trim();
  if (!pem) {
    console.log('::warning::Live-Update: kein LIVE_UPDATE_SIGNING_KEY – kein Manifest veröffentlicht (docs/PLAN-live-updates.md → Einrichtung)');
    return;
  }
  const pub = publicKeyOf(pem);
  const createdAt = new Date().toISOString();
  let input: BuildInput = { channel, mode, createdAt };

  if (mode === 'on') {
    // Erst nach dem Build vorhanden: Werte genau dieses Bundles
    const { PUBLIC_CONFIG } = await import('../src/generated/public-config.ts');
    const { BUILD_INFO } = await import('../src/generated/build-info.ts');
    const trusted: readonly string[] = channel === 'beta' ? PUBLIC_CONFIG.liveUpdateBetaKeys : PUBLIC_CONFIG.liveUpdateKeys;
    if (!trusted.includes(pub)) {
      throw new Error(`Das Bundle vertraut dem Signaturschlüssel ${keyIdOf(pub)} nicht – nach dem Update nähme die App keine `
        + `weiteren an. ${channel === 'beta' ? 'LIVE_UPDATE_BETA_PUBLIC_KEYS' : 'LIVE_UPDATE_PUBLIC_KEYS'} im Build setzen.`);
    }
    const native = readNativeVersion();
    if (fingerprint(nativeInputs()) !== native.fingerprint) {
      throw new Error('ios/native-version.json ist veraltet (native Teile geändert) – npm run native:stamp');
    }
    const precache = JSON.parse(readFileSync(join(dist, 'precache.json'), 'utf8')) as { files: string[] };
    // Chunks, die nur Auth/Native laden (scripts/bundle.ts), stehen nicht im Precache, gehören aber ins App-Bundle
    const appOnlyPath = join(dist, 'app-only.json');
    const appOnly = existsSync(appOnlyPath) ? (JSON.parse(readFileSync(appOnlyPath, 'utf8')) as { files: string[] }).files : [];
    input = {
      ...input,
      bundle: {
        version: BUILD_INFO.version, build: BUILD_INFO.build, minNative: native.minNative,
        files: describeFiles(dist, bundlePaths(precache.files, appOnly)),
      },
    };
  }

  const manifest = await buildManifest(input);
  const payload = JSON.stringify(manifest);
  const envelope = signEnvelope(payload, pem);
  // Selbstprüfung mit derselben Logik wie die App
  const parsed = parseManifest(envelope.payload);
  if (!parsed.ok) throw new Error(`Manifest ungültig: ${parsed.error}`);
  if (!(await verifySignature(envelope, [pub]))) throw new Error('Signatur lässt sich nicht prüfen');

  const out = join(dist, MANIFEST_PATH);
  mkdirSync(join(dist, 'ota'), { recursive: true });
  writeFileSync(out, `${JSON.stringify(envelope)}\n`);
  const b = manifest.bundle;
  const what = b ? `${b.version} (${b.id}, ${b.files.length} Dateien, minNative ${b.minNative})` : `mode ${mode}`;
  console.log(`Live-Update ${channel}: ${what}, Schlüssel ${envelope.kid} → dist/${MANIFEST_PATH}`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'keygen') { keygen(); return; }
  if (cmd === 'publish') {
    const i = rest.indexOf('--channel');
    const channel = i >= 0 ? rest[i + 1] : 'production';
    if (channel !== 'production' && channel !== 'beta') throw new Error(`--channel production|beta, nicht „${String(channel)}“`);
    await publish(channel);
    return;
  }
  console.error('Aufruf: node scripts/live-update.ts publish --channel production|beta | keygen');
  process.exit(2);
}

if (import.meta.main) await main();
