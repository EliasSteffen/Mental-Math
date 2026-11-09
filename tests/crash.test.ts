// Fehlerbericht der Fehlerkarte (src/ui/crash.ts) und Start-Wächter (public/js/boot-guard.js)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

(globalThis as { document?: unknown }).document = { getElementById: () => null, body: {} };
const { crashReport } = await import('../src/ui/crash.ts');
const root = join(import.meta.dirname, '..');

test('crashReport: Meldung einmal, Stack-Auszug, Version und Ort', () => {
  const e = new TypeError('kaputt');
  e.stack = 'TypeError: kaputt\n    at dateLine (home-data.js:13:12)\n    at renderHome (home.js:5:1)';
  const r = crashReport(e, '#/');
  const lines = r.split('\n');
  assert.equal(lines[0], 'TypeError: kaputt');
  assert.equal(lines.filter((l) => l === 'TypeError: kaputt').length, 1);
  assert.ok(lines.includes('at dateLine (home-data.js:13:12)'));
  assert.match(r, /Version \d+\.\d+\.\d+ \(.+\) · #\//);
  assert.match(crashReport('nur Text', '#/profil'), /^Error: nur Text/);
});

test('Start-Wächter: wird vor der App geladen, ohne Abhängigkeiten, und die App meldet sich (data-booted)', () => {
  const html = readFileSync(join(root, 'public/index.html'), 'utf8');
  const guard = html.indexOf('js/boot-guard.js');
  assert.ok(guard > 0 && guard < html.indexOf('js/app.js'), 'boot-guard.js vor app.js');
  const js = readFileSync(join(root, 'public/js/boot-guard.js'), 'utf8');
  assert.equal(/\bimport\b|\bexport\b/.test(js.replace(/\/\/.*$/gm, '')), false, 'klassisches Skript');
  assert.match(js, /data-booted/);
  assert.match(js, /mentalmath-/, 'löscht nur die Caches der App');
  assert.match(readFileSync(join(root, 'src/router.ts'), 'utf8'), /dataset\['booted'\] = '1'/);
});
