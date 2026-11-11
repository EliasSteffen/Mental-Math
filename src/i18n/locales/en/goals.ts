import type { goals as De } from '../de/goals.ts';

// Namespace 'goals' (English) – muss exakt dieselben Schlüssel wie de/goals.ts haben
export const goals: Record<keyof typeof De, string> = {
  next: 'Next goal',
  league: '{n} more LP to {name}',
  badge: '{n} more to {name}',
  badgeTier: '{n} more to {name} {tier}',
  card: '{n} more skill to the trick card {name}',
  cardSub: 'Skill {score} of {full}',
  level: '{n} more XP to level {level}',
  goal: '{n} more rounds to today’s goal',
  goalOne: '1 more round to today’s goal',
  lpGain: '+{n} LP',
  lpLoss: '−{n} LP',
  masterLine: '{name} · {rating} LP',
};
