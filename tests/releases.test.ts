import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RELEASES, compareVersions, releasesSince } from '../src/releases.ts';
import { renderChangelog } from '../scripts/changelog.ts';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

test('Releases: SemVer-Format, Datum, Texte', () => {
  for (const r of RELEASES) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/);
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(r.title.de && r.title.en);
    assert.ok(r.highlights.length >= 2 && r.highlights.length <= 6);
    for (const hl of r.highlights) assert.ok(hl.de.trim() && hl.en.trim());
  }
});

test('Releases: absteigend sortiert, erste == package.json', () => {
  for (let i = 1; i < RELEASES.length; i++) {
    assert.ok(compareVersions(RELEASES[i - 1]!.version, RELEASES[i]!.version) > 0);
  }
  const pkg = JSON.parse(read('../package.json')) as { version: string };
  assert.equal(RELEASES[0]!.version, pkg.version);
});

test('compareVersions / releasesSince', () => {
  assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
  assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  assert.ok(compareVersions('1.2.3', '2.0.0') < 0);
  assert.deepEqual(releasesSince('').map((r) => r.version), [RELEASES[0]!.version]);
  assert.deepEqual(releasesSince('1.6.0').map((r) => r.version), ['1.10.0', '1.9.0', '1.8.0', '1.7.0']);
  assert.deepEqual(releasesSince(RELEASES[0]!.version), []);
});

test('CHANGELOG.md ist aktuell', () => {
  assert.equal(read('../CHANGELOG.md'), renderChangelog());
});
