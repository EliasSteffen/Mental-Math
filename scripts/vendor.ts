// Bündelt src/vendor/auth.ts mit esbuild zu dist/js/vendor/auth.js (überschreibt die tsc-Ausgabe). Läuft nach tsc.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));
const ENTRY: string = `${ROOT}src/vendor/auth.ts`;
const OUT: string = `${ROOT}dist/js/vendor/auth.js`;

mkdirSync(dirname(OUT), { recursive: true });
await build({
  entryPoints: [ENTRY],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  outfile: OUT,
  legalComments: 'none',
  logLevel: 'warning',
});

// Nach dem Bundling darf kein Import eines npm-Pakets übrig sein (sonst lädt der Browser es nicht).
const code: string = readFileSync(OUT, 'utf8');
const bare: RegExpExecArray | null = /\bfrom\s*"(?![./])[^"]*"/.exec(code);
if (bare) throw new Error(`vendor: bare Import im Bundle gefunden: ${bare[0]}`);

const kb: string = (statSync(OUT).size / 1024).toFixed(1);
console.log(`vendor: js/vendor/auth.js ${kb} KB, ohne bare Imports`);
