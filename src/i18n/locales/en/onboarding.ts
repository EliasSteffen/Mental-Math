import type { onboarding as De } from '../de/onboarding.ts';

// Namespace 'onboarding' (English) – muss exakt dieselben Schlüssel wie de/onboarding.ts haben
export const onboarding: Record<keyof typeof De, string> = {
  label: 'Introduction',
  stepOf: 'Step {n} of {total}',
  skip: 'Skip',
  next: 'Next',
  back: 'Back',
  done: 'Let’s go',
  createAccount: 'Create account',
  openAccount: 'Open account',
  replay: 'Show introduction',
  welcomeTitle: 'Welcome to Mental Math',
  welcomeText: 'Practice mental math in short rounds – a few minutes a day is enough. Everything works offline, no account needed.',
  todayTitle: 'Today',
  todayText: 'Start the daily challenge and your training here. After your first rounds, the recommendation adapts to you.',
  learnTitle: 'Learn',
  learnText: 'Look up methods and mental math tricks – with the approach and common mistakes.',
  progressTitle: 'Progress',
  progressText: 'Your stats, your weak spots and due reviews at a glance.',
  profileTitle: 'Profile',
  profileText: 'Reminders, appearance and – if you like – an account with a passkey to sync between your devices.',
};
