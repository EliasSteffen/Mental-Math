// Namespace 'chain' (Deutsch) – Schlüssel ohne Präfix, Zugriff über t('chain.key')
export const chain = {
  title: 'Kettenrechnen',
  intro: 'Merke dir die Zahl und rechne jeden Schritt im Kopf mit. Am Ende nennst du das Ergebnis.',
  tempoPerStep: 'Tempo pro Schritt',
  tempo: 'Tempo',
  tempo1: '0,8 s',
  tempo2: '1,2 s',
  tempo3: '1,8 s',
  best: 'Bestwert Level {level}: {n} in Folge',
  noBest: 'Noch kein Bestwert für Level {level}',
  resultAria: 'Ergebnis',
  resultQ: 'Ergebnis?',
  wrongFinal: 'Leider falsch',
  yourAnswer: 'Deine Antwort: {n}',
  streakLine: 'Serie {streak} · Bestwert {best}',
  newRecordSuffix: ' – neuer Rekord!',
  settings: 'Einstellungen',
} as const;
