// Öffentliche Seiten (scripts/pages.ts): Datenschutz, Hilfe, Neuigkeiten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT, esc, helpPage, privacyPage, releasesPage } from '../scripts/pages.ts';
import { RELEASES } from '../src/releases.ts';

test('Seiten: deutsch und englisch, Stil ohne Inline-CSS (CSP), Navigation markiert die aktuelle Seite', () => {
  for (const [html, slug] of [[privacyPage(), 'datenschutz'], [helpPage(), 'hilfe'], [releasesPage(), 'neuigkeiten']] as const) {
    assert.match(html, /<article lang="de">/);
    assert.match(html, /<article lang="en" id="en">/);
    assert.match(html, /<link rel="stylesheet" href="\/css\/pages\.css">/);
    assert.doesNotMatch(html, /style=|<style|<script/);
    assert.match(html, new RegExp(`<a href="/${slug}" aria-current="page">`));
  }
});

test('Datenschutz und Hilfe nennen den Verantwortlichen bzw. Kontakt', () => {
  for (const html of [privacyPage(), helpPage()]) {
    assert.ok(html.includes(CONTACT.name));
    assert.ok(html.includes(esc(CONTACT.email)));
  }
});

test('Neuigkeiten: alle Versionen, neueste zuerst, Texte maskiert', () => {
  const html = releasesPage();
  for (const r of RELEASES) assert.ok(html.includes(`<span class="ver">${r.version}</span>`), r.version);
  const first = RELEASES[0]?.version ?? '';
  const second = RELEASES[1]?.version ?? '';
  assert.ok(html.indexOf(first) < html.indexOf(second));
  const own = releasesPage([{ version: '9.9.9', date: '2026-01-02', title: { de: 'A <b>', en: 'B' }, highlights: [{ de: 'x & y', en: 'z' }] }]);
  assert.ok(own.includes('A &lt;b&gt;') && own.includes('x &amp; y'));
  assert.ok(own.includes('2. Januar 2026') && own.includes('January 2, 2026'));
});
