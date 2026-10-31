// Namespace 'home' (Deutsch) – Schlüssel ohne Präfix, Zugriff über t('home.key')
export const home = {
  // Large Title: Begrüßung nach Tageszeit (E11)
  greetMorning: 'Guten Morgen',
  greetDay: 'Guten Tag',
  greetEvening: 'Guten Abend',
  // Hero „Empfohlen für heute“
  recLabel: 'Empfohlen für heute',
  planMethod: 'Kurz die Methode, dann 5 Aufgaben',
  planReview: 'Eine Runde mit Aufgaben, die zuletzt danebengingen',
  planRound: '{n} Aufgaben, alle Kategorien gemischt',
  firstReason: 'Willkommen! Nach den ersten Runden richtet sich die Empfehlung nach dir.',
  slowest: 'Hier verlierst du am meisten Zeit.',
  timeTarget: 'Ziel {n}',
  timeYours: 'Dein Schnitt {n}',
  // Andere Übungen
  otherTitle: 'Andere Übungen',
  dailyChallenge: 'Daily Challenge',
  dailyOpen: 'heute offen',
  allMixed: 'Alle Kategorien gemischt',
  moreModes: 'Weitere Modi',
  moreModesSub: 'Kettenrechnen · Parallel · Schätzen · Eigenes',
  // Sheet „Weitere Modi“ (E7)
  chainTitle: 'Kettenrechnen',
  chainSub: 'Zahlen merken & verrechnen',
  parallelTitle: 'Paralleles Kettenrechnen',
  parallelSub: 'Mehrere Ketten gleichzeitig im Kopf',
  estimateTitle: 'Schätzen ±5 %',
  estimateSub: 'Näherung genügt',
  customTitle: 'Eigenes Training',
  customSub: 'Eigene Zahlenbereiche',
  // Kategorien und CTA (E10)
  categories: 'Kategorien',
  ctaPractice: 'Jetzt üben',
  ctaMinutes: 'ca. {n} min',
} as const;
