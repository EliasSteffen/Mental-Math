// Layout-Stufen und Tabs stehen an mehreren Stellen (TS, CSS, HTML) – hier wird geprüft, dass sie zusammenpassen.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isTablet, isWide, onLayoutChange } from '../src/ui/viewport.ts';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/data/schema.ts';
import { DEVICE_LOCAL_SETTINGS } from '../src/data/sync-schema.ts';

const read = (p: string): string => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const cssFiles = (): string[] => [
  ...readdirSync(fileURLToPath(new URL('../public/css/', import.meta.url))).filter((f) => f.endsWith('.css')).map((f) => `../public/css/${f}`),
  ...readdirSync(fileURLToPath(new URL('../public/css/views/', import.meta.url))).map((f) => `../public/css/views/${f}`),
];

type Listener = () => void;
interface FakeList { matches: boolean; addEventListener: (t: string, cb: Listener) => void; removeEventListener: (t: string, cb: Listener) => void }

/** matchMedia-Attrappe: `width` entscheidet die min-width-Abfragen, `fire` löst alle Hörer aus. */
function fakeMatchMedia(width: number): { fire: () => void } {
  const listeners = new Set<Listener>();
  (globalThis as { matchMedia?: unknown }).matchMedia = (q: string): FakeList => ({
    matches: width >= Number(/min-width: (\d+)px/.exec(q)?.[1]),
    addEventListener: (_t, cb) => { listeners.add(cb); },
    removeEventListener: (_t, cb) => { listeners.delete(cb); },
  });
  return { fire: () => { for (const cb of listeners) cb(); } };
}

afterEach(() => { delete (globalThis as { matchMedia?: unknown }).matchMedia; });

test('viewport: Telefon, iPad hochkant, iPad quer', () => {
  fakeMatchMedia(390);
  assert.deepEqual([isTablet(), isWide()], [false, false]);
  fakeMatchMedia(744); // iPad mini hochkant
  assert.deepEqual([isTablet(), isWide()], [true, false]);
  fakeMatchMedia(1180);
  assert.deepEqual([isTablet(), isWide()], [true, true]);
});

test('viewport: ohne matchMedia gilt das Telefon-Layout, Abmelden wirkt', () => {
  assert.deepEqual([isTablet(), isWide()], [false, false]);
  assert.doesNotThrow(() => onLayoutChange(() => undefined)());

  const { fire } = fakeMatchMedia(820);
  let calls = 0;
  const off = onLayoutChange(() => { calls += 1; });
  fire();
  assert.ok(calls > 0);
  const seen = calls;
  off();
  fire();
  assert.equal(calls, seen);
});

test('viewport.ts und CSS nutzen dieselben Layout-Stufen', () => {
  const widths = [...read('../src/ui/viewport.ts').matchAll(/min-width: (\d+)px/g)].map((m) => Number(m[1]));
  assert.deepEqual(widths, [720, 1024]);
  const layout = read('../public/css/layout.css');
  for (const w of widths) assert.ok(layout.includes(`@media (min-width: ${w}px)`), `layout.css ohne Stufe ${w}`);
  // Telefon-Layout endet direkt unter der Tablet-Stufe; alte Grenzen dürfen nicht übrig bleiben
  for (const f of cssFiles()) assert.doesNotMatch(read(f), /(min|max)-width:\s*76[78]px/, f);
});

test('Tabs: index.html, Spaltenzahl und shell.ts passen zusammen', () => {
  const shell = read('../src/ui/shell.ts');
  const hrefBlock = /TAB_HREF[^=]*=\s*\{([^}]*)\}/.exec(shell)?.[1] ?? '';
  const hrefs = Object.fromEntries([...hrefBlock.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(Object.keys(hrefs), ['today', 'learn', 'compete', 'progress', 'profile']);

  const html = read('../public/index.html');
  const links = [...html.matchAll(/<a class="tab press" href="([^"]+)" data-tab="(\w+)"/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(Object.fromEntries(links), hrefs);
  assert.match(read('../public/css/layout.css'), new RegExp(`grid-template-columns:repeat\\(${links.length}, minmax\\(0, 1fr\\)\\); gap:4px`));
});

test('Tastenfeld-Seite: Standard rechts, Unbekanntes fällt zurück, bleibt auf dem Gerät, CSS kennt die Werte', () => {
  assert.equal(DEFAULT_SETTINGS.keypadSide, 'right');
  assert.equal(normalizeSettings({}).keypadSide, 'right');
  assert.equal(normalizeSettings({ keypadSide: 'links' }).keypadSide, 'right');
  for (const side of ['left', 'center', 'right'] as const) assert.equal(normalizeSettings({ keypadSide: side }).keypadSide, side);
  assert.ok(DEVICE_LOCAL_SETTINGS.includes('keypadSide'));
  const layout = read('../public/css/layout.css');
  for (const side of ['left', 'center']) assert.ok(layout.includes(`[data-keypad-side="${side}"]`), side);
});

test('iOS: iPad freigeschaltet, iPhone bleibt hochkant', () => {
  assert.equal([...read('../ios/App/App.xcodeproj/project.pbxproj').matchAll(/TARGETED_DEVICE_FAMILY = "1,2";/g)].length, 2);
  const plist = read('../ios/App/App/Info.plist');
  const iphone = /<key>UISupportedInterfaceOrientations<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? '';
  const ipad = /<key>UISupportedInterfaceOrientations~ipad<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(plist)?.[1] ?? '';
  assert.equal([...iphone.matchAll(/<string>/g)].length, 1);
  // Ohne alle vier Ausrichtungen lehnt App Store Connect eine iPad-App mit Multitasking ab
  assert.equal([...ipad.matchAll(/<string>/g)].length, 4);
});
