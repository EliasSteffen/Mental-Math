// Versionshistorie (neueste zuerst). Quelle für „Was ist neu?“ und CHANGELOG.md.
import type { Release } from './types.ts';

const DATE = '2026-10-30';

export const RELEASES: Release[] = [
  {
    version: '2.3.0', date: '2026-11-11',
    title: { de: 'Neu sortiert & Raketen-Rennen', en: 'Reorganized & rocket race' },
    tour: 'v2',
    highlights: [
      { de: 'Neu: das Raketen-Rennen. Reihum auf einem Gerät bekommen alle dieselben Aufgaben – wer in 30 bis 120 Sekunden am meisten richtig löst, fliegt am höchsten. Danach Zeitraffer und Podest. Du findest es unter Wettkampf und auf Heute unter „Weitere Modi“.', en: 'New: the rocket race. Taking turns on one device, everyone gets the same tasks – whoever solves the most in 30 to 120 seconds flies highest. Then a time-lapse and a podium. Find it under Compete and on Today under “More modes”.' },
      { de: 'Vier Tabs: Heute, Lernen, Erfolge und Wettkampf. Profil und Einstellungen findest du jetzt hinter deinem Liga-Emblem oben rechts, auf dem iPad unten in der Seitenleiste. „Schließen“ bringt dich zurück, wo du warst.', en: 'Four tabs: Today, Learn, Achievements and Compete. Your profile and settings now sit behind your league emblem at the top right, on iPad at the bottom of the sidebar. “Close” takes you back to where you were.' },
      { de: 'Aus Fortschritt wird Erfolge: Spielerkarte, Quests, Liga, Orden, Trick-Karten und Shop auf einen Blick. Deine Statistik findest du unter Erfolge → Statistik.', en: 'Progress becomes Achievements: player card, quests, league, badges, trick cards and shop at a glance. Your statistics are under Achievements → Statistics.' },
      { de: 'Heute hat eine eigene Kachel für den Mini-Case. Wer neu ist, bekommt den Einstufungstest gleich als Empfehlung.', en: 'Today has its own tile for the mini case. If you are new, the placement test is suggested right away.' },
      { de: 'Shop neu abgestimmt: Themes, Rahmen und Freezes kosten mehr, damit sich das Sammeln über Wochen lohnt. Dafür bringen Quests, Wochentruhen und der Comeback-Bonus deutlich mehr XP. Was du schon gekauft hast, bleibt dir.', en: 'Shop rebalanced: themes, frames and freezes cost more, so collecting stays worthwhile for weeks. In return, quests, weekly chests and the comeback bonus give much more XP. Everything you already bought stays yours.' },
      { de: 'Der Rundgang zeigt die neue Sortierung – jederzeit wieder unter Profil → Hilfe & Info.', en: 'The tour shows the new layout – any time again under Profile → Help & info.' },
    ],
  },
  {
    version: '2.2.0', date: '2026-11-11',
    title: { de: 'Shop, Quests & Comeback', en: 'Shop, quests & comeback' },
    highlights: [
      { de: 'Neu: der Shop unter Fortschritt → Erfolge. Tausche deine XP gegen Streak-Freezes, drei neue Themes (Abendrot, Sand, Tiefsee) und Rahmen für dein Liga-Emblem. Dein Level sinkt dabei nie.', en: 'New: the shop under Progress → Achievements. Trade your XP for streak freezes, three new themes (Sunset, Sand, Deep sea) and frames for your league emblem. Your level never drops when you spend.' },
      { de: 'Neu: jeden Tag drei Quests – leicht, mittel und schwer – mit XP als Belohnung. Jede erledigte Quest ist ein Stern; bei 5, 10 und 15 Sternen öffnest du die Wochentruhe in Bronze, Silber oder Gold.', en: 'New: three quests every day – easy, medium and hard – with XP as a reward. Every finished quest is a star; at 5, 10 and 15 stars you open the weekly chest in bronze, silver or gold.' },
      { de: 'Schön, dass du wieder da bist: Nach ein paar Tagen Pause wartet eine leichte Aufwärmrunde mit Comeback-Bonus.', en: 'Good to have you back: after a few days off, an easy warm-up round with a comeback bonus is waiting.' },
      { de: 'Serie gerissen? Am nächsten Tag holst du sie zurück – mit drei Runden oder mit XP.', en: 'Streak broken? The next day you can get it back – with three rounds or with XP.' },
      { de: 'Nach jeder Runde siehst du die gewonnenen Ligapunkte und wie weit es bis zur nächsten Stufe ist. Auf Heute steht dein nächstes Ziel, zum Beispiel „Noch 36 LP bis Gold I“.', en: 'After every round you see the league points you gained and how far it is to the next tier. Today shows your next goal, for example “36 LP to Gold I”.' },
      { de: 'Behoben: Wer mehr als 5.000 Aufgaben gelöst hatte, konnte Level verlieren. Dein Level zählt jetzt alle je verdienten XP.', en: 'Fixed: after more than 5,000 solved tasks you could lose levels. Your level now counts all XP you have ever earned.' },
    ],
  },
  {
    version: '2.1.0', date: '2026-11-11',
    title: { de: 'Ligen, Orden & Mini-Cases', en: 'Leagues, badges & mini cases' },
    highlights: [
      { de: 'Neu: Ligen von Bronze bis Meister. Deine Liga folgt deinem Können über alle Aufgabentypen, und die besten 10 Meister werden Champion. Dazu 22 Orden in Bronze, Silber und Gold und eine Trick-Karte für jeden Aufgabentyp, den du sicher beherrschst – alles unter Fortschritt → Erfolge.', en: 'New: leagues from Bronze to Master. Your league follows your skill across all task types, and the best 10 Masters become Champion. Plus 22 badges in bronze, silver and gold, and a trick card for every task type you master – all under Progress → Achievements.' },
      { de: 'Neu: Mini-Case. Ein Fall wie im Interview mit vier Rechenschritten, die aufeinander aufbauen, und am Ende eine Entscheidung. Acht Fälle von Marktgröße über Break-even bis zum Exhibit.', en: 'New: mini case. A case like in the interview, with four calculation steps that build on each other and a decision at the end. Eight cases, from market size and break-even to exhibits.' },
      { de: 'Mehr Tempo, mehr Rückmeldung: Nach einer richtigen Antwort geht es von selbst weiter (abschaltbar unter Profil → Während der Runde). Das Ergebnis zeigt deine Bestzeit, den Vergleich mit der letzten Runde, wie sich dein Skill verändert hat und wie weit es bis zum nächsten Level ist.', en: 'More pace, more feedback: after a correct answer the next task follows on its own (you can turn this off under Profile → During a round). The result shows your best time, how you compare with your last round, how your skill changed and how far it is to the next level.' },
      { de: 'Das Tagesziel zählt Runden statt Minuten. Eine Runde am Tag hält deine Serie, und für jede Woche am Stück bekommst du einen Freeze, der einen verpassten Tag überbrückt.', en: 'The daily goal counts rounds instead of minutes. One round a day keeps your streak, and for every week in a row you get a freeze that covers a missed day.' },
      { de: 'Freund herausfordern: Spiel eine Runde und schick den Link. Dein Freund bekommt dieselben Aufgaben und sieht, wer gewonnen hat – auch mit der Daily und ganz ohne Konto.', en: 'Challenge a friend: play a round and send the link. Your friend gets the same tasks and sees who won – with the daily challenge too, and without an account.' },
      { de: 'Außerdem: Spielerkarte im Profil, eine Lernkarte im Lernen-Tab, eine Beispielaufgabe in der Empfehlung, Schrift in der Textgröße deines iPhones, eine deutlich schneller startende Website und „Feedback senden“ unter Profil → Hilfe & Info.', en: 'Also: a player card in your profile, a learning map in the Learn tab, an example task in the recommendation, text that follows your iPhone’s text size, a much faster website start and “Send feedback” under Profile → Help & info.' },
    ],
  },
  {
    version: '2.0.1', date: '2026-11-11',
    title: { de: 'Hinter den Kulissen', en: 'Behind the scenes' },
    highlights: [
      { de: 'Updates im Hintergrund lassen sich jetzt flexibler ausliefern – damit die nächste Version reibungslos ankommt.', en: 'Background updates can now be delivered more flexibly – so the next version arrives smoothly.' },
      { de: 'Kleine Verbesserungen und Vorbereitung auf die nächste Version.', en: 'Small improvements and groundwork for the next version.' },
    ],
  },
  {
    version: '2.0.0', date: '2026-11-09',
    title: { de: 'Gemacht fürs iPad', en: 'Made for iPad' },
    tour: 'v2',
    highlights: [
      { de: 'Neuer Rundgang: Die App zeigt dir selbst, was sie kann. Du findest ihn jederzeit unter Profil → Hilfe & Info. Die Einstellungen sind jetzt in Menüs sortiert, und jede erklärt, was sie macht.', en: 'New tour: the app shows you itself what it can do. Find it any time under Profile → Help & info. Settings are now sorted into menus, and each one explains what it does.' },
      { de: 'Mental Math läuft jetzt als echte iPad-App: hochkant, quer und neben anderen Apps, statt als vergrößerte iPhone-Ansicht.', en: 'Mental Math now runs as a true iPad app: in portrait, in landscape and next to other apps, instead of an enlarged iPhone view.' },
      { de: 'Auf dem iPad nutzt jede Seite den Platz: Seitenleiste statt Tab-Leiste, Kategorien und Modi direkt auf der Startseite, Fortschritt als Dashboard und Lernen mit Liste und Erklärung nebeneinander.', en: 'On iPad every page uses the space: a sidebar instead of the tab bar, categories and modes right on the home page, Progress as a dashboard, and Learn with list and explanation side by side.' },
      { de: 'Training auf dem iPad: Die Aufgabe steht groß im Blick, das Tastenfeld hat große Tasten. Im Querformat wählst du unter Profil → Eingabe, ob es links, mittig oder rechts steht.', en: 'Training on iPad: the task is large and clear, and the keypad has large keys. In landscape you choose under Profile → Input whether it sits on the left, in the center or on the right.' },
      { de: 'Neuer Tab „Wettkampf“: Daily Challenge, Ranglisten, Wettbewerbe und Gruppen sind jetzt auf iPhone und iPad mit einem Tipp erreichbar.', en: 'New “Compete” tab: the daily challenge, leaderboards, competitions and groups are now one tap away on iPhone and iPad.' },
      { de: 'Die Daily steht als große Karte ganz oben, danach siehst du dort direkt deinen Platz. Auf dem iPad läuft die Rangliste des Tages gleich darunter mit.', en: 'The daily challenge is a large card at the top, and afterwards it shows your rank right there. On iPad the day’s leaderboard appears directly below it.' },
    ],
  },
  {
    version: '1.17.2', date: '2026-11-09',
    title: { de: 'Läuft wieder überall', en: 'Works everywhere again' },
    highlights: [
      { de: 'Behoben: Mit einem Werbe- oder Tracking-Blocker wie uBlock Origin startete die Website nicht – ein Dateiname stand auf dessen Liste und hat die ganze App blockiert.', en: 'Fixed: with an ad or tracking blocker such as uBlock Origin the website did not start – one file name was on its list and blocked the whole app.' },
      { de: 'Eingabefenster wie „Gruppe erstellen“ oder „Mit Code beitreten“ liegen auf dem iPhone nicht mehr hinter der Tastatur.', en: 'Input sheets such as “Create group” or “Join with code” no longer hide behind the keyboard on iPhone.' },
    ],
  },
  {
    version: '1.17.1', date: '2026-11-09',
    title: { de: 'Updates, die man nicht übersieht', en: 'Updates you cannot miss' },
    highlights: [
      { de: 'Eine neue Version meldet sich jetzt mit einer großen Karte statt einer kleinen Pille: mit Fortschritt beim Laden und einem Knopf, der so groß ist wie „Jetzt üben“.', en: 'A new version now appears as a large card instead of a small pill: with progress while loading and a button as large as “Practice now”.' },
      { de: 'Behoben: In der Beta-App stand dauerhaft „Anmeldung abgelaufen“, und Änderungen wurden nicht mehr zwischen den Geräten abgeglichen.', en: 'Fixed: the beta app kept showing “Session expired”, and changes were no longer synced between devices.' },
    ],
  },
  {
    version: '1.17.0', date: '2026-11-08',
    title: { de: 'Ranglisten & Wettbewerbe', en: 'Leaderboards & competitions' },
    highlights: [
      { de: 'Die Daily Challenge wird gewertet: Mit Konto bekommen alle am selben Tag dieselben 15 Aufgaben, und du hast genau einen Versuch. Danach siehst du deinen Platz und wie viele du hinter dir lässt.', en: 'The daily challenge is now ranked: with an account, everyone gets the same 15 tasks on the same day, and you have exactly one attempt. Afterwards you see your rank and how many you beat.' },
      { de: 'Ranglisten für den Tag und die Woche. Dein Name erscheint nur, wenn du zustimmst – sonst stehst du dort anonym.', en: 'Leaderboards for the day and the week. Your name only appears if you agree – otherwise you are listed anonymously.' },
      { de: 'Gruppen für Freunde, Team oder Kurs: per Link oder Code beitreten, eigene Rangliste und eigene Wettbewerbe mit Kategorie, Anzahl, Stufe und Dauer.', en: 'Groups for friends, team or class: join with a link or code, with their own leaderboard and their own competitions by category, number, level and duration.' },
      { de: 'Nach deinem Versuch kannst du dieselben Aufgaben ungewertet nachüben. Fällt das Netz aus, wird dein Ergebnis abgegeben, sobald du wieder online bist.', en: 'After your attempt you can practice the same tasks unranked. If the connection drops, your result is submitted as soon as you are back online.' },
      { de: 'Training passt sich schneller an dich an: Nach drei sicheren Treffern wird ein Aufgabentyp schwerer, nach zwei Fehlern leichter. Hakt es auch auf „Leicht“, kommen zwischendurch die Grundlagen – bis hinunter zum kleinen 1×1.', en: 'Training adapts to you faster: after three confident answers a task type gets harder, after two mistakes easier. If even “Easy” is tough, the basics come in between – all the way down to the times tables.' },
      { de: 'Neu beim ersten Start: ein kurzer Einstufungstest mit bis zu 10 Aufgaben findet deine Startstufe – vom kleinen 1×1 bis zu Prozenten. Wiederholen kannst du ihn unter Profil → Training.', en: 'New on first launch: a short placement test with up to 10 tasks finds your starting level – from times tables to percentages. You can repeat it under Profile → Training.' },
    ],
  },
  {
    version: '1.16.2', date: '2026-11-05',
    title: { de: 'Updates, die man sieht', en: 'Updates you can see' },
    highlights: [
      { de: 'Lädt die iPhone-App eine neue Version, zeigt sie das unten mit einem kleinen Fortschrittsbalken an – ohne dich beim Üben zu stören.', en: 'When the iPhone app downloads a new version, a small progress bar at the bottom shows it – without interrupting your practice.' },
      { de: 'Ist das Update bereit, kannst du es mit „Jetzt aktualisieren“ sofort laden oder einfach beim nächsten Öffnen. Mitten in einer Runde passiert nie etwas.', en: 'Once the update is ready, tap “Update now” to load it right away or simply get it the next time you open the app. Nothing ever happens in the middle of a round.' },
      { de: 'Nach dem Wechsel bestätigt die App kurz die neue Version und zeigt auf Wunsch, was neu ist.', en: 'After switching, the app briefly confirms the new version and shows you what’s new if you like.' },
    ],
  },
  {
    version: '1.16.1', date: '2026-11-05',
    title: { de: 'Schritt für Schritt lernen', en: 'Learn step by step' },
    highlights: [
      { de: 'Neu im Lernen-Tab: „Schritt für Schritt lernen“. Ein Rechentrick wird erst an einem Beispiel gezeigt, dann rechnest du jeden Zwischenschritt selbst – mit einem Tipp genau für den Schritt, an dem es hakt.', en: 'New in the Learn tab: "Learn step by step". A math trick is first shown with an example, then you work out each intermediate step yourself – with a hint for exactly the step you are stuck on.' },
      { de: 'Kleine Grafiken machen die Tricks sichtbar: Flächenmodell, Zahlenstrahl, Anteilsbalken und Stellenwerte.', en: 'Small graphics make the tricks visible: area model, number line, fraction bars and place values.' },
      { de: 'Mehr Abwechslung im Training: Dieselbe Aufgabe kommt nicht mehr kurz hintereinander, und viele Aufgabentypen haben deutlich mehr Varianten.', en: 'More variety in training: the same task no longer comes up again right away, and many task types have far more variants.' },
    ],
  },
  {
    version: '1.16.0', date: '2026-11-04',
    title: { de: 'Schnellere Verbesserungen', en: 'Faster improvements' },
    highlights: [
      { de: 'Kleine Verbesserungen und Fehlerbehebungen erreichen die iPhone-App jetzt direkt – ohne Update aus dem App Store. Die App prüft beim Start, lädt im Hintergrund und wechselt erst beim nächsten Öffnen.', en: 'Small improvements and fixes now reach the iPhone app directly – without an App Store update. The app checks on launch, downloads in the background and switches over the next time you open it.' },
      { de: 'Jedes Update ist signiert und wird vor dem Einsatz geprüft. Startet eine neue Version nicht sauber, kehrt die App automatisch zur vorherigen zurück.', en: 'Every update is signed and verified before it is used. If a new version does not start cleanly, the app automatically returns to the previous one.' },
    ],
  },
  {
    version: '1.15.0', date: '2026-11-01',
    title: { de: 'iPhone-App, Einführung & Teilen', en: 'iPhone app, intro & sharing' },
    highlights: [
      { de: 'Mental Math gibt es jetzt als iPhone-App – mit Passkey-Anmeldung, Erinnerungen, einem Hinweis auf neue Versionen im App Store und einer einfachen Möglichkeit, die App zu bewerten.', en: 'Mental Math is now available as an iPhone app – with passkey sign-in, reminders, a notice when a new version is in the App Store and an easy way to rate the app.' },
      { de: 'Beim ersten Start zeigt dir eine kurze Einführung, wo du was findest. Du kannst sie jederzeit unter Profil → Über erneut ansehen.', en: 'On first launch, a short introduction shows you where to find everything. You can replay it any time under Profile → About.' },
      { de: 'Teile dein Ergebnis als Bild – mit Trefferquote, Tempo und Punkten, passend zu deinem Theme.', en: 'Share your result as an image – with accuracy, speed and points, matching your theme.' },
      { de: 'Neue Seiten für Datenschutz, Hilfe und Neuigkeiten – auch in der App unter Profil → Über.', en: 'New pages for privacy, help and news – also in the app under Profile → About.' },
      { de: 'KI-Erklärungen stellen richtige Antworten nicht mehr als Fehler dar.', en: 'AI explanations no longer present correct answers as mistakes.' },
      { de: 'Unter der Haube: Speichern geht schneller, weil jede Antwort einzeln abgelegt wird statt der ganzen Historie.', en: 'Under the hood: saving is faster because each answer is stored on its own instead of rewriting your whole history.' },
    ],
  },
  {
    version: '1.14.0', date: '2026-11-01',
    title: { de: 'Zuverlässiger Sync & Updates', en: 'Reliable sync & updates' },
    highlights: [
      { de: 'Der Sync verliert keine Daten mehr, auch bei großen Beständen oder wenn er abbricht. Ein fehlerhafter Eintrag hält ihn nicht mehr auf.', en: 'Sync no longer loses data, even with a large history or when it gets interrupted. A single broken entry no longer holds it up.' },
      { de: 'Offline gestartet bleibst du angemeldet; sobald das Netz zurück ist, verbindet sich dein Konto wieder.', en: 'Start the app offline and you stay signed in; your account reconnects as soon as you are back online.' },
      { de: 'Neue Versionen kündigen sich mit einem Hinweis an und laden erst, wenn du tippst – nie mitten in einer Runde. Bei schlechtem Netz startet die App schneller.', en: 'New versions show a notice and load only when you tap it – never in the middle of a round. On a weak connection the app starts faster.' },
      { de: 'Beim Abmelden kannst du deine Daten von diesem Gerät entfernen; Ausstehendes wird vorher noch synchronisiert.', en: 'When signing out, you can remove your data from this device; anything pending is synced first.' },
      { de: 'Import prüft die Einträge, überspringt unvollständige und sagt dir, wie viele es waren.', en: 'Import checks your entries, skips incomplete ones and tells you how many.' },
      { de: 'Unter der Haube: Anmeldung besser gegen Missbrauch geschützt, Sitzungen enden nach spätestens 90 Tagen, mehrere offene Tabs melden dich nicht mehr ab.', en: 'Under the hood: sign-in is better protected against abuse, sessions end after 90 days at most, and several open tabs no longer sign you out.' },
    ],
  },
  {
    version: '1.13.0', date: '2026-10-31',
    title: { de: 'Erinnerungen', en: 'Reminders' },
    highlights: [
      { de: 'Neu: Erinnerungen per Push-Benachrichtigung – täglich zu deiner Uhrzeit und an den Wochentagen, die du wählst.', en: 'New: push notification reminders – daily at your chosen time, on the days you pick.' },
      { de: '„Serie retten“ meldet sich um 20 Uhr, wenn dein Tagesziel noch fehlt und die Serie sonst reißt.', en: '"Save your streak" checks in at 8 pm if your daily goal is still open and your streak would end.' },
      { de: 'Hinweise auf fällige Wiederholungen und sonntags ein Rechentrick, passend zu deinen Schwächen.', en: 'Nudges for due reviews, plus a math trick on Sundays that targets your weak spots.' },
      { de: 'Keine Erinnerung, wenn du heute schon genug trainiert hast. Einstellen unter Profil → Erinnerungen.', en: 'No reminder if you have already trained enough today. Set it up under Profile → Reminders.' },
    ],
  },
  {
    version: '1.12.0', date: '2026-10-31',
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
    version: '1.11.0', date: '2026-10-31',
    title: { de: 'Ruhiger Fokus', en: 'Calm focus' },
    highlights: [
      { de: 'Neue, ruhige Oberfläche mit vier Tabs: Heute, Lernen, Fortschritt und Profil.', en: 'A new, calm interface with four tabs: Today, Learn, Progress and Profile.' },
      { de: 'Themes Papier, Nacht, OLED, Aurora und Neon.', en: 'Themes Paper, Night, OLED, Aurora and Neon.' },
      { de: 'Fokus-Training: Tastenfeld unten im Daumenbereich, Rückmeldung mit Lösungsweg im Feedback-Sheet – ohne Fehlerton.', en: 'Focus training: number pad at the bottom within thumb reach, feedback with the solution in a sheet – no error sound.' },
      { de: 'Zeitanzeige wählbar (Ruhig, Präzise, Aus) und auf Wunsch eine Atempause vor der Runde.', en: 'Choose the time display (Calm, Precise, Off) and, if you like, a breathing pause before the round.' },
      { de: 'Profil als eine Seite: Einstellungen wirken sofort, die Seite springt nicht mehr nach oben.', en: 'Profile on a single page: settings apply instantly and the page no longer jumps to the top.' },
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
