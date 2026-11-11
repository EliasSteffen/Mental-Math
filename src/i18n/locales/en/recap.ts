import type { recap as De } from '../de/recap.ts';

// Namespace 'recap' (English) – muss exakt dieselben Schlüssel wie de/recap.ts haben
export const recap: Record<keyof typeof De, string> = {
  perfect: 'Perfect – {n} of {n}',
  faster: '{time} faster than last time',
  slower: '{time} slower than last time',
  newBest: 'New best time',
  newBestPrev: 'Avg {time} per task – before {prev}',
  newBestFirst: 'Avg {time} – your first best time in this mode',
  skill: 'Skill · {sub}',
  skillChange: '{before} → {after}',
  skillAfter: '{after}',
  level: 'Level {level}',
  xpGained: '+{n} XP',
  levelUp: 'Level {level} reached',
  levelProgress: '{into} / {needed} XP',
};
