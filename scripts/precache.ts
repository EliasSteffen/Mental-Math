// Erzeugt dist/precache.json ({ version, files }) für den Service Worker und setzt die Version in dist/sw.js ein.
// Läuft nach copy-static. Die Version ist ein Inhalts-Hash über alle precachten Dateien und sw.js selbst.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST: string = fileURLToPath(new URL('../dist', import.meta.url));
const DIRS: readonly string[] = ['js', 'css', 'icons'];
const FILES: readonly string[] = ['index.html', 'favicon.svg', 'manifest.webmanifest'];
const EXCLUDE: ReadonlySet<string> = new Set(['sw.js', 'precache.json', '_headers']);
/** Platzhalter in src/sw.ts (BUILD_VERSION), in Anführungszeichen. */
const VERSION_TOKEN = /(['"])__PRECACHE_VERSION__\1/g;

/**
 * Setzt die Version in den Quelltext von sw.js ein (Platzhalter genau einmal). Erst dadurch ändert sich sw.js mit jedem
 * Deploy – sonst erkennt der Browser keine neue Version, und der versionierte Precache würde nie erneuert.
 */
export function injectVersion(source: string, version: string): string {
  if (!/^[0-9a-f]+$/.test(version)) throw new Error(`sw.js: ungültige Version „${version}“`);
  const n = source.match(VERSION_TOKEN)?.length ?? 0;
  if (n !== 1) throw new Error(`sw.js: Versions-Platzhalter ${n}× statt 1× gefunden`);
  return source.replace(VERSION_TOKEN, (_m: string, q: string) => `${q}${version}${q}`);
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (!name.endsWith('.map') && !EXCLUDE.has(name)) out.push(p);
  }
  return out;
}

function main(): void {
  const abs: string[] = [
    ...DIRS.flatMap((d) => walk(join(DIST, d))),
    ...FILES.map((f) => join(DIST, f)).filter((p) => existsSync(p)),
  ];
  // Storage-Bundle wird beim Start offline gebraucht (vorladen); das Auth-Bundle braucht ohnehin Netz und bleibt draußen.
  const files: string[] = abs
    .map((p) => '/' + relative(DIST, p).split(sep).join('/'))
    .filter((f) => f !== '/js/vendor/auth.js')
    .sort();

  const swPath: string = join(DIST, 'sw.js');
  const swSource: string = readFileSync(swPath, 'utf8');

  const hash = createHash('sha256');
  for (const f of files) {
    hash.update(f);
    hash.update(readFileSync(join(DIST, f)));
  }
  // sw.js (mit Platzhalter) gehört dazu: eine Änderung nur am Service Worker bekommt so einen eigenen Cache
  hash.update('/sw.js');
  hash.update(swSource);
  const version: string = hash.digest('hex').slice(0, 10);

  writeFileSync(swPath, injectVersion(swSource, version));
  writeFileSync(join(DIST, 'precache.json'), JSON.stringify({ version, files }, null, 2) + '\n');
  console.log(`precache.json: ${files.length} Dateien, Version ${version} (auch in sw.js)`);
}

if (import.meta.main) main();
