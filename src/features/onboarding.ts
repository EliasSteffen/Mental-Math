// Einführung beim ersten Start (DOM-frei): wer sie sieht, die Schritte und die Steuerung per Taste bzw. Wisch.
// Den Dialog baut ui/onboarding.ts.
import type { IconName } from '../ui/charts.ts';
import type { TabId } from '../ui/shell.ts';

export type OnboardingStepId = 'welcome' | 'today' | 'learn' | 'progress' | 'profile' | 'placement';

export interface OnboardingStep {
  id: OnboardingStepId;
  icon: IconName;
  titleKey: `onboarding.${string}`;
  textKey: `onboarding.${string}`;
  /** Zugehöriger Tab (null = Begrüßung) */
  tab: TabId | null;
}

/** Reihenfolge wie die Tab-Leiste; Icons wie dort (shell/index.html). Zum Schluss das Angebot des Einstufungstests. */
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: 'welcome', icon: 'sparkles', titleKey: 'onboarding.welcomeTitle', textKey: 'onboarding.welcomeText', tab: null },
  { id: 'today', icon: 'sun', titleKey: 'onboarding.todayTitle', textKey: 'onboarding.todayText', tab: 'today' },
  { id: 'learn', icon: 'book', titleKey: 'onboarding.learnTitle', textKey: 'onboarding.learnText', tab: 'learn' },
  { id: 'progress', icon: 'bars', titleKey: 'onboarding.progressTitle', textKey: 'onboarding.progressText', tab: 'achievements' },
  { id: 'profile', icon: 'person', titleKey: 'onboarding.profileTitle', textKey: 'onboarding.profileText', tab: null },
  { id: 'placement', icon: 'target', titleKey: 'onboarding.placementTitle', textKey: 'onboarding.placementText', tab: null },
];

export interface OnboardingInput {
  /** Gesetzt, sobald der Nutzer im Dialog gewählt bzw. die Einführung beendet/übersprungen hat */
  onboardingDone: boolean;
  /** Anzahl gespeicherter Versuche */
  attempts: number;
}

/**
 * Solange der Nutzer nicht gewählt hat (onboardingDone) und keine Trainingsdaten da sind. Schließt er die App bei
 * offenem Dialog, erscheint er beim nächsten Start wieder. „Was ist neu?“ (lastSeenVersion) spielt keine Rolle.
 */
export function shouldShowOnboarding(o: OnboardingInput): boolean {
  return !o.onboardingDone && o.attempts === 0;
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
