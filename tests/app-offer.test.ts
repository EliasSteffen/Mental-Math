import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_OFFER_KEY, APP_OFFER_MAX, APP_OFFER_PAUSE_MS, NO_OFFER_YET, isAppleMobile, parseAppOffer, readAppOffer, shouldOfferApp,
  writeAppOffer, type AppOfferInput,
} from '../src/core/app-offer.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';

const NOW = Date.UTC(2026, 10, 12, 18);
const base: AppOfferInput = {
  state: NO_OFFER_YET, now: NOW, native: false, apple: true, rounds: 3, firstRun: false, tabStart: true,
  dialogOpen: false, tourRunning: false,
};

test('App-Hinweis: Website auf iPhone/iPad nach der ersten Runde, auf einer Tab-Startseite', () => {
  assert.equal(shouldOfferApp(base), true);
  assert.equal(shouldOfferApp({ ...base, native: true }), false, 'schon in der App');
  assert.equal(shouldOfferApp({ ...base, apple: false }), false, 'Android, Desktop');
  assert.equal(shouldOfferApp({ ...base, rounds: 0 }), false, 'noch keine Runde');
  assert.equal(shouldOfferApp({ ...base, firstRun: true }), false, 'erster Start mit Einführung');
});

test('App-Hinweis: nie mitten in etwas', () => {
  assert.equal(shouldOfferApp({ ...base, tabStart: false }), false, 'Runde oder Unterseite');
  assert.equal(shouldOfferApp({ ...base, dialogOpen: true }), false, 'anderer Dialog');
  assert.equal(shouldOfferApp({ ...base, tourRunning: true }), false, 'Rundgang');
});

test('App-Hinweis: höchstens dreimal mit einer Woche Pause, nach dem App Store nie mehr', () => {
  const asked = { shown: 1, lastAt: NOW - APP_OFFER_PAUSE_MS + 60_000, done: false };
  assert.equal(shouldOfferApp({ ...base, state: asked }), false, 'Pause läuft');
  assert.equal(shouldOfferApp({ ...base, state: { ...asked, lastAt: NOW - APP_OFFER_PAUSE_MS } }), true, 'Pause vorbei');
  assert.equal(shouldOfferApp({ ...base, state: { shown: APP_OFFER_MAX, lastAt: 0, done: false } }), false, 'genug gefragt');
  assert.equal(shouldOfferApp({ ...base, state: { shown: 1, lastAt: 0, done: true } }), false, 'zum App Store gegangen');
});

test('App-Hinweis: Merker robust lesen und schreiben', () => {
  assert.deepEqual(parseAppOffer(null), NO_OFFER_YET);
  assert.deepEqual(parseAppOffer('kaputt'), NO_OFFER_YET);
  assert.deepEqual(parseAppOffer('{"shown":-2,"lastAt":"x","done":1}'), NO_OFFER_YET);
  const mem = new Map<string, string>();
  const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  writeAppOffer({ shown: 2, lastAt: 5, done: true }, s);
  assert.ok(mem.has(APP_OFFER_KEY));
  assert.deepEqual(readAppOffer(s), { shown: 2, lastAt: 5, done: true });
  assert.deepEqual(readAppOffer(null), NO_OFFER_YET, 'ohne Speicher');
});

test('App-Hinweis: iPhone und iPad erkennen, auch iPadOS als „Mac“', () => {
  const ua = (userAgent: string, platform = 'iPhone', maxTouchPoints = 5) => isAppleMobile({ userAgent, platform, maxTouchPoints });
  assert.equal(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), true);
  assert.equal(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), true, 'iPad im Desktop-Modus');
  assert.equal(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), false, 'echter Mac');
  assert.equal(ua('Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Linux armv8l', 5), false);
});

test('App-Hinweis: Texte auf Deutsch und Englisch', () => {
  for (const key of ['appOfferTitle', 'appOfferLead', 'appOfferReminders', 'appOfferFeel', 'appOfferSync', 'appOfferLater', 'appOfferOpen'] as const) {
    assert.ok(de.common[key], `de ${key}`);
    assert.ok(en.common[key], `en ${key}`);
  }
});
