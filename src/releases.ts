// Versionshistorie (neueste zuerst). Quelle für „Was ist neu?“ und CHANGELOG.md.
import type { Release } from './types.ts';

const DATE = '2026-10-30';

export const RELEASES: Release[] = [
  {
    version: '1.11.0', date: '2026-10-31',
    title: { de: 'Exhibits, 1×1, Englisch & Wiederherstellung', en: 'Exhibits, times tables, English & recovery' },
    highlights: [
      { de: 'Neu: Exhibits – Diagramme und Tabellen lesen und daraus rechnen wie im Case (Anteile, Wachstum, gewichteter Durchschnitt, relativ vs. absolut).', en: 'New: exhibits – read charts and tables and calculate from them like in a case (shares, growth, weighted average, relative vs. absolute).' },
      { de: 'Neu: Kleines 1×1 als schneller Drill, getrennt von den gemischten Runden.', en: 'New: times tables as a quick drill, kept separate from mixed rounds.' },
      { de: 'Lernbereich, Lösungswege und KI-Erklärungen gibt es jetzt auch auf Englisch.', en: 'The learning area, worked solutions and AI explanations are now available in English too.' },
      { de: 'Wiederherstellungscode: Wer alle Passkeys verliert, kommt damit wieder in sein Konto.', en: 'Recovery code: if you lose all your passkeys, it gets you back into your account.' },
      { de: 'KI-Erklärungen sind jetzt geräteübergreifend gegen Missbrauch begrenzt.', en: 'AI explanations now have a global limit against abuse.' },
    ],
  },
  {
    version: '1.10.0', date: '2026-10-31',
    title: { de: 'Offline & Cloud-Sync', en: 'Offline & cloud sync' },
    highlights: [
      { de: 'Deine Daten liegen jetzt in IndexedDB: schneller, mehr Platz und auch offline verfügbar.', en: 'Your data now lives in IndexedDB: faster, more space and available offline.' },
      { de: 'Automatische Synchronisierung aller Trainingsdaten zwischen deinen Geräten, sobald du angemeldet bist.', en: 'Automatic sync of all your training data between your devices once you are signed in.' },
      { de: 'Konflikte werden zusammengeführt statt überschrieben.', en: 'Conflicts are merged instead of overwritten.' },
      { de: '„Alle Daten löschen“ wirkt im angemeldeten Zustand auf allen Geräten.', en: '"Delete all data" applies to all your devices when signed in.' },
      { de: 'Status und „Jetzt synchronisieren“ findest du in den Einstellungen.', en: 'Find the status and "Sync now" in the settings.' },
    ],
  },
  {
    version: '1.9.0', date: '2026-10-31',
    title: { de: 'Konto mit Passkey', en: 'Passkey account' },
    highlights: [
      { de: 'Neu: Konto ohne E-Mail und Passwort – anmelden per Passkey (Face ID, Touch ID oder Gerätesperre).', en: 'New: account without email or password – sign in with a passkey (Face ID, Touch ID or device lock).' },
      { de: 'Mehrere Passkeys pro Konto: füge Geräte hinzu, benenne sie um oder entferne sie wieder.', en: 'Multiple passkeys per account: add devices, rename them or remove them again.' },
      { de: 'Wichtig: Es gibt keine Wiederherstellung – wer alle Passkeys verliert, verliert das Konto.', en: 'Important: there is no recovery – if you lose all your passkeys, you lose the account.' },
      { de: 'Grundlage für die spätere Cloud-Synchronisierung deines Trainings.', en: 'Foundation for syncing your training to the cloud later.' },
    ],
  },
  {
    version: '1.8.0', date: DATE,
    title: { de: 'Versionen, Einstellungen & Feinschliff', en: 'Versions, settings & polish' },
    highlights: [
      { de: 'Neu: „Was ist neu?“ – nach einem Update zeigt die App automatisch die Neuerungen.', en: 'New: "What\'s new?" – after an update the app shows the changes automatically.' },
      { de: 'Einstellungen in übersichtlichen Tabs: Allgemein, Gameplay, Daten & Account, Über.', en: 'Settings in clear tabs: General, Gameplay, Data & Account, About.' },
      { de: 'Daten importieren: Sichere dein Training als Datei und spiele es auf einem anderen Gerät wieder ein.', en: 'Import data: save your training to a file and restore it on another device.' },
      { de: 'Hinweise (Toasts), Dialoge und Ladeplatzhalter machen die App flüssiger und klarer.', en: 'Toasts, dialogs and loading placeholders make the app smoother and clearer.' },
      { de: 'Sprache wählbar: Deutsch oder Englisch.', en: 'Choose your language: German or English.' },
    ],
  },
  {
    version: '1.7.0', date: DATE,
    title: { de: 'Schwebende Buttons, Auto-Fail & sicherer Speicher', en: 'Floating buttons, auto-fail & safer storage' },
    highlights: [
      { de: 'Auf den Ergebnisseiten schweben „Nochmal“ und „Übersicht“ am unteren Rand und sind immer griffbereit.', en: 'On result pages "Again" and "Overview" float at the bottom and are always within reach.' },
      { de: 'Auto-Fail: Läuft die Zielzeit ab, wird deine aktuelle Eingabe automatisch abgegeben (optional).', en: 'Auto-fail: when the target time runs out, your current input is submitted automatically (optional).' },
      { de: 'Neuer, robusterer Speicher für deine Ergebnisse – bestehende Daten werden übernommen.', en: 'New, more robust storage for your results – existing data is carried over.' },
      { de: 'Schnellerer Start und zuverlässigere Offline-Nutzung.', en: 'Faster start and more reliable offline use.' },
    ],
  },
  {
    version: '1.6.0', date: DATE,
    title: { de: 'Paralleles Kettenrechnen', en: 'Parallel chain calculation' },
    highlights: [
      { de: 'Neuer Modus: Paralleles Kettenrechnen – mehrere Rechenketten gleichzeitig im Kopf behalten.', en: 'New mode: parallel chain calculation – keep several calculation chains in mind at once.' },
      { de: 'Die Startzahl passt sich automatisch an dein Können an, Bestwerte werden gespeichert.', en: 'The starting number adapts to your skill automatically, personal bests are saved.' },
      { de: 'Technische Überarbeitung für mehr Stabilität.', en: 'Technical overhaul for more stability.' },
    ],
  },
  {
    version: '1.5.0', date: DATE,
    title: { de: 'Rechentricks, Daily & Kettenrechnen', en: 'Calculation tricks, daily & chains' },
    highlights: [
      { de: 'Rechentricks mit Schritt-für-Schritt-Lösungswegen zu jeder Aufgabe.', en: 'Calculation tricks with step-by-step solutions for every task.' },
      { de: 'Tägliche Aufgabe (Daily) mit Ergebnis zum Teilen.', en: 'Daily challenge with a result you can share.' },
      { de: 'Kettenrechnen: Aufgaben, die direkt aufeinander aufbauen.', en: 'Chain calculation: tasks that build directly on each other.' },
      { de: 'Schätzmodus, eigenes Training und Ghost-Lauf gegen deine Bestleistung.', en: 'Estimation mode, custom training and a ghost run against your best.' },
      { de: 'Lernkurve in der Analyse zeigt deinen Fortschritt über die Zeit.', en: 'The learning curve in the analysis shows your progress over time.' },
    ],
  },
  {
    version: '1.4.0', date: DATE,
    title: { de: 'Einheiten & Größenordnungen', en: 'Units & orders of magnitude' },
    highlights: [
      { de: 'Aufgaben mit Einheiten, zum Beispiel Längen, Gewichte und Zeiten.', en: 'Tasks with units, such as lengths, weights and times.' },
      { de: 'Größenordnungen abschätzen und schnell einordnen.', en: 'Estimate orders of magnitude and classify them quickly.' },
      { de: 'Kategorien frei auswählen, um gezielt zu üben.', en: 'Pick categories freely to practise in a targeted way.' },
      { de: 'Prozent und Dezimalzahlen ineinander umrechnen.', en: 'Convert between percentages and decimals.' },
    ],
  },
  {
    version: '1.3.0', date: DATE,
    title: { de: 'Neues Design & Lernfortschritt', en: 'New design & learning progress' },
    highlights: [
      { de: 'Komplett neues Design, als App installierbar und offline nutzbar.', en: 'Completely new design, installable as an app and usable offline.' },
      { de: 'Serie und Tagesziel halten dich motiviert.', en: 'Streak and daily goal keep you motivated.' },
      { de: 'Wiederholungen: Fehlerhafte Aufgaben kommen zum richtigen Zeitpunkt wieder.', en: 'Reviews: tasks you got wrong come back at the right time.' },
      { de: 'Schwierigkeitsstufen, die mit dir wachsen.', en: 'Difficulty levels that grow with you.' },
      { de: 'Eigenes Tastenfeld für schnelles Eintippen.', en: 'Dedicated keypad for fast typing.' },
    ],
  },
  {
    version: '1.2.0', date: DATE,
    title: { de: 'Lernbereich & KI-Erklärungen', en: 'Learning area & AI explanations' },
    highlights: [
      { de: 'Neuer Lernbereich mit Rechentricks zum Nachlesen und Üben.', en: 'New learning area with calculation tricks to read and practise.' },
      { de: 'Lösungswege zeigen, wie eine Aufgabe elegant gelöst wird.', en: 'Solution paths show how a task can be solved elegantly.' },
      { de: 'KI-Erklärungen helfen, wenn du bei einer Aufgabe nicht weiterkommst.', en: 'AI explanations help when you are stuck on a task.' },
    ],
  },
  {
    version: '1.1.0', date: DATE,
    title: { de: 'Einheiten-Eingabe & Korrekturen', en: 'Unit input & fixes' },
    highlights: [
      { de: 'Einheiten lassen sich direkt bei der Antwort mit eingeben.', en: 'Units can be entered directly with your answer.' },
      { de: 'Die Bewertung von Antworten ist genauer und fairer.', en: 'Answers are now scored more accurately and fairly.' },
    ],
  },
  {
    version: '1.0.0', date: DATE,
    title: { de: 'Erste Version', en: 'First release' },
    highlights: [
      { de: 'Kopfrechnen trainieren mit Zeitmessung und Punkten.', en: 'Train mental math with timing and points.' },
      { de: 'Verschiedene Aufgabentypen und eine erste Auswertung deiner Ergebnisse.', en: 'Various task types and a first analysis of your results.' },
    ],
  },
];

/** Vergleicht zwei SemVer-Strings (MAJOR.MINOR.PATCH): negativ, 0 oder positiv. */
export function compareVersions(a: string, b: string): number {
  const pa: number[] = a.split('.').map((s) => parseInt(s, 10) || 0);
  const pb: number[] = b.split('.').map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d: number = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Alle Releases, die neuer sind als `version` (neueste zuerst). '' → nur das neueste. */
export function releasesSince(version: string): Release[] {
  if (!version) return RELEASES.slice(0, 1);
  return RELEASES.filter((r) => compareVersions(r.version, version) > 0);
}
