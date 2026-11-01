// Erzeugt dist/precache.json ({ version, files }) für den Service Worker. Läuft nach copy-static.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST: string = fileURLToPath(new URL('../dist', import.meta.url));
const DIRS: readonly string[] = ['js', 'css', 'icons'];
const FILES: readonly string[] = ['index.html', 'favicon.svg', 'manifest.webmanifest'];
const EXCLUDE: ReadonlySet<string> = new Set(['sw.js', 'precache.json', '_headers']);

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

const abs: string[] = [
  ...DIRS.flatMap((d) => walk(join(DIST, d))),
  ...FILES.map((f) => join(DIST, f)).filter((p) => existsSync(p)),
];
// Storage-Bundle wird beim Start offline gebraucht (vorladen); das Auth-Bundle braucht ohnehin Netz und bleibt draußen,
// das Native-Bundle (Capacitor) läuft nur in der iOS-App.
const files: string[] = abs
  .map((p) => '/' + relative(DIST, p).split(sep).join('/'))
  .filter((f) => f !== '/js/vendor/auth.js' && f !== '/js/vendor/native.js')
  .sort();

const hash = createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(readFileSync(join(DIST, f)));
}
const version: string = hash.digest('hex').slice(0, 10);

writeFileSync(join(DIST, 'precache.json'), JSON.stringify({ version, files }, null, 2) + '\n');
console.log(`precache.json: ${files.length} Dateien, Version ${version}`);
