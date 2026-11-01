// Bündelt src/vendor/{auth,storage,native}.ts mit esbuild zu dist/js/vendor/*.js (überschreibt die tsc-Ausgabe). Läuft nach tsc.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR: string = `${ROOT}dist/js/vendor`;
const ENTRIES: readonly string[] = ['auth', 'storage', 'native'];

mkdirSync(OUT_DIR, { recursive: true });
for (const name of ENTRIES) {
  const out: string = `${OUT_DIR}/${name}.js`;
  await build({
    entryPoints: [`${ROOT}src/vendor/${name}.ts`],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    outfile: out,
    legalComments: 'none',
    logLevel: 'warning',
  });

  // Nach dem Bundling darf kein Import eines npm-Pakets übrig sein (sonst lädt der Browser es nicht).
  const code: string = readFileSync(out, 'utf8');
  const bare: RegExpExecArray | null = /\bfrom\s*"(?![./])[^"]*"/.exec(code);
  if (bare) throw new Error(`vendor: bare Import in ${name}.js gefunden: ${bare[0]}`);

  const kb: string = (statSync(out).size / 1024).toFixed(1);
  console.log(`vendor: js/vendor/${name}.js ${kb} KB, ohne bare Imports`);
}
