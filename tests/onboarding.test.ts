import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ONBOARDING_STEPS, SWIPE_MIN_PX, shouldShowOnboarding, stepForKey, swipeStep } from '../src/features/onboarding.ts';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/data/schema.ts';
import { DEVICE_LOCAL_SETTINGS, stripDeviceLocal } from '../src/data/sync-schema.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';

const fresh = { onboardingDone: false, lastSeenVersion: '', attempts: 0 };

test('shouldShowOnboarding: nur bei Neuinstallation', () => {
  assert.equal(shouldShowOnboarding(fresh), true);
  assert.equal(shouldShowOnboarding({ ...fresh, onboardingDone: true }), false, 'schon gesehen/übersprungen');
  assert.equal(shouldShowOnboarding({ ...fresh, lastSeenVersion: '1.14.0' }), false, 'Bestandsnutzer (Update)');
  assert.equal(shouldShowOnboarding({ ...fresh, attempts: 1 }), false, 'Trainingsdaten vorhanden');
  // Defaults einer leeren Installation ergeben „zeigen“
  assert.equal(shouldShowOnboarding({
    onboardingDone: DEFAULT_SETTINGS.onboardingDone, lastSeenVersion: DEFAULT_SETTINGS.lastSeenVersion, attempts: 0,
  }), true);
});

test('Schritte: Begrüßung, dann die vier Tabs in Leisten-Reihenfolge', () => {
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.id), ['welcome', 'today', 'learn', 'progress', 'profile']);
  assert.deepEqual(ONBOARDING_STEPS.map((s) => s.tab), [null, 'today', 'learn', 'progress', 'profile']);
  assert.equal(new Set(ONBOARDING_STEPS.map((s) => s.icon)).size, ONBOARDING_STEPS.length, 'Icons verschieden');
});

test('Schritte: Texte in de und en vorhanden', () => {
  const dicts = { de, en } as unknown as Record<'de' | 'en', Record<string, Record<string, string>>>;
  for (const lang of ['de', 'en'] as const) {
    for (const s of ONBOARDING_STEPS) {
      for (const key of [s.titleKey, s.textKey]) {
        const [ns = '', k = ''] = key.split('.');
        assert.ok(dicts[lang][ns]?.[k]?.trim(), `${lang}.${key}`);
      }
    }
  }
});

test('stepForKey: Pfeiltasten blättern, an den Rändern und bei anderen Tasten nichts', () => {
  const n = ONBOARDING_STEPS.length;
  assert.equal(stepForKey('ArrowRight', 0, n), 1);
  assert.equal(stepForKey('ArrowLeft', 2, n), 1);
  assert.equal(stepForKey('ArrowLeft', 0, n), null);
  assert.equal(stepForKey('ArrowRight', n - 1, n), null);
  assert.equal(stepForKey('Enter', 1, n), null);
  assert.equal(stepForKey('Escape', 1, n), null);
});

test('swipeStep: waagerecht ab Mindeststrecke, eher senkrecht zählt nicht', () => {
  assert.equal(swipeStep(-SWIPE_MIN_PX, 0), 1, 'nach links = weiter');
  assert.equal(swipeStep(SWIPE_MIN_PX + 10, 5), -1, 'nach rechts = zurück');
  assert.equal(swipeStep(-(SWIPE_MIN_PX - 1), 0), 0, 'zu kurz');
  assert.equal(swipeStep(-80, 70), 0, 'eher senkrecht (Scrollen)');
  assert.equal(swipeStep(0, 0), 0);
});

test('onboardingDone: geräte-lokal, Default false, nur echtes true zählt', () => {
  assert.ok(DEVICE_LOCAL_SETTINGS.includes('onboardingDone'));
  assert.deepEqual(stripDeviceLocal({ onboardingDone: true, sessionLength: 10 }), { sessionLength: 10 });
  assert.equal(DEFAULT_SETTINGS.onboardingDone, false);
  assert.equal(normalizeSettings({}).onboardingDone, false);
  assert.equal(normalizeSettings({ onboardingDone: true }).onboardingDone, true);
  assert.equal(normalizeSettings({ onboardingDone: 'yes' }).onboardingDone, false);
});
