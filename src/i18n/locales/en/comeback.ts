// Namespace 'comeback' (English): welcome back, warm-up round, repair streak (v10 C)
export const comeback = {
  welcomeTitle: 'Good to see you again!',
  welcomeText: 'You were away for {n} days. An easy warm-up round earns a +{xp} XP comeback bonus.',
  welcomeGo: 'Warm up',
  repairTitle: 'Get your streak back',
  repairText: 'Your {lost}-day streak ended yesterday. Win it back today: play {rounds} rounds or spend {xp} XP.',
  repairProgress: '{done}/{need} rounds today',
  repairPlay: 'Play a round',
  repairXp: 'Repair with XP',
  repairConfirm: 'Repair your {lost}-day streak for {xp} XP?',
  repairConfirmTitle: 'Repair streak',
  repairConfirmYes: 'Repair',
  repairedToast: 'Streak repaired – {n} in a row',
  repairFailed: 'That did not work.',
  lineWelcome: 'Welcome back · +{xp} XP comeback bonus',
  lineRepaired: 'Streak repaired · {n} in a row',
} as const;
