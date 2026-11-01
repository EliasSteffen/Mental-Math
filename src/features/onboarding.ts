// Einführung beim ersten Start (DOM-frei): wer sie sieht, die Schritte und die Steuerung per Taste bzw. Wisch.
// Den Dialog baut ui/onboarding.ts.
import type { IconName } from '../ui/charts.ts';
import type { TabId } from '../ui/shell.ts';

export type OnboardingStepId = 'welcome' | 'today' | 'learn' | 'progress' | 'profile';

export interface OnboardingStep {
  id: OnboardingStepId;
  icon: IconName;
  titleKey: `onboarding.${string}`;
  textKey: `onboarding.${string}`;
  /** Zugehöriger Tab (null = Begrüßung) */
  tab: TabId | null;
}

/** Reihenfolge wie die Tab-Leiste; Icons wie dort (shell/index.html). */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'welcome', icon: 'sparkles', titleKey: 'onboarding.welcomeTitle', textKey: 'onboarding.welcomeText', tab: null },
  { id: 'today', icon: 'sun', titleKey: 'onboarding.todayTitle', textKey: 'onboarding.todayText', tab: 'today' },
  { id: 'learn', icon: 'book', titleKey: 'onboarding.learnTitle', textKey: 'onboarding.learnText', tab: 'learn' },
  { id: 'progress', icon: 'bars', titleKey: 'onboarding.progressTitle', textKey: 'onboarding.progressText', tab: 'progress' },
  { id: 'profile', icon: 'person', titleKey: 'onboarding.profileTitle', textKey: 'onboarding.profileText', tab: 'profile' },
];

export interface OnboardingInput {
  onboardingDone: boolean;
  lastSeenVersion: string;
  /** Anzahl gespeicherter Versuche */
  attempts: number;
}

/**
 * Nur bei einer Neuinstallation: noch nie gesehen, keine Trainingsdaten und noch keine Version gemerkt.
 * Bestehende Nutzer (lastSeenVersion gesetzt oder Versuche vorhanden) sehen sie nie von selbst.
 * Vor maybeShowWhatsNew() auswerten – das setzt lastSeenVersion bei Neuinstallationen.
 */
export function shouldShowOnboarding(o: OnboardingInput): boolean {
  return !o.onboardingDone && o.lastSeenVersion === '' && o.attempts === 0;
}

/** Schritt nach Pfeiltaste (Leserichtung links → rechts); null = Taste gehört nicht dazu bzw. Rand erreicht. */
export function stepForKey(key: string, index: number, count: number): number | null {
  const next = key === 'ArrowRight' ? index + 1 : key === 'ArrowLeft' ? index - 1 : null;
  return next !== null && next >= 0 && next < count ? next : null;
}

/** Mindeststrecke (px) für einen Wisch. */
export const SWIPE_MIN_PX = 48;

/** Waagerechter Wisch: +1 = weiter (nach links gewischt), -1 = zurück, 0 = kein Wisch (zu kurz oder eher senkrecht). */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
