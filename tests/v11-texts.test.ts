import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';
import { ONBOARDING_STEPS } from '../src/features/onboarding.ts';
import { tabOf, type RouteName, type TabId } from '../src/core/nav.ts';
import {
  NAV_HINT_KEY, isExistingUser, markNavHintSeen, navHintTarget, readNavHintSeen, shouldShowNavHint, type NavHintInput,
} from '../src/core/nav-hint.ts';

type Dict = Record<string, Record<string, string>>;
const dicts: Record<'de' | 'en', Dict> = { de: de as unknown as Dict, en: en as unknown as Dict };
const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

/** Alle UI-Texte außer der Release-Historie (Namensraum „release“ ist nur Beschriftung, die Notes liegen in releases.ts). */
function uiTexts(): Array<{ where: string; text: string }> {
  const out: Array<{ where: string; text: string }> = [];
  for (const lang of ['de', 'en'] as const) {
    for (const [ns, entries] of Object.entries(dicts[lang])) {
      for (const [key, text] of Object.entries(entries)) if (typeof text === 'string') out.push({ where: `${lang}.${ns}.${key}`, text });
    }
  }
  out.push({ where: 'scripts/pages.ts', text: read('../scripts/pages.ts') });
  out.push({ where: 'README.md', text: read('../README.md') });
  return out;
}

// Wege, die es seit v11 nicht mehr gibt: der Tab „Fortschritt“/„Progress“ und das Profil als Tab
const GONE: RegExp[] = [
  /Fortschritt\s*(→|->)/, /Progress\s*(→|->)/,
  /(unter|im|den|Tab)\s+„?Fortschritt“?(-Tab| Tab|\b)(?!\s+(zum|zur|zu))/i,
  /(under|in the|on the|tab)\s+“?Progress”?\s+(tab|screen)/i,
  /Tab „?Profil/, /Profil-Tab/, /Profile tab/i, /Tab “?Profile/,
  /Analyse-Seite/,
];

test('Texte: kein Hinweis auf den früheren Tab „Fortschritt“ oder das Profil als Tab', () => {
  for (const { where, text } of uiTexts()) {
    for (const re of GONE) {
      const m = text.match(re);
      // „Fortschritt zum nächsten Level“ u. Ä. sind Wortverwendungen, keine Wegangaben
      assert.equal(m, null, `${where}: ${m?.[0]}`);
    }
  }
});

test('Texte: Statistik heißt Statistik, Erfolge heißt Erfolge', () => {
  assert.equal(de.analyse.title, 'Statistik');
  assert.equal(en.analyse.title, 'Statistics');
  assert.equal(de.common.tabAchievements, 'Erfolge');
  assert.equal(en.common.tabAchievements, 'Achievements');
  assert.match(de.rewards.introToast, /Erfolge/);
  assert.doesNotMatch(de.rewards.introToast, /Fortschritt/);
  assert.doesNotMatch(en.rewards.introToast, /Progress/);
});

test('Texte: ungenutzte Erfolge-/Tab-Schlüssel sind entfernt', () => {
  for (const lang of ['de', 'en'] as const) {
    for (const k of ['rowTitle', 'rowSub', 'tabLeague', 'tabCards']) assert.equal(dicts[lang]['rewards']?.[k], undefined, `${lang}.rewards.${k}`);
    for (const k of ['tabProgress', 'tabProfile']) assert.equal(dicts[lang]['common']?.[k], undefined, `${lang}.common.${k}`);
  }
});

test('Einführung: Schritte passen zu den Tabs der Leiste (Reihenfolge, nichts fehlt)', () => {
  const routes: RouteName[] = ['today', 'learn', 'achievements', 'compete', 'profile'];
  const tabs = routes.map((r) => tabOf(r)).filter((x): x is TabId => x !== null);
  assert.deepEqual(tabs, ['today', 'learn', 'achievements', 'compete']);
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.id), ['welcome', 'today', 'learn', 'achievements', 'compete', 'profile', 'placement']);
  assert.deepEqual(ONBOARDING_STEPS.filter((s) => s.tab !== null).map((s) => s.tab), tabs);
  const profile = ONBOARDING_STEPS.find((s) => s.id === 'profile');
  assert.equal(profile?.tab, null, 'Profil ist kein Tab');
  for (const lang of ['de', 'en'] as const) {
    assert.match(dicts[lang]['onboarding']?.['profileText'] ?? '', lang === 'de' ? /oben rechts/ : /top right/);
  }
});

const base: NavHintInput = {
  seen: false, onboardingDone: true, attempts: 12, focus: false, dialogOpen: false, tourRunning: false, targetVisible: true,
};

test('Nav-Hinweis: nur Bestandsnutzer, nur einmal', () => {
  assert.equal(shouldShowNavHint(base), true);
  assert.equal(shouldShowNavHint({ ...base, onboardingDone: false, attempts: 3 }), true, 'Versuche genügen');
  assert.equal(shouldShowNavHint({ ...base, onboardingDone: true, attempts: 0 }), true, 'Einführung erledigt genügt');
  assert.equal(shouldShowNavHint({ ...base, onboardingDone: false, attempts: 0 }), false, 'Neuling');
  assert.equal(shouldShowNavHint({ ...base, seen: true }), false, 'schon gesehen');
  assert.equal(isExistingUser({ onboardingDone: false, attempts: 0 }), false);
});

test('Nav-Hinweis: nie im Fokus-Modus, hinter Dialogen, im Rundgang oder ohne Ziel', () => {
  assert.equal(shouldShowNavHint({ ...base, focus: true }), false);
  assert.equal(shouldShowNavHint({ ...base, dialogOpen: true }), false);
  assert.equal(shouldShowNavHint({ ...base, tourRunning: true }), false);
  assert.equal(shouldShowNavHint({ ...base, targetVisible: false }), false);
});

test('Nav-Hinweis: Ziel je Layout, Merker mit try/catch', () => {
  assert.equal(navHintTarget(false), '.account-button');
  assert.equal(navHintTarget(true), '.tabbar-profile');
  assert.equal(NAV_HINT_KEY, 'mm.navHint.v11');
  const mem = new Map<string, string>();
  const ok = { getItem: (k: string): string | null => mem.get(k) ?? null, setItem: (k: string, v: string): void => { mem.set(k, v); } };
  assert.equal(readNavHintSeen(ok), false);
  markNavHintSeen(ok);
  assert.equal(readNavHintSeen(ok), true);
  assert.equal(mem.get(NAV_HINT_KEY), '1');
  const broken = { getItem: (): never => { throw new Error('blocked'); }, setItem: (): never => { throw new Error('blocked'); } };
  assert.equal(readNavHintSeen(broken), false);
  assert.doesNotThrow(() => markNavHintSeen(broken));
  assert.equal(readNavHintSeen(null), false);
});

test('Nav-Hinweis: Texte de und en, mit „OK“', () => {
  for (const lang of ['de', 'en'] as const) {
    for (const k of ['navHintText', 'navHintTextSide', 'navHintOk']) assert.ok(dicts[lang]['common']?.[k]?.trim(), `${lang}.common.${k}`);
  }
  assert.match(de.common.navHintText, /Liga-Emblem oben rechts/);
  assert.match(en.common.navHintText, /league emblem at the top right/);
});
