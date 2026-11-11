// Feedback-Mail (DOM-frei): mailto:-Link mit Betreff und vorausgefülltem Text. Der Text enthält nur App-Version, Build,
// Plattform, Sprache und Gerätetyp – keine Trainings- oder Kontodaten.
import { contactAddress } from './contact.ts';

export type FeedbackKind = 'feedback' | 'bug';

export type DeviceKind = 'phone' | 'tablet' | 'desktop';

export interface FeedbackInfo {
  version: string;
  build: string;
  platform: 'Web' | 'iOS';
  lang: string;
  device: DeviceKind;
}

/** Betreff je Art (Deutsch, wie die Mail-Ablage der Website) */
const SUBJECT: Record<FeedbackKind, string> = {
  feedback: 'Mental Math Feedback',
  bug: 'Mental Math Fehler',
};

/** Gerätetyp nach Viewport-Breite; dieselben Grenzen wie ui/viewport.ts (720 px, 1024 px). */
export function deviceKind(width: number): DeviceKind {
  if (width >= 1024) return 'desktop';
  if (width >= 720) return 'tablet';
  return 'phone';
}

/** Vorausgefüllter Text: nur die technischen Angaben, zeilenweise. */
export function feedbackBody(info: FeedbackInfo): string {
  return [
    `Version: ${info.version} (${info.build})`,
    `Plattform: ${info.platform}`,
    `Sprache: ${info.lang}`,
    `Gerät: ${info.device}`,
  ].join('\n');
}

/** mailto:-Adresse mit Betreff und Text; Leerzeichen als %20 und Zeilenumbrüche als %0A (encodeURIComponent). */
export function feedbackMailto(kind: FeedbackKind, info: FeedbackInfo, address: string = contactAddress()): string {
  const query = `subject=${encodeURIComponent(SUBJECT[kind])}&body=${encodeURIComponent(feedbackBody(info))}`;
  return `mailto:${address}?${query}`;
}
