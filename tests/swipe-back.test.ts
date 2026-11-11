// Zurück-Wisch: Regel (neu und alte Swift-Regel), Verlaufs-Stapel, Web-Geste ja/nein – und dass Swift und TS dieselben Listen haben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANY_DEPTH_ROOTS, LEGACY_ANY_DEPTH_ROOTS, LEGACY_SUBPAGE_ROOTS, SESSION_ROOTS, SUBPAGE_ROOTS,
  createNavHistory, isSessionPath, legacyNativeAllows, nativeSwipeEnabled, normalizePath, swipeBackAllowed, swipeCommits, webSwipeWanted,
} from '../src/core/swipe-back.ts';

const PREV = 'lernen'; // beliebige Seite, die keine Runde ist

test('Unterseiten erlauben den Wisch, Tab-Startseiten nicht', () => {
  const yes = ['/erfolge/shop', 'erfolge/sammlung', '/lernen/mul-2', '/lernen/x/schritte', '/profil', '/profil/training', '/fortschritt', '/analyse',
    '/quests', '/custom', '/rangliste?board=a', '/duell?d=abc', '/case', '/rennen', '/rennen/reihum', '/rennen/abc123', '/rennen/abc123/live', '#/erfolge/shop'];
  for (const p of yes) assert.equal(swipeBackAllowed(p, PREV), true, p);
  const no = ['', '/', '#/', '/lernen', '/erfolge', '/wettbewerbe', '/wettbewerbe?tab=x', '/lernen?q=1', '/train/add', '/chain', '/parallel', '/einstufung',
    '/challenge/abc', '/case/random', '/case/c1', '/unbekannt'];
  for (const p of no) assert.equal(swipeBackAllowed(p, PREV), false, p);
});

test('nie zurück in eine Runde, ohne Vorgänger nie', () => {
  for (const prev of ['/train/add', '/chain', '/parallel', '/einstufung', '/challenge/x', '/case/random', '/case/c1', '#/train/mul?n=5']) {
    assert.equal(swipeBackAllowed('/erfolge/shop', prev), false, prev);
  }
  assert.equal(swipeBackAllowed('/erfolge/shop', null), false);
  assert.equal(swipeBackAllowed('/erfolge/shop', ''), true, 'Heute ist ein gültiger Vorgänger');
  assert.equal(swipeBackAllowed('/erfolge/shop', '/case'), true, 'Auswahl ist keine Runde');
  assert.equal(isSessionPath('/case'), false);
  assert.equal(isSessionPath('/case/x'), true);
});

test('alte Swift-Regel exakt', () => {
  assert.equal(legacyNativeAllows('/lernen/x', PREV), true);
  assert.equal(legacyNativeAllows('/lernen', PREV), false);
  assert.equal(legacyNativeAllows('/profil/hilfe', PREV), true);
  assert.equal(legacyNativeAllows('/profil', PREV), false);
  assert.equal(legacyNativeAllows('/custom', null), true);
  assert.equal(legacyNativeAllows('/rangliste', PREV), true);
  assert.equal(legacyNativeAllows('/lernen/x', '/train/add'), false);
  assert.equal(legacyNativeAllows('/erfolge/shop', PREV), false);
  assert.equal(legacyNativeAllows('/quests', PREV), false);
  assert.equal(legacyNativeAllows('/rennen', PREV), false);
  assert.equal(legacyNativeAllows('/', PREV), false);
  // alt prüft nur den obersten Teil von „previous“: ein case/<id> davor war nicht gesperrt
  assert.equal(legacyNativeAllows('/custom', '/case/c1'), true);
});

test('Plugin-Meldung und Web-Geste', () => {
  assert.equal(nativeSwipeEnabled('/erfolge/shop', PREV, false), true);
  assert.equal(nativeSwipeEnabled('/erfolge/shop', PREV, true), false, 'laufendes Rennen');
  const o = { path: '/erfolge/shop', previousPath: PREV, blocked: false, pluginAvailable: false };
  assert.equal(webSwipeWanted(o), true);
  assert.equal(webSwipeWanted({ ...o, pluginAvailable: true }), false, 'Plugin da: WebKit macht es');
  assert.equal(webSwipeWanted({ ...o, blocked: true }), false);
  assert.equal(webSwipeWanted({ ...o, path: '/lernen/x' }), false, 'macht die alte Swift-Regel schon selbst');
  assert.equal(webSwipeWanted({ ...o, path: '/profil' }), true);
  assert.equal(webSwipeWanted({ ...o, path: '/erfolge' }), false);
  assert.equal(webSwipeWanted({ ...o, previousPath: null }), false);
});

test('swipeCommits: Weite oder Geschwindigkeit', () => {
  assert.equal(swipeCommits(100, 0.1, 390), false);
  assert.equal(swipeCommits(140, 0.1, 390), true);
  assert.equal(swipeCommits(60, 0.8, 390), true);
  assert.equal(swipeCommits(20, 0.9, 390), false, 'zu kurz für einen Fling');
});

test('normalizePath', () => {
  assert.equal(normalizePath('#/erfolge/shop?x=1'), 'erfolge/shop');
  assert.equal(normalizePath('/'), '');
  assert.equal(normalizePath(''), '');
});

test('Verlauf: push, pop beim Zurückgehen, replace, Wiederholung', () => {
  const h = createNavHistory();
  assert.equal(h.previous(), null);
  h.report('#/');
  h.report('#/erfolge');
  h.report('#/erfolge/shop');
  assert.equal(h.previous(), 'erfolge');
  h.report('#/erfolge/shop'); // rerender
  assert.equal(h.previous(), 'erfolge');
  h.report('#/erfolge'); // Zurück
  assert.equal(h.current(), 'erfolge');
  assert.equal(h.previous(), '');
  h.report('#/fortschritt');
  assert.equal(h.previous(), 'erfolge');
  h.report('#/fortschritt/x', true); // replaceRoute: ersetzt
  assert.equal(h.current(), 'fortschritt/x');
  assert.equal(h.previous(), 'erfolge');
  h.report('#/erfolge');
  h.report('#/');
  assert.equal(h.previous(), null);
});

test('Verlauf: Query ignoriert, Grenze', () => {
  const h = createNavHistory(3);
  h.report('#/fortschritt');
  h.report('#/fortschritt?tab=x'); // gleicher Pfad: kein neuer Eintrag
  assert.equal(h.previous(), null);
  for (const p of ['a', 'b', 'c', 'd']) h.report(`#/${p}`);
  assert.equal(h.current(), 'd');
  assert.equal(h.previous(), 'c');
});

/* ---------- Swift und TS gleich halten ---------- */

const SWIFT = readFileSync(new URL('../ios/App/App/MainViewController.swift', import.meta.url), 'utf8');

function swiftSet(name: string): string[] {
  const m = new RegExp(`static let ${name}: Set<Substring> = \\[([^\\]]*)\\]`).exec(SWIFT);
  assert.ok(m, `${name} fehlt in MainViewController.swift`);
  return [...(m[1] ?? '').matchAll(/"([^"]+)"/g)].map((x) => x[1] ?? '').sort();
}

test('Swift-Listen = TS-Konstanten', () => {
  assert.deepEqual(swiftSet('sessionRoutes'), [...SESSION_ROOTS].sort());
  assert.deepEqual(swiftSet('swipeBackRoots'), [...ANY_DEPTH_ROOTS].sort());
  assert.deepEqual(swiftSet('swipeBackSubpageRoots'), [...SUBPAGE_ROOTS].sort());
  assert.ok(/page\.root == "case" && page\.depth == 1/.test(SWIFT), 'case-Auswahl (Tiefe 1) in Swift');
  assert.ok(/target\.root == "case" && target\.depth > 1/.test(SWIFT), 'case/<id> ist eine Runde in Swift');
  assert.ok(/jsName = "SwipeBack"/.test(SWIFT) && /registerPluginInstance\(SwipeBackPlugin\(\)\)/.test(SWIFT));
});

test('alte Regel: Konstanten sind die der alten Swift-Tabelle', () => {
  assert.deepEqual([...LEGACY_SUBPAGE_ROOTS].sort(), ['lernen', 'profil']);
  assert.deepEqual([...LEGACY_ANY_DEPTH_ROOTS].sort(), ['custom', 'rangliste']);
});
