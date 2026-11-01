# Changelog

Alle nennenswerten Änderungen an Mental Math. Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach [SemVer](https://semver.org/lang/de/).

<!-- Automatisch erzeugt mit `npm run changelog` aus src/releases.ts – nicht von Hand bearbeiten. -->

## [1.15.0] - 2026-11-01

### iPhone-App, Einführung & Teilen

- Mental Math gibt es jetzt als iPhone-App – mit Passkey-Anmeldung, Erinnerungen, einem Hinweis auf neue Versionen im App Store und einer einfachen Möglichkeit, die App zu bewerten.
- Beim ersten Start zeigt dir eine kurze Einführung, wo du was findest. Du kannst sie jederzeit unter Profil → Über erneut ansehen.
- Teile dein Ergebnis als Bild – mit Trefferquote, Tempo und Punkten, passend zu deinem Theme.
- Neue Seiten für Datenschutz, Hilfe und Neuigkeiten – auch in der App unter Profil → Über.
- KI-Erklärungen stellen richtige Antworten nicht mehr als Fehler dar.
- Unter der Haube: Speichern geht schneller, weil jede Antwort einzeln abgelegt wird statt der ganzen Historie.

## [1.14.0] - 2026-11-01

### Zuverlässiger Sync & Updates

- Der Sync verliert keine Daten mehr, auch bei großen Beständen oder wenn er abbricht. Ein fehlerhafter Eintrag hält ihn nicht mehr auf.
- Offline gestartet bleibst du angemeldet; sobald das Netz zurück ist, verbindet sich dein Konto wieder.
- Neue Versionen kündigen sich mit einem Hinweis an und laden erst, wenn du tippst – nie mitten in einer Runde. Bei schlechtem Netz startet die App schneller.
- Beim Abmelden kannst du deine Daten von diesem Gerät entfernen; Ausstehendes wird vorher noch synchronisiert.
- Import prüft die Einträge, überspringt unvollständige und sagt dir, wie viele es waren.
- Unter der Haube: Anmeldung besser gegen Missbrauch geschützt, Sitzungen enden nach spätestens 90 Tagen, mehrere offene Tabs melden dich nicht mehr ab.

## [1.13.0] - 2026-10-31

### Erinnerungen

- Neu: Erinnerungen per Push-Benachrichtigung – täglich zu deiner Uhrzeit und an den Wochentagen, die du wählst.
- „Serie retten“ meldet sich um 20 Uhr, wenn dein Tagesziel noch fehlt und die Serie sonst reißt.
- Hinweise auf fällige Wiederholungen und sonntags ein Rechentrick, passend zu deinen Schwächen.
- Keine Erinnerung, wenn du heute schon genug trainiert hast. Einstellen unter Profil → Erinnerungen.

## [1.12.0] - 2026-10-31

### Exhibits, 1×1, Englisch & Wiederherstellung

- Neu: Exhibits – Diagramme und Tabellen lesen und daraus rechnen wie im Case (Anteile, Wachstum, gewichteter Durchschnitt, relativ vs. absolut).
- Neu: Kleines 1×1 als schneller Drill, getrennt von den gemischten Runden.
- Lernbereich, Lösungswege und KI-Erklärungen gibt es jetzt auch auf Englisch.
- Wiederherstellungscode: Wer alle Passkeys verliert, kommt damit wieder in sein Konto.
- KI-Erklärungen sind jetzt geräteübergreifend gegen Missbrauch begrenzt.

## [1.11.0] - 2026-10-31

### Ruhiger Fokus

- Neue, ruhige Oberfläche mit vier Tabs: Heute, Lernen, Fortschritt und Profil.
- Themes Papier, Nacht, OLED, Aurora und Neon.
- Fokus-Training: Tastenfeld unten im Daumenbereich, Rückmeldung mit Lösungsweg im Feedback-Sheet – ohne Fehlerton.
- Zeitanzeige wählbar (Ruhig, Präzise, Aus) und auf Wunsch eine Atempause vor der Runde.
- Profil als eine Seite: Einstellungen wirken sofort, die Seite springt nicht mehr nach oben.

## [1.10.0] - 2026-10-31

### Offline & Cloud-Sync

- Deine Daten liegen jetzt in IndexedDB: schneller, mehr Platz und auch offline verfügbar.
- Automatische Synchronisierung aller Trainingsdaten zwischen deinen Geräten, sobald du angemeldet bist.
- Konflikte werden zusammengeführt statt überschrieben.
- „Alle Daten löschen“ wirkt im angemeldeten Zustand auf allen Geräten.
- Status und „Jetzt synchronisieren“ findest du in den Einstellungen.

## [1.9.0] - 2026-10-31

### Konto mit Passkey

- Neu: Konto ohne E-Mail und Passwort – anmelden per Passkey (Face ID, Touch ID oder Gerätesperre).
- Mehrere Passkeys pro Konto: füge Geräte hinzu, benenne sie um oder entferne sie wieder.
- Wichtig: Es gibt keine Wiederherstellung – wer alle Passkeys verliert, verliert das Konto.
- Grundlage für die spätere Cloud-Synchronisierung deines Trainings.

## [1.8.0] - 2026-10-30

### Versionen, Einstellungen & Feinschliff

- Neu: „Was ist neu?“ – nach einem Update zeigt die App automatisch die Neuerungen.
- Einstellungen in übersichtlichen Tabs: Allgemein, Gameplay, Daten & Account, Über.
- Daten importieren: Sichere dein Training als Datei und spiele es auf einem anderen Gerät wieder ein.
- Hinweise (Toasts), Dialoge und Ladeplatzhalter machen die App flüssiger und klarer.
- Sprache wählbar: Deutsch oder Englisch.

## [1.7.0] - 2026-10-30

### Schwebende Buttons, Auto-Fail & sicherer Speicher

- Auf den Ergebnisseiten schweben „Nochmal“ und „Übersicht“ am unteren Rand und sind immer griffbereit.
- Auto-Fail: Läuft die Zielzeit ab, wird deine aktuelle Eingabe automatisch abgegeben (optional).
- Neuer, robusterer Speicher für deine Ergebnisse – bestehende Daten werden übernommen.
- Schnellerer Start und zuverlässigere Offline-Nutzung.

## [1.6.0] - 2026-10-30

### Paralleles Kettenrechnen

- Neuer Modus: Paralleles Kettenrechnen – mehrere Rechenketten gleichzeitig im Kopf behalten.
- Die Startzahl passt sich automatisch an dein Können an, Bestwerte werden gespeichert.
- Technische Überarbeitung für mehr Stabilität.

## [1.5.0] - 2026-10-30

### Rechentricks, Daily & Kettenrechnen

- Rechentricks mit Schritt-für-Schritt-Lösungswegen zu jeder Aufgabe.
- Tägliche Aufgabe (Daily) mit Ergebnis zum Teilen.
- Kettenrechnen: Aufgaben, die direkt aufeinander aufbauen.
- Schätzmodus, eigenes Training und Ghost-Lauf gegen deine Bestleistung.
- Lernkurve in der Analyse zeigt deinen Fortschritt über die Zeit.

## [1.4.0] - 2026-10-30

### Einheiten & Größenordnungen

- Aufgaben mit Einheiten, zum Beispiel Längen, Gewichte und Zeiten.
- Größenordnungen abschätzen und schnell einordnen.
- Kategorien frei auswählen, um gezielt zu üben.
- Prozent und Dezimalzahlen ineinander umrechnen.

## [1.3.0] - 2026-10-30

### Neues Design & Lernfortschritt

- Komplett neues Design, als App installierbar und offline nutzbar.
- Serie und Tagesziel halten dich motiviert.
- Wiederholungen: Fehlerhafte Aufgaben kommen zum richtigen Zeitpunkt wieder.
- Schwierigkeitsstufen, die mit dir wachsen.
- Eigenes Tastenfeld für schnelles Eintippen.

## [1.2.0] - 2026-10-30

### Lernbereich & KI-Erklärungen

- Neuer Lernbereich mit Rechentricks zum Nachlesen und Üben.
- Lösungswege zeigen, wie eine Aufgabe elegant gelöst wird.
- KI-Erklärungen helfen, wenn du bei einer Aufgabe nicht weiterkommst.

## [1.1.0] - 2026-10-30

### Einheiten-Eingabe & Korrekturen

- Einheiten lassen sich direkt bei der Antwort mit eingeben.
- Die Bewertung von Antworten ist genauer und fairer.

## [1.0.0] - 2026-10-30

### Erste Version

- Kopfrechnen trainieren mit Zeitmessung und Punkten.
- Verschiedene Aufgabentypen und eine erste Auswertung deiner Ergebnisse.
