// Lokaler Ersatz für die GitHub-Actions-Pipeline (Website, Live-Updates, TestFlight) – für Monate ohne
// Actions-Kontingent. Gleiche Schritte und Prüfungen wie deploy.yml/ios.yml, nur auf dem eigenen Mac:
//   npm run local:keys         neue Schlüsselpaare für Live-Updates (privat → ~/.config/mental-math, öffentlich → config/)
//   npm run local:preview      develop  → Vorschau (Pages-Projekt mental-math-preview) + Beta-Live-Update
//   npm run local:testflight   develop/release/hotfix/* → Xcode-Archiv → TestFlight (Apple-ID aus Xcode → Settings → Accounts)
//   npm run local:production   release  → Produktion (Pages-Projekt mental-math) + Live-Update für alle
// Vor jedem Deploy: richtiger Branch, keine ungespeicherten Änderungen, Stand ist gepusht, Typprüfung und Tests grün.
// Cloudflare: Anmeldung von `npx wrangler login`. Öffentliche Werte (Supabase) kommen aus .env (nur PUBLIC_*).
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));
const WRANGLER = 'wrangler@4.156.0';
export const KEY_DIR: string = join(homedir(), '.config', 'mental-math');
const CONFIG_PATH = join(ROOT, 'config', 'live-update-keys.json');

export type Channel = 'production' | 'beta';
export interface LocalConfig { appleTeamId: string; production: string[]; beta: string[] }

/** Build-Nummer für TestFlight: yyMMddHHmm (UTC). Steigt immer und liegt weit über den CI-Läufen (Lauf-Nummern). */
export function buildNumber(now: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(now.getUTCFullYear() % 100)}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
}

/** Nur die öffentlichen Werte aus .env (PUBLIC_*); Server-Geheimnisse gelangen nie in den Build. */
export function publicEnv(dotenv: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of dotenv.split('\n')) {
    const m = /^\s*(PUBLIC_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m?.[1]) out[m[1]] = (m[2] ?? '').replace(/^"(.*)"$/, '$1');
  }
  return out;
}

export function parseConfig(raw: string): LocalConfig {
  const c = JSON.parse(raw) as Partial<LocalConfig>;
  const keys = (v: unknown): string[] => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && k.length > 40) : []);
  if (typeof c.appleTeamId !== 'string' || !/^[A-Z0-9]{10}$/.test(c.appleTeamId)) throw new Error('config/live-update-keys.json: appleTeamId fehlt');
  return { appleTeamId: c.appleTeamId, production: keys(c.production), beta: keys(c.beta) };
}

/** Welche Branches dürfen welchen Schritt auslösen (wie die Trigger in deploy.yml/ios.yml) */
export function branchAllowed(step: 'preview' | 'testflight' | 'production', branch: string): boolean {
  if (step === 'preview') return branch === 'develop';
  if (step === 'production') return branch === 'release';
  return branch === 'develop' || branch === 'release' || branch.startsWith('hotfix/');
}

/* ---------- Hilfen ---------- */

function run(cmd: string, args: string[], opts: SpawnSyncOptions = {}): void {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0] ?? ''} ist fehlgeschlagen (Exit ${String(r.status)})`);
}

function out(cmd: string, args: string[]): string {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim();
}

function config(): LocalConfig {
  if (!existsSync(CONFIG_PATH)) throw new Error('config/live-update-keys.json fehlt – zuerst npm run local:keys');
  return parseConfig(readFileSync(CONFIG_PATH, 'utf8'));
}

function signingKey(channel: Channel): string {
  const file = join(KEY_DIR, `live-update-${channel}.pem`);
  if (!existsSync(file)) throw new Error(`${file} fehlt – npm run local:keys (oder aus dem Passwort-Manager zurücklegen)`);
  return readFileSync(file, 'utf8');
}

/** Umgebung für Builds: Systemumgebung + öffentliche Werte, nie die Server-Geheimnisse aus .env */
function buildEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const cfg = config();
  const dotenv = existsSync(join(ROOT, '.env')) ? publicEnv(readFileSync(join(ROOT, '.env'), 'utf8')) : {};
  return {
    ...process.env,
    ...dotenv,
    PUBLIC_LIVE_UPDATE_KEYS: cfg.production.join(','),
    PUBLIC_LIVE_UPDATE_BETA_KEYS: cfg.beta.join(','),
    ...extra,
  };
}

/** Wie CI: richtiger Branch, sauberer Stand, gepusht – dann Typprüfung und Tests */
function preflight(step: 'preview' | 'testflight' | 'production'): { branch: string; sha: string } {
  const branch = out('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branchAllowed(step, branch)) throw new Error(`${step} läuft nicht auf „${branch}“ (preview: develop, production: release, testflight: develop/release/hotfix/*)`);
  if (out('git', ['status', '--porcelain', '--untracked-files=no']) !== '') throw new Error('Ungespeicherte Änderungen – erst committen');
  run('git', ['fetch', '--quiet', 'origin', branch]);
  const sha = out('git', ['rev-parse', 'HEAD']);
  if (sha !== out('git', ['rev-parse', `origin/${branch}`])) throw new Error(`Stand ist nicht gepusht oder nicht aktuell (HEAD ≠ origin/${branch})`);
  run('npm', ['run', 'typecheck']);
  run('npm', ['test']);
  return { branch, sha };
}

function pagesDeploy(project: string, cfBranch: string, sha: string): void {
  const msg = out('git', ['log', '-1', '--format=%s']).slice(0, 380);
  run('npx', ['-y', WRANGLER, 'pages', 'deploy', 'dist', `--project-name=${project}`, `--branch=${cfBranch}`,
    `--commit-hash=${sha}`, `--commit-message=${msg}`, '--commit-dirty=false']);
}

/* ---------- Schritte ---------- */

function keys(force: boolean): void {
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const prev = existsSync(CONFIG_PATH) ? (JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Partial<LocalConfig>) : {};
  const next: LocalConfig = { appleTeamId: prev.appleTeamId ?? '5CZDRHVFCY', production: [], beta: [] };
  for (const channel of ['production', 'beta'] as const) {
    const file = join(KEY_DIR, `live-update-${channel}.pem`);
    if (existsSync(file) && !force) throw new Error(`${file} gibt es schon – mit --force ersetzen (alte Builds nehmen dann keine Updates mehr an)`);
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), { mode: 0o600 });
    chmodSync(file, 0o600);
    next[channel] = [publicKey.export({ type: 'spki', format: 'der' }).toString('base64')];
    console.log(`${channel}: privat ${file}`);
  }
  mkdirSync(join(ROOT, 'config'), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`öffentlich: config/live-update-keys.json\nDie privaten Schlüssel zusätzlich im Passwort-Manager sichern. Ohne sie nehmen Apps aus diesem Build keine Updates an.`);
}

function preview(): void {
  const { sha } = preflight('preview');
  run('npm', ['run', 'build'], { env: buildEnv({ DEPLOY_CHANNEL: 'preview' }) });
  run('node', ['scripts/live-update.ts', 'publish', '--channel', 'beta'], { env: buildEnv({ LIVE_UPDATE_SIGNING_KEY: signingKey('beta') }) });
  pagesDeploy('mental-math-preview', 'develop', sha);
  console.log('\nVorschau: https://preview.mental-math.elias-steffen.de (Beta-Live-Update für TestFlight mit „Beta-Updates“)');
}

function production(): void {
  const { sha } = preflight('production');
  const cfg = config();
  run('npm', ['run', 'build'], { env: buildEnv({ APPLE_TEAM_ID: cfg.appleTeamId }) });
  run('node', ['scripts/live-update.ts', 'publish', '--channel', 'production'], { env: buildEnv({ LIVE_UPDATE_SIGNING_KEY: signingKey('production') }) });
  // Cloudflare: „main“ ist der Produktions-Branch des Pages-Projekts (nicht der Git-Branch)
  pagesDeploy('mental-math', 'main', sha);
  console.log('\nProduktion: https://mental-math.elias-steffen.de – Live-Update für alle Apps mit Updater');
}

function testflight(): void {
  preflight('testflight');
  const cfg = config();
  const version = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  const build = buildNumber(new Date());
  const work = join(tmpdir(), `mental-math-${build}`);
  const archive = join(work, 'App.xcarchive');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  run('npm', ['run', 'ios:sync'], { env: buildEnv({}) });
  run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Release',
    '-destination', 'generic/platform=iOS', '-archivePath', archive, '-allowProvisioningUpdates',
    `DEVELOPMENT_TEAM=${cfg.appleTeamId}`, `MARKETING_VERSION=${version}`, `CURRENT_PROJECT_VERSION=${build}`, '-quiet', 'archive']);

  // Wie ios.yml: ohne Associated Domain (webcredentials:) scheitern die Passkeys der App – dann nicht hochladen
  const app = join(archive, 'Products', 'Applications', 'App.app');
  const ents = spawnSync('codesign', ['-d', '--entitlements', '-', '--xml', app], { encoding: 'utf8' });
  if (!`${ents.stdout}${ents.stderr}`.includes('webcredentials:')) {
    throw new Error('Archiv ohne Associated Domain (webcredentials:) – App-ID in developer.apple.com → Identifiers → „Associated Domains“ prüfen');
  }

  // Hochladen mit der Apple-ID aus Xcode (destination=upload); ExportOptions wie in CI, nur mit Upload statt Export
  const plist = readFileSync(join(ROOT, 'ios', 'ExportOptions.plist'), 'utf8')
    .replace('__TEAM_ID__', cfg.appleTeamId)
    .replace('<string>export</string>', '<string>upload</string>');
  writeFileSync(join(work, 'ExportOptions.plist'), plist);
  run('xcodebuild', ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', join(work, 'ExportOptions.plist'),
    '-exportPath', join(work, 'export'), '-allowProvisioningUpdates']);
  console.log(`\nHochgeladen: ${version} (${build}). Erscheint nach Apples Verarbeitung (5–20 min) in TestFlight.`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'keys') keys(rest.includes('--force'));
  else if (cmd === 'preview') preview();
  else if (cmd === 'production') production();
  else if (cmd === 'testflight') testflight();
  else throw new Error('Aufruf: node scripts/local-release.ts keys|preview|testflight|production');
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`\n✖ ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
