// Kein ausgelieferter Pfad darf eine allgemeine Regel gängiger Werbe-/Tracking-Blocker treffen. Sonst blockiert ein
// Inhaltsblocker (z. B. in Safari) ein einzelnes Modul, der ganze Modulgraph scheitert, und die Website startet nicht
// („Laden fehlgeschlagen: …/js/app.js“). So geschehen mit /js/views/analyse.js (EasyPrivacy: „/analyse.js“) und
// /js/platform/web-push.js (Fanboy Notifications: „/web-push.js“). Regeln: tests/fixtures/blocker-path-rules.txt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

const toUrl = (p: string): string => `/${p.split(sep).join('/')}`;

/** Pfade, unter denen der Build ausliefert: src/**.ts → /js/**.js (src/sw.ts → /sw.js), public/** unverändert. */
function servedPaths(): string[] {
  const src = join(ROOT, 'src');
  const fromSrc = files(src)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map((f) => {
      const rel = relative(src, f).replace(/\.ts$/, '.js');
      return rel === 'sw.js' ? '/sw.js' : `/js${toUrl(rel)}`;
    });
  const pub = join(ROOT, 'public');
  return [...fromSrc, ...files(pub).map((f) => toUrl(relative(pub, f)))];
}

function rules(): string[] {
  return readFileSync(join(ROOT, 'tests/fixtures/blocker-path-rules.txt'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('!'));
}

test('Regel-Schnappschuss enthält die beiden bekannten Fälle', () => {
  const r = rules();
  assert.ok(r.length > 1000);
  assert.ok(r.includes('/analyse.js'));
  assert.ok(r.includes('/web-push.js'));
});

test('kein ausgelieferter Pfad trifft eine allgemeine Blocker-Regel', () => {
  const r = rules().map((x) => x.toLowerCase());
  const paths = servedPaths();
  assert.ok(paths.includes('/js/app.js') && paths.includes('/sw.js') && paths.includes('/index.html'));
  const hits = paths.flatMap((p) => r.filter((x) => p.toLowerCase().includes(x)).map((x) => `${p}  ←  ${x}`));
  assert.deepEqual(hits, [], `Diese Pfade würden von Inhaltsblockern geblockt – Datei umbenennen:\n${hits.join('\n')}`);
});
