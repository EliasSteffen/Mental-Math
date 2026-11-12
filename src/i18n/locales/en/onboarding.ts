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
  achievementsTitle: 'Achievements',
  achievementsText: 'Quests, league, badges, trick cards and the shop – plus your statistics with weak spots and due reviews.',
  competeTitle: 'Compete',
  competeText: 'Take on others in the daily challenge, with leaderboards and groups.',
  profileTitle: 'Profile',
  profileText: 'Tap your league emblem at the top right (on iPad: “Profile” at the bottom of the sidebar): reminders, appearance and – if you like – an account with a passkey to sync.',
  // Einstufungstest als letzter Schritt
  placementTitle: 'Where do you stand?',
  placementText: 'A short placement test – up to 10 tasks, about 2 minutes – sets the difficulty for you. You can also take it later under Profile (emblem at the top right) → Training.',
  placementStart: 'Start test',
  later: 'Later',
};
