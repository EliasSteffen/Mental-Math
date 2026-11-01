// Schreibt src/generated/build-info.ts (Version aus package.json, Git-Kurz-Hash, Datum)
// und src/generated/public-config.ts (öffentliche Supabase-Werte aus PUBLIC_* in process.env).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));

export interface PublicConfig { supabaseUrl: string; supabaseKey: string; apiOrigin: string }

/** API der iOS-App (die Website nutzt relative Pfade); überschreibbar mit PUBLIC_API_ORIGIN */
export const DEFAULT_API_ORIGIN = 'https://mental-math.elias-steffen.de';

/** https-Origin ohne Pfad, z. B. https://mental-math.example */
export function validApiOrigin(origin: string): boolean {
  try {
    return new URL(origin).origin === origin && origin.startsWith('https://');
  } catch {
    return false;
  }
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

/** Liest die öffentliche Konfiguration; ungültige Werte werden zu leeren Strings. */
export function readPublicConfig(): PublicConfig {
  loadDotEnvIfNeeded();
  const url: string = (process.env.PUBLIC_SUPABASE_URL ?? '').trim();
  const key: string = (process.env.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const api: string = (process.env.PUBLIC_API_ORIGIN ?? '').trim();
  return {
    supabaseUrl: validPublicUrl(url) ? url : '',
    supabaseKey: validPublicKey(key) ? key : '',
    apiOrigin: validApiOrigin(api) ? api : DEFAULT_API_ORIGIN,
  };
}

function main(): void {
  const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')) as { version: string };
  const info = { version: pkg.version, build: gitHash(), date: today() };

  const out = `// AUTOMATISCH ERZEUGT von scripts/build-info.ts – nicht bearbeiten, nicht versionieren.
import type { BuildInfo } from '../types.ts';

export const BUILD_INFO: BuildInfo = ${JSON.stringify(info)};
`;

  const cfg: PublicConfig = readPublicConfig();
  const publicOut = `// AUTOMATISCH ERZEUGT von scripts/build-info.ts – nicht bearbeiten. Nur öffentliche Werte.
export const PUBLIC_CONFIG: { supabaseUrl: string; supabaseKey: string; apiOrigin: string } = ${JSON.stringify(cfg)};
`;

  mkdirSync(`${ROOT}src/generated`, { recursive: true });
  writeFileSync(`${ROOT}src/generated/build-info.ts`, out);
  writeFileSync(`${ROOT}src/generated/public-config.ts`, publicOut);
  console.log(`build-info: ${info.version} (${info.build}, ${info.date})`);
  console.log(`public-config: Supabase-URL ${cfg.supabaseUrl ? 'gesetzt' : 'leer'}, Schlüssel ${cfg.supabaseKey ? 'gesetzt' : 'leer'}`);
}

if (import.meta.main) main();
