// Namespace 'custom' (Deutsch) – Schlüssel ohne Präfix, Zugriff über t('custom.key')
export const custom = {
  title: 'Eigenes Training',
  intro: 'Wähle selbst, welche Zahlenbereiche du üben willst.',
  aFrom: 'a von',
  aTo: 'a bis',
  bFrom: 'b von',
  bTo: 'b bis',
  nFrom: 'n von',
  nTo: 'n bis',
  roundLength: 'Rundenlänge',
  tasksN: '{n} Aufgaben',
  kind: 'Art',
  mul: 'Einmaleins',
  square: 'Quadrate',
  rangeError: 'Bitte ganze Zahlen von 1 bis 999 eingeben, „von“ darf nicht größer als „bis“ sein.',
  start: 'Training starten',
} as const;
