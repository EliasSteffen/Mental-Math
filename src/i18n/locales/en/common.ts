import type { common as De } from '../de/common.ts';

// Namespace 'common' (English) – muss exakt dieselben Schlüssel wie de/common.ts haben
export const common: Record<keyof typeof De, string> = {
  again: 'Again',
  start: 'Start',
  letsGo: 'Let\'s go',
  check: 'Check',
  dontKnow: 'Don\'t know',
  points: 'Points',
  pointsValue: '{n} pts',
  level: 'Level',
  levelN: 'Level {n}',
  sec: '{n} s',
  secCompact: '{n}s',
  correct: 'Correct',
  wrong: 'Wrong',
  roundDone: 'Round complete!',
  // Share result (ui/share-card.ts)
  shareResult: 'Share result',
  shareRendering: 'Creating …',
  share: 'Share',
  shareSaved: 'Image saved',
  shareFailed: 'Sharing not possible',
  shareRenderFailed: 'Couldn’t create the image',
  answer: 'Answer',
  keypad: 'Number pad',
  keyDelete: 'Delete',
  keySign: 'Toggle sign',
  keyComma: 'Decimal point',
  keyZeros: 'Three zeros',
  // Shell (Ruhiger Fokus)
  mainNav: 'Main navigation',
  tabToday: 'Today',
  tabLearn: 'Learn',
  tabProgress: 'Progress',
  tabProfile: 'Profile',
  // Themes
  themeSystem: 'System',
  themePaper: 'Paper',
  themeNight: 'Night',
  themeOled: 'OLED',
  themeAurora: 'Aurora',
  themeNeon: 'Neon',
  // Sheets, focus mode, controls
  close: 'Close',
  exitFocus: 'Quit',
  decrease: 'Decrease {label}',
  increase: 'Increase {label}',
  // Mastery (dot on chips and rows)
  masteryFull: 'confident',
  masteryHalf: 'in progress',
  masteryEmpty: 'not started',
  // Progress and status
  segmentsAria: '{done} of {total} done',
  resultAria: '{good} correct, {bad} wrong',
  statusToday: '{n} today',
  minOfGoal: '{done} / {goal} min',
  streakOne: '{n}-day streak',
  streakMany: '{n}-day streak',
  xpGain: '{n} XP',
  // App update (platform/web.ts)
  updateReady: 'New version available',
  updateReload: 'Reload',
  // App update from the App Store (features/app-store.ts)
  storeUpdate: 'Update available',
  storeUpdateAction: 'Update',
};
