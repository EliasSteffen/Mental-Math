// Erzeugt public/precache.json ({ version, files }) für den Service Worker. Läuft nach tsc.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC: string = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'public');
const DIRS: readonly string[] = ['js', 'css', 'icons'];
const FILES: readonly string[] = ['index.html', 'favicon.svg', 'manifest.webmanifest'];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (!name.endsWith('.map')) out.push(p);
  }
  return out;
}

const abs: string[] = [
  ...DIRS.flatMap((d) => walk(join(PUBLIC, d))),
  ...FILES.map((f) => join(PUBLIC, f)).filter((p) => existsSync(p)),
];
const files: string[] = abs.map((p) => '/' + relative(PUBLIC, p).split(sep).join('/')).sort();

const hash = createHash('sha256');
for (const f of files) {
  hash.update(f);
  hash.update(readFileSync(join(PUBLIC, f)));
}
const version: string = hash.digest('hex').slice(0, 10);

writeFileSync(join(PUBLIC, 'precache.json'), JSON.stringify({ version, files }, null, 2) + '\n');
console.log(`precache.json: ${files.length} Dateien, Version ${version}`);
