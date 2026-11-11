// Bündelt die App mit esbuild: src/app.ts → dist/js/app.js (+ Lazy-Chunks dist/js/c/<hash>.js) und public/css/app.css →
// dist/css/app.css. Läuft nach tsc, copy-static und pages, vor precache. Ersetzt die rund 200 einzelnen tsc-Module
// (Modul-Wasserfall beim ersten Besuch) und scripts/vendor.ts: die Vendor-Module (Supabase, Capacitor) werden mitgebündelt.
// Chunk-Namen sind absichtlich neutral (Hash), Inhaltsblocker-Listen sperren sprechende Dateinamen (tests/blocker-safe-paths).
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));
const DIST: string = `${ROOT}dist`;
const JS: string = `${DIST}/js`;
const CSS: string = `${DIST}/css`;
/** Bleiben unter dist/js, weil HTML (Start-Wächter) sie direkt lädt */
const KEEP_JS: ReadonlySet<string> = new Set(['boot-guard.js']);
/** Bleiben unter dist/css (eigene Seiten, nicht im App-Bundle) */
const KEEP_CSS: ReadonlySet<string> = new Set(['pages.css']);

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/** Löscht alles direkt unter dir außer den Ausnahmen (Ordner samt Inhalt). */
function prune(dir: string, keep: ReadonlySet<string>): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!keep.has(e.name)) rmSync(join(dir, e.name), { recursive: true, force: true });
  }
}

/**
 * Jedes dynamische import() erzeugt bei esbuild einen eigenen Chunk samt Chunks für alles, was Lazy- und Hauptteil
 * gemeinsam nutzen: Der Start lädt dann ein Dutzend kleiner Dateien. Deshalb werden Lazy-Importe von Modulen, die ohnehin
 * klein sind (Tour, Live-Update, Dialoge …), beim Bündeln zu statischen Importen (import() → Promise.resolve(Namensraum)).
 * Lazy bleiben nur die großen bzw. App-spezifischen Teile (Auth/Supabase, Capacitor-Plugins, native Passkeys).
 */
const LAZY = /(?:vendor\/(?:auth|native)|(?:^|\/)native-auth)\.ts$/;
const DYNAMIC = /(?<!typeof\s)\bimport\((['"])([^'"]+\.ts)\1\)(?!\.)/g;
const eagerImports: Plugin = {
  name: 'eager-imports',
  setup(b) {
    b.onLoad({ filter: /src[\\/].*\.ts$/ }, (args) => {
      const src: string = readFileSync(args.path, 'utf8');
      const lines: string[] = [];
      const code: string = src.replace(DYNAMIC, (all: string, _q: string, spec: string) => {
        if (LAZY.test(spec)) return all;
        const id = `__eager${lines.length}`;
        lines.push(`import * as ${id} from '${spec}';`);
        return `Promise.resolve(${id})`;
      });
      return { contents: lines.length ? `${lines.join('')}${code}` : code, loader: 'ts' };
    });
  },
};

async function bundleJs(): Promise<void> {
  // Das tsc-Ergebnis (Einzelmodule) wird nicht mehr gebraucht: nur der Start-Wächter bleibt, alles andere entsteht neu.
  prune(JS, KEEP_JS);
  const result = await build({
    // Vendor-Module bleiben eigene Einstiege mit festem Namen (dynamischer import() zeigt darauf); die Live-Update-Liste
    // (scripts/live-update.ts APP_ONLY_FILES) kennt sie, der Service Worker lädt sie erst bei Bedarf.
    entryPoints: { app: `${ROOT}src/app.ts`, 'vendor/auth': `${ROOT}src/vendor/auth.ts`, 'vendor/native': `${ROOT}src/vendor/native.ts` },
    outdir: JS,
    entryNames: '[dir]/[name]',
    chunkNames: 'c/[hash]',
    bundle: true,
    splitting: true,
    plugins: [eagerImports],
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
  });

  // Nach dem Bundling darf kein Import eines npm-Pakets übrig sein (der Browser kann ihn nicht auflösen).
  for (const [file, out] of Object.entries(result.metafile.outputs)) {
    const bare = out.imports.find((i) => i.external === true);
    if (bare) throw new Error(`bundle: bare Import in ${file}: ${bare.path}`);
  }

  // Dateien, die der Start nie lädt (Auth/Supabase, Capacitor, native Passkeys samt ihrer Chunks): Alles, was von app.js aus
  // nicht über statische Importe erreichbar ist. Der Service Worker lässt sie aus dem Precache, das Live-Update-Bundle nimmt sie auf.
  const outputs = result.metafile.outputs;
  const key = (path: string): string => relative(ROOT, path).split(sep).join('/');
  const startup = new Set<string>();
  const visit = (file: string): void => {
    if (startup.has(file)) return;
    startup.add(file);
    for (const i of outputs[file]?.imports ?? []) if (i.kind === 'import-statement') visit(i.path);
  };
  visit(key(`${JS}/app.js`));
  const appOnly: string[] = Object.keys(outputs)
    .filter((f) => !startup.has(f))
    .map((f) => `/${relative(DIST, `${ROOT}${f}`).split(sep).join('/')}`)
    .sort();
  writeFileSync(`${DIST}/app-only.json`, `${JSON.stringify({ files: appOnly }, null, 2)}\n`);
}

async function bundleCss(): Promise<void> {
  // Einzeldateien (aus public/ kopiert) werden durch das eine Bundle ersetzt
  prune(CSS, KEEP_CSS);
  await build({
    entryPoints: [`${ROOT}public/css/app.css`],
    outfile: `${CSS}/app.css`,
    bundle: true,
    minify: true,
    target: 'es2022',
    legalComments: 'none',
    logLevel: 'warning',
  });
}

function report(dir: string): string {
  const files: string[] = walk(dir);
  const kb: number = files.reduce((n, f) => n + statSync(f).size, 0) / 1024;
  return `${files.length} Dateien, ${kb.toFixed(0)} KB (${relative(DIST, dir).split(sep).join('/')})`;
}

mkdirSync(JS, { recursive: true });
await bundleJs();
await bundleCss();
console.log(`bundle: js ${report(JS)}, css ${report(CSS)}`);
