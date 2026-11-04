// Hinweise zu Live-Updates (core/live-update-notice.ts): Fortschritt, „bereit“ mit „Jetzt aktualisieren“, nie während
// einer Runde, Anwenden höchstens einmal, Bestätigung beim ersten Start nach dem Wechsel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotice, noticeView, progressPercent, updatedTo, type NoticeDeps, type NoticeView } from '../src/core/live-update-notice.ts';
import { emptyState, type LiveState } from '../src/core/live-update.ts';
import { isRoundRunning } from '../src/features/pwa-update.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';

test('progressPercent: ganze Prozent, begrenzt, ohne Dateien 0', () => {
  assert.equal(progressPercent(0, 183), 0);
  assert.equal(progressPercent(1, 183), 0);
  assert.equal(progressPercent(92, 183), 50);
  assert.equal(progressPercent(183, 183), 100);
  assert.equal(progressPercent(200, 183), 100);
  assert.equal(progressPercent(5, 0), 0);
  assert.equal(progressPercent(Number.NaN, 10), 0);
});

test('noticeView: nichts im Leerlauf und während einer Runde', () => {
  const loading = { kind: 'loading' as const, version: '1.16.2', done: 40, total: 80 };
  assert.deepEqual(noticeView({ kind: 'idle' }, false), { kind: 'none' });
  assert.deepEqual(noticeView(loading, false), { kind: 'progress', version: '1.16.2', done: 40, total: 80, percent: 50 });
  assert.deepEqual(noticeView(loading, true), { kind: 'none' });
  assert.deepEqual(noticeView({ kind: 'ready', version: '1.16.2' }, false), { kind: 'ready', version: '1.16.2' });
  assert.deepEqual(noticeView({ kind: 'ready', version: '1.16.2' }, true), { kind: 'none' });
  assert.deepEqual(noticeView({ ...loading, done: 99 }, false), { kind: 'progress', version: '1.16.2', done: 80, total: 80, percent: 100 }, 'begrenzt');
});

test('updatedTo: nur im laufenden Probelauf-Bundle', () => {
  const trial = { id: 'aaaaaaaaaaaaaaaa', version: '1.16.2', minNative: '1.15.1', channel: 'beta' as const, createdAt: '2026-11-04T10:00:00.000Z' };
  const s: LiveState = { ...emptyState(), trial };
  assert.equal(updatedTo(s, { id: 'aaaaaaaaaaaaaaaa', version: '1.16.2' }), '1.16.2');
  assert.equal(updatedTo(s, { id: null, version: '1.16.1' }), null, 'Rollback: altes Bundle läuft');
  assert.equal(updatedTo(s, { id: 'bbbbbbbbbbbbbbbb', version: '1.16.1' }), null);
  assert.equal(updatedTo(emptyState(), { id: 'aaaaaaaaaaaaaaaa', version: '1.16.2' }), null, 'normaler Start');
});

interface Log { calls: string[]; progress: NoticeView[]; apply: () => void }

function harness(hash = '#/'): { deps: NoticeDeps; log: Log; setHash: (h: string) => void } {
  let current = hash;
  const log: Log = { calls: [], progress: [], apply: () => {} };
  const deps: NoticeDeps = {
    roundRunning: () => isRoundRunning(current),
    showProgress: (v) => { log.calls.push('progress'); log.progress.push(v); },
    hideProgress: () => { log.calls.push('hideProgress'); },
    showReady: (version, onApply) => { log.calls.push(`ready ${version}`); log.apply = onApply; },
    hideReady: () => { log.calls.push('hideReady'); },
    apply: () => { log.calls.push('apply'); },
  };
  return { deps, log, setHash: (h) => { current = h; } };
}

test('Ablauf: laden mit Fortschritt, dann „bereit“, Anwenden einmal', () => {
  const { deps, log } = harness();
  const n = createNotice(deps);
  n.loading('1.16.2', 4);
  n.progress(1, 4);
  n.progress(4, 4);
  n.ready('1.16.2');
  assert.deepEqual(log.calls, ['progress', 'progress', 'progress', 'hideProgress', 'ready 1.16.2']);
  assert.deepEqual(log.progress.map((v) => (v.kind === 'progress' ? v.percent : -1)), [0, 25, 100]);
  log.apply();
  log.apply(); // doppelt getippt
  assert.deepEqual(log.calls.slice(-2), ['hideReady', 'apply']);
  n.routeChanged();
  assert.equal(log.calls.filter((c) => c === 'apply').length, 1);
  assert.equal(log.calls.filter((c) => c.startsWith('ready')).length, 1, 'nach dem Anwenden kein neuer Hinweis');
});

test('Runde: kein Hinweis während einer Runde, danach wieder sichtbar', () => {
  const { deps, log, setHash } = harness('#/train/mult');
  const n = createNotice(deps);
  n.loading('1.16.2', 2);
  n.progress(1, 2);
  n.ready('1.16.2');
  assert.deepEqual(log.calls, [], 'während der Runde still');
  setHash('#/result');
  n.routeChanged();
  assert.deepEqual(log.calls, ['ready 1.16.2']);
  // Neue Runde beginnt: Hinweis weg; Tippen auf einen alten Knopf wendet nicht an
  setHash('#/parallel');
  n.routeChanged();
  log.apply();
  assert.deepEqual(log.calls, ['ready 1.16.2', 'hideReady']);
  setHash('#/');
  n.routeChanged();
  log.apply();
  assert.deepEqual(log.calls.slice(-3), ['ready 1.16.2', 'hideReady', 'apply']);
});

test('Abbruch: Fortschritt verschwindet, nichts ist bereit', () => {
  const { deps, log } = harness();
  const n = createNotice(deps);
  n.loading('1.16.2', 10);
  n.progress(3, 10);
  n.failed();
  n.progress(4, 10); // verspätete Meldung nach dem Abbruch
  assert.deepEqual(log.calls, ['progress', 'progress', 'hideProgress']);
  n.failed(); // ohne Download: nichts
  assert.equal(log.calls.length, 3);
});

test('Texte: Live-Update-Hinweise auf Deutsch und Englisch mit Version', () => {
  for (const dict of [de, en]) {
    const c = (dict as unknown as Record<string, Record<string, string>>).common ?? {};
    for (const k of ['liveUpdateLoading', 'liveUpdateReady', 'liveUpdateDone']) assert.match(c[k] ?? '', /\{version\}/, k);
    for (const k of ['liveUpdateApply', 'liveUpdateWhatsNew']) assert.ok((c[k] ?? '').length > 0, k);
  }
});
