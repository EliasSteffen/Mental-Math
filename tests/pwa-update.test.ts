// Update-Ablauf der Seite (features/pwa-update.ts): Hinweis, Aufschub während einer Runde, genau ein Neuladen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROUND_ROUTES, createThrottle, createUpdateFlow, isRoundRunning, shouldShowHint, type UpdateFlowDeps,
} from '../src/features/pwa-update.ts';

test('isRoundRunning: Runden-Routen samt Unterpfad bzw. Query, sonst nicht', () => {
  assert.deepEqual(ROUND_ROUTES, ['train', 'parallel', 'chain', 'custom']);
  for (const h of ['#/train/mult?n=10', '#/train', '#/parallel', '#/chain', '#/custom', '#/custom?k=mul', '#/train/custom?k=mul&a=1-9']) {
    assert.equal(isRoundRunning(h), true, h);
  }
  for (const h of ['', '#', '#/', '#/lernen', '#/profil', '#/fortschritt', '#/lernen/mult.2x1', '#/trainer', '#/chainsaw', '#train']) {
    assert.equal(isRoundRunning(h), false, h);
  }
});

test('shouldShowHint: nur bei wartender Version, kontrollierter Seite und ohne laufende Runde', () => {
  assert.equal(shouldShowHint({ waiting: true, controlled: true, hash: '#/' }), true);
  assert.equal(shouldShowHint({ waiting: true, controlled: true, hash: '#/train/mult' }), false);
  assert.equal(shouldShowHint({ waiting: true, controlled: false, hash: '#/' }), false);
  assert.equal(shouldShowHint({ waiting: false, controlled: true, hash: '#/' }), false);
});

test('createThrottle: höchstens einmal je Intervall, der Start zählt als Prüfung', () => {
  let now = 1000;
  const due = createThrottle(100, () => now);
  assert.equal(due(), false);
  now = 1099;
  assert.equal(due(), false);
  now = 1100;
  assert.equal(due(), true);
  assert.equal(due(), false);
  now = 1250;
  assert.equal(due(), true);
});

interface Harness { deps: UpdateFlowDeps; log: string[]; setHash(h: string): void; click(): void; waiting: { value: boolean } }

function harness(): Harness {
  let hash = '#/';
  let onReload: (() => void) | null = null;
  const log: string[] = [];
  const waiting = { value: true };
  const deps: UpdateFlowDeps = {
    hash: () => hash,
    showHint: (fn) => { onReload = fn; log.push('show'); },
    hideHint: () => { onReload = null; log.push('hide'); },
    activate: () => { log.push('activate'); return waiting.value; },
    reload: () => { log.push('reload'); },
  };
  return {
    deps, log, waiting,
    setHash: (h) => { hash = h; },
    click: () => { assert.ok(onReload, 'kein Hinweis sichtbar'); onReload(); },
  };
}

test('Update: Hinweis → Klick aktiviert die wartende Version → bei controllerchange genau ein Neuladen', () => {
  const h = harness();
  const flow = createUpdateFlow(h.deps, true);
  flow.waiting();
  flow.waiting(); // doppelte Meldung (updatefound + statechange): ein Hinweis
  assert.deepEqual(h.log, ['show']);
  h.click();
  assert.deepEqual(h.log, ['show', 'hide', 'activate']);
  flow.controllerChanged();
  flow.controllerChanged(); // z. B. DevTools „Update on reload“: kein zweites Neuladen
  flow.routeChanged();
  assert.deepEqual(h.log, ['show', 'hide', 'activate', 'reload']);
});

test('Update: wartet keine Version mehr (anderer Tab war schneller), lädt der Klick direkt neu', () => {
  const h = harness();
  const flow = createUpdateFlow(h.deps, true);
  flow.waiting();
  h.waiting.value = false;
  h.click();
  assert.deepEqual(h.log, ['show', 'hide', 'activate', 'reload']);
});

test('Erstinstallation: kein Hinweis, und clients.claim (controllerchange) lädt nicht neu', () => {
  const h = harness();
  const flow = createUpdateFlow(h.deps, false);
  flow.waiting();
  flow.controllerChanged();
  assert.deepEqual(h.log, []);
  // Danach ist die Seite kontrolliert: ein späteres Update wird angeboten
  flow.waiting();
  assert.deepEqual(h.log, ['show']);
});

test('Laufende Runde: Hinweis erst nach dem Routenwechsel; Betreten einer Runde blendet ihn aus', () => {
  const h = harness();
  h.setHash('#/train/mult?n=10');
  const flow = createUpdateFlow(h.deps, true);
  flow.waiting();
  assert.deepEqual(h.log, []);
  h.setHash('#/train/mult?n=10&intro=1');
  flow.routeChanged();
  assert.deepEqual(h.log, []);
  h.setHash('#/');
  flow.routeChanged();
  assert.deepEqual(h.log, ['show']);
  h.setHash('#/chain');
  flow.routeChanged();
  assert.deepEqual(h.log, ['show', 'hide']);
  h.setHash('#/fortschritt');
  flow.routeChanged();
  assert.deepEqual(h.log, ['show', 'hide', 'show']);
});

test('Anderer Tab hat aktualisiert: hier neu laden – während einer Runde erst danach', () => {
  const idle = harness();
  const a = createUpdateFlow(idle.deps, true);
  a.waiting();
  a.controllerChanged();
  assert.deepEqual(idle.log, ['show', 'hide', 'reload']);

  const busy = harness();
  busy.setHash('#/parallel');
  const b = createUpdateFlow(busy.deps, true);
  b.waiting();
  b.controllerChanged();
  assert.deepEqual(busy.log, []);
  busy.setHash('#/parallel?x=1');
  b.routeChanged();
  assert.deepEqual(busy.log, []);
  busy.setHash('#/');
  b.routeChanged();
  b.routeChanged();
  b.waiting(); // nach dem Wechsel kein neuer Hinweis mehr
  assert.deepEqual(busy.log, ['reload']);
});
