// Schreibt src/generated/build-info.ts (Version aus package.json, Git-Kurz-Hash, Datum, Kanal)
// und src/generated/public-config.ts (öffentliche Werte aus PUBLIC_* in process.env: Supabase, API, Live-Updates).
// Kanal: DEPLOY_CHANNEL=preview für Vorschau-Builds (Pull Requests, develop), sonst Produktion.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { BuildChannel } from '../src/types.ts';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));

export interface PublicConfig {
  supabaseUrl: string;
  supabaseKey: string;
  apiOrigin: string;
  /** Live-Updates der iOS-App (docs/PLAN-live-updates.md): Manifest-Adressen und vertraute Schlüssel (Base64-SPKI) */
  liveUpdateUrl: string;
  liveUpdateBetaUrl: string;
  liveUpdateKeys: string[];
  liveUpdateBetaKeys: string[];
}

/** API der iOS-App (die Website nutzt relative Pfade); überschreibbar mit PUBLIC_API_ORIGIN */
export const DEFAULT_API_ORIGIN = 'https://mental-math.elias-steffen.de';

/** Beta-Manifest (develop → Vorschau); überschreibbar mit PUBLIC_LIVE_UPDATE_BETA_URL */
export const DEFAULT_LIVE_UPDATE_BETA_URL = 'https://preview.mental-math.elias-steffen.de/ota/manifest.json';

/** Manifest-Adresse: https, oder http nur auf localhost/127.0.0.1 (Test im Simulator) */
export function validManifestUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.username || u.password || u.search || u.hash) return false;
    return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch {
    return false;
  }
}

/** Base64-SPKI eines P-256-Schlüssels: fester Kopf (Algorithmus + Kurve), 65 Byte Punkt, zusammen 91 Byte */
const P256_SPKI_RE = /^MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE[A-Za-z0-9+/]{86}==$/;

/** Öffentliche Schlüssel (Komma-getrennt, Base64-SPKI P-256); ungültige fallen weg. */
export function parseLiveUpdateKeys(raw: string | undefined): string[] {
  return (raw ?? '').split(',').map((k) => k.trim())
    .filter((k) => P256_SPKI_RE.test(k));
}

/** https-Origin ohne Pfad, z. B. https://mental-math.example */
export function validApiOrigin(origin: string): boolean {
  try {
    return new URL(origin).origin === origin && origin.startsWith('https://');
  } catch {
    return false;
  }
}

/** Vorschau oder Produktion; nur der exakte Wert 'preview' ergibt eine Vorschau. */
export function deployChannel(raw: string | undefined): BuildChannel {
  return (raw ?? '').trim() === 'preview' ? 'preview' : 'production';
}

function gitHash(): string {
  try {
    const out: string = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : 'dev';
  } catch {
    return 'dev';
  }
}

function today(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Supabase-Projekt-URL, z. B. https://abcdefgh.supabase.co */
export function validPublicUrl(url: string): boolean {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url);
}

/** Öffentlicher Schlüssel: neues Format sb_publishable_… oder altes anon-JWT (eyJ…) */
export function validPublicKey(key: string): boolean {
  return key.startsWith('sb_publishable_') || key.startsWith('eyJ');
}

/** Lädt die .env aus dem Projektroot, nur wenn PUBLIC_* fehlen. Werte werden nie ausgegeben. */
function loadDotEnvIfNeeded(): void {
  if (process.env.PUBLIC_SUPABASE_URL && process.env.PUBLIC_SUPABASE_ANON_KEY) return;
  const path: string = `${ROOT}.env`;
  if (!existsSync(path)) return;
  try {
    process.loadEnvFile(path);
  } catch {
    /* ungültige .env ignorieren, dann bleiben die Werte leer */
  }
}

/**
 * Liest die öffentliche Konfiguration; ungültige Werte werden zu leeren Strings. Die App spricht – auch im Beta-Live-Update
 * (DEPLOY_CHANNEL=preview) – die API der Produktion an: Deren Tokens akzeptiert Supabase beim Sync. Eine andere API für
 * Beta-Bundles nur ausdrücklich per PUBLIC_PREVIEW_API_ORIGIN, und nur, wenn dieser Server mit demselben AUTH_JWT_KEY
 * signiert (sonst „Anmeldung abgelaufen“ beim Sync). Das Produktions-Manifest bleibt immer das der Produktion.
 */
export function readPublicConfig(channel: BuildChannel = deployChannel(process.env.DEPLOY_CHANNEL)): PublicConfig {
  loadDotEnvIfNeeded();
  const url: string = (process.env.PUBLIC_SUPABASE_URL ?? '').trim();
  const key: string = (process.env.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const api: string = (process.env.PUBLIC_API_ORIGIN ?? '').trim();
  const productionOrigin: string = validApiOrigin(api) ? api : DEFAULT_API_ORIGIN;
  const previewApi: string = (process.env.PUBLIC_PREVIEW_API_ORIGIN ?? '').trim();
  const apiOrigin: string = channel === 'preview' && validApiOrigin(previewApi) ? previewApi : productionOrigin;
  const lu: string = (process.env.PUBLIC_LIVE_UPDATE_URL ?? '').trim();
  const luBeta: string = (process.env.PUBLIC_LIVE_UPDATE_BETA_URL ?? '').trim();
  return {
    supabaseUrl: validPublicUrl(url) ? url : '',
    supabaseKey: validPublicKey(key) ? key : '',
    apiOrigin,
    liveUpdateUrl: validManifestUrl(lu) ? lu : `${productionOrigin}/ota/manifest.json`,
    liveUpdateBetaUrl: validManifestUrl(luBeta) ? luBeta : DEFAULT_LIVE_UPDATE_BETA_URL,
    liveUpdateKeys: parseLiveUpdateKeys(process.env.PUBLIC_LIVE_UPDATE_KEYS),
    liveUpdateBetaKeys: parseLiveUpdateKeys(process.env.PUBLIC_LIVE_UPDATE_BETA_KEYS),
  };
}

function main(): void {
  const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { version: string };
  const info = { version: pkg.version, build: gitHash(), date: today(), channel: deployChannel(process.env.DEPLOY_CHANNEL) };

  const out = `// AUTOMATISCH ERZEUGT von scripts/build-info.ts – nicht bearbeiten, nicht versionieren.
import type { BuildInfo } from '../types.ts';

export const BUILD_INFO: BuildInfo = ${JSON.stringify(info)};
`;

  const cfg: PublicConfig = readPublicConfig();
  const publicOut = `// AUTOMATISCH ERZEUGT von scripts/build-info.ts – nicht bearbeiten. Nur öffentliche Werte.
export const PUBLIC_CONFIG: {
  supabaseUrl: string; supabaseKey: string; apiOrigin: string;
  liveUpdateUrl: string; liveUpdateBetaUrl: string; liveUpdateKeys: string[]; liveUpdateBetaKeys: string[];
} = ${JSON.stringify(cfg)};
`;

  mkdirSync(`${ROOT}src/generated`, { recursive: true });
  writeFileSync(`${ROOT}src/generated/build-info.ts`, out);
  writeFileSync(`${ROOT}src/generated/public-config.ts`, publicOut);
  console.log(`build-info: ${info.version} (${info.build}, ${info.date}, ${info.channel})`);
  console.log(`public-config: Supabase-URL ${cfg.supabaseUrl ? 'gesetzt' : 'leer'}, Schlüssel ${cfg.supabaseKey ? 'gesetzt' : 'leer'}`);
  console.log(`public-config: API der App ${cfg.apiOrigin}`);
  console.log(`public-config: Live-Updates ${cfg.liveUpdateKeys.length} Schlüssel (${cfg.liveUpdateUrl}), Beta ${cfg.liveUpdateBetaKeys.length}`);
}

if (import.meta.main) main();
