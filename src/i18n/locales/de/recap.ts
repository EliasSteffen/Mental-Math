// Namespace 'recap' (Deutsch): Rundenbilanz auf dem Ergebnis (v9 A)
export const recap = {
  perfect: 'Perfekt – {n} von {n}',
  faster: '{time} schneller als letztes Mal',
  slower: '{time} langsamer als letztes Mal',
  newBest: 'Neue Bestzeit',
  newBestPrev: 'Ø {time} pro Aufgabe – vorher {prev}',
  newBestFirst: 'Ø {time} pro Aufgabe – schlag sie in der nächsten Runde',
  firstBest: 'Bestzeit gesetzt',
  skill: 'Skill · {sub}',
  skillChange: '{before} → {after}',
  skillAfter: '{after}',
  level: 'Level {level}',
  xpGained: '+{n} XP',
  levelUp: 'Level {level} erreicht',
  levelProgress: '{into} / {needed} XP',
} as const;
