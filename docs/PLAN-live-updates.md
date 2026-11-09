# Plan – Live-Updates der iOS-App (Web-Schicht ohne Store-Release)

Stand: 2026-11-04. Ziel: kleine Fehlerbehebungen und neue Trainingsmodi erreichen die iOS-App, ohne dass jedes Mal eine
neue Version durch das App Review muss. Die App ist eine Capacitor-Hülle (`ios/`, `capacitor.config.json`,
`webDir: dist`) um dieselbe Web-App, die auf Cloudflare Pages läuft. Heute steckt `dist/` fest im Binary; jede Änderung
braucht einen Store-Release.

**Was live gehen darf:** nur die Web-Schicht (`dist/`: HTML, CSS, JS, Icons). **Was immer einen Store-Release braucht:**
alles Native – eigene Plugins (`NativeAuthPlugin.swift`, `AppStorePlugin.swift`, `LiveUpdatePlugin.swift`),
`Info.plist`, Entitlements, Privacy Manifest, Capacitor und seine Plugins (Versionen in `package.json`), das
Xcode-Projekt.

---

## 1. Apples Regeln (geprüft am 2026-11-04)

| Quelle | Kernaussage (sinngemäß) |
|---|---|
| [App Review Guidelines 2.5.2](https://developer.apple.com/app-store/review/guidelines/#software-requirements) | Apps sollen in ihrem Bundle abgeschlossen sein und keinen Code laden, installieren oder ausführen, der Funktionen der App einführt oder ändert. Ausnahme nur für Lern-Apps zum Programmieren. |
| [Developer Program License Agreement, 3.3.1 (B) „Executable Code“](https://developer.apple.com/support/terms/apple-developer-program-license-agreement/#b331) | Ausführbarer Code darf nicht nachgeladen werden. **Interpretierter Code** darf nachgeladen werden, solange er (a) den Hauptzweck der App nicht durch Funktionen ändert, die nicht zum vorgesehenen und beworbenen Zweck passen, (b) Signatur, Sandbox und andere Sicherheitsfunktionen des Systems nicht umgeht und (c) bei App-Store-Apps keinen Store für andere Apps schafft. |
| [Guidelines 4.7](https://developer.apple.com/app-store/review/guidelines/#mini-apps-mini-games-streaming-games-chatbots-plug-ins-and-game-emulators) | Regelt HTML5/JS-Mini-Apps und -Spiele **Dritter** innerhalb einer App. Trifft hier nicht zu: Wir laden nur die eigene Oberfläche nach, keine fremde Software. |
| [Guidelines 2.3.1](https://developer.apple.com/app-store/review/guidelines/#accurate-metadata) | Keine versteckten, „schlafenden“ oder undokumentierten Funktionen. Relevant, falls man per Update etwas freischaltet, das beim Review schon im Code lag. |

**Einordnung:** Die Lizenzvereinbarung ist der Vertrag; JavaScript in WebKit ist interpretierter Code. Live-Updates
von JS-Bundles sind damit erlaubt, solange sie im Rahmen von (a)–(c) bleiben. Das ist die Grundlage für
Expo Updates, CodePush (eingestellt) und Capgo. Die Guideline 2.5.2 ist strenger formuliert; App Review legt sie
praktisch so aus, dass Updates innerhalb des Zwecks geduldet werden, ein „Bait and Switch“ (App A einreichen, per
Update App B ausliefern) aber zur Ablehnung oder Entfernung führt. Ein Restrisiko bleibt Ermessen des Reviews.

**Leitplanken für dieses Projekt** (gelten für jedes Live-Update):

1. **Nur innerhalb des bestehenden Zwecks:** Kopfrechentraining fürs Case Interview. Erlaubt: Fehlerbehebungen, Texte,
   Design-Feinschliff, neue Übungs- oder Trainingsmodi, neue Rechentricks im Lernbereich, Performance.
2. **Größere Neuerungen per Store-Release:** neue Bereiche, die das Produkt sichtbar verändern (z. B. Bezahlinhalte,
   Social/Chat, ganz andere Fächer). Auch alles, was neue Berechtigungen oder Datenschutzangaben braucht.
3. **Keine nativen Fähigkeiten nachrüsten:** Ein Update kann nur nutzen, was das installierte Binary schon kann
   (`minNative`, Abschnitt 3.3). Kein Umgehen von Sandbox oder Signatur, kein `eval` fremden Codes, keine Inhalte Dritter.
4. **Keine versteckten Schalter:** keine Funktionen, die beim Review im Code liegen und erst später per Server
   freigeschaltet werden.
5. **Transparenz:** In den Review-Notizen der nächsten Store-Version kurz erwähnen, dass die App signierte
   Aktualisierungen ihrer Web-Oberfläche vom eigenen Server laden kann.
6. **Die App funktioniert ohne Update:** Das eingebaute Bundle ist immer vollständig. Ein Update ist nie nötig, um die
   App zu benutzen.

---

## 2. Optionen

### (a) `@capgo/capacitor-updater`, selbst gehostet

Fertiges Capacitor-Plugin (MPL-2.0; Hauptversion folgt Capacitor, v8 für Capacitor 8) mit Swift- und Kotlin-Teil.
Ohne Capgo-Cloud konfiguriert man `updateUrl` (und optional `statsUrl`, `channelUrl`) auf einen eigenen Server.

- **Ablauf:** Die App fragt `updateUrl` (POST mit Geräte- und Versionsangaben), der Server antwortet mit Version,
  Zip-URL und Prüfsumme. Download und Entpacken laufen nativ im Hintergrund, gesetzt wird beim nächsten Start oder
  Hintergrundwechsel.
- **Rollback:** `notifyAppReady()` muss innerhalb von `appReadyTimeout` (Standard 10 s) kommen, sonst geht es zurück
  zum letzten funktionierenden oder eingebauten Bundle.
- **Sicherheit:** Prüfsumme je Update. Optional Ende-zu-Ende-Verschlüsselung mit Schlüsselpaar (`publicKey` in der
  Config). Das ersetzt die Signatur: Ein Bundle wird nur installiert, wenn Prüfsumme und Sitzungsschlüssel zum privaten
  Schlüssel passen.
- **Delta:** Auf Wunsch je Datei über ein Manifest.
- **Kanäle:** über `channelUrl` bzw. `setChannel`.

Für uns bedeutet das:

- Ein eigener Endpunkt muss Capgos Protokoll sprechen (eine Pages Function), dazu Zip-Erzeugung und Verschlüsselung mit
  `@capgo/cli` in CI.
- Neue native Abhängigkeit mit großem Funktionsumfang (Statistik, Geräte-ID, Kanäle, Mehrfach-Bundles) genau an der
  Stelle, die beliebigen Code der App austauschen kann. Jedes Plugin-Update ist ein Store-Release.
- Datenschutz: Die Update-Anfrage enthält Geräte- und Versionsdaten, Statistiken müssen ausdrücklich abgeschaltet
  werden. Privacy Manifest und App-Datenschutzangaben wären zu prüfen.
- Vorteil: erprobt, viele Randfälle gelöst (abgebrochene Downloads, Entpacken, Rollback, Android).

### (b) Eigenbau auf Capacitors eingebautem Mechanismus

Capacitor bringt alles mit, was zum Umschalten nötig ist (`node_modules/@capacitor/ios/Capacitor/Capacitor/`):

- `WebView.setServerBasePath({ path })` lädt die WebView aus einem anderen Ordner neu.
- `persistServerBasePath()` merkt sich den Ordner. Beim nächsten Start lädt `CAPBridgeViewController` aus
  `Library/NoCloud/ionic_built_snapshots/<letzte Pfadkomponente>` (Erbe von Ionic Deploy).
- Neues Binary (anderes `CFBundleShortVersionString` oder `CFBundleVersion`): Capacitor löscht den gespeicherten Pfad
  und startet mit dem eingebauten Bundle. Nach jedem Store-Update gilt also automatisch wieder das neue eingebaute
  Bundle.
- `@capacitor/filesystem` (schon im Binary) schreibt die Dateien, `CapacitorHttp` (Kern) lädt sie ohne CORS.
- `dist/precache.json` listet schon alle Dateien der App (für den Service Worker); dazu kommen die beiden App-Bundles
  `js/vendor/auth.js` und `js/vendor/native.js`, die der Service Worker bewusst auslässt.

Was fehlt: ein **Wächter**. Bleibt ein neues Bundle hängen, bevor sein JS läuft (Syntaxfehler, kaputtes `index.html`),
kann kein JavaScript mehr zurückschalten. Das muss nativ passieren. Dazu kommt ein kleines eigenes Plugin
(`LiveUpdatePlugin.swift`, ~150 Zeilen) neben den beiden bestehenden.

### Vergleich

| Kriterium | (a) Capgo selbst gehostet | (b) Eigenbau |
|---|---|---|
| Neuer nativer Code | großes Fremd-Plugin (Swift + Kotlin) | ~150 Zeilen Swift, im Repo |
| Hosting | eigener Endpunkt im Capgo-Protokoll + Zip-Ablage | nichts Neues: Die Produktionsseite **ist** das Bundle; dazu ein signiertes `/ota/manifest.json` |
| Manifest/Integrität | Prüfsumme (Zip), Verschlüsselung mit Schlüsselpaar | SHA-256 je Datei, Bundle-ID = Hash über alle Dateien, ECDSA-P-256-Signatur |
| Delta | ja (Manifest-Modus) | ja, automatisch: Unveränderte Dateien kommen aus dem laufenden Bundle |
| Rollback | `notifyAppReady` + Timeout | `ready()` + Timeout (nativer Wächter) + Startschutz + Neustart fällt aufs Bewährte zurück |
| Kompatibilität zum Binary | eigene Versionslogik | `minNative` + Fingerprint der nativen Teile (Test erzwingt Pflege) |
| Kanäle | ja | `production` (release) und `beta` (develop, nur TestFlight, freiwillig) |
| Datenschutz | Geräte-ID/Statistik standardmäßig an | nur zwei GETs (Manifest, Dateien) auf die eigene Domain, keine Kennung |
| Lieferkette | Fremdcode an der kritischsten Stelle | nur Capacitor-Kern und offizielle Plugins (schon vorhanden) |
| Testbarkeit | Blackbox | reine Logik in `src/core/live-update.ts`, Node-Tests |
| Aufwand | Endpunkt, Zip/CLI in CI, Konfiguration | ~600 Zeilen TS + Swift, einmalig |
| Risiko | gering bei der Technik, höher bei Lieferkette und Datenschutz | Randfälle selbst abdecken (durch Tests und Wächter begrenzt) |

### Empfehlung: (b) Eigenbau

Die App ist klein (≈ 1,6 MB, ≈ 180 Dateien), nur iOS, und ihre Dateien liegen schon versioniert und per HTTPS auf der
eigenen Domain. Capgos Mehrwert (Zip-Pipeline, Cloud-Protokoll, Statistik, Android) brauchen wir nicht. Seine Kosten
dagegen schon: Fremdcode, der die ganze App austauschen kann, und Gerätedaten, die an einen Server gehen. Der Eigenbau
nutzt den Mechanismus, den Capacitor selbst für genau diesen Zweck mitbringt. Er ergänzt ihn nur um Signatur,
Kompatibilitätsprüfung und einen nativen Wächter.

---

## 3. Entwurf (umgesetzt)

### 3.1 Bundle und Manifest

**Bundle** = `dist/` des Produktions-Builds: alle Dateien aus `precache.json` plus `js/vendor/auth.js` und
`js/vendor/native.js`. Die Website-Seiten (`hilfe.html` usw.), `sw.js` und `_headers` gehören nicht dazu.

**Manifest** (`scripts/live-update.ts publish`, liegt unter `https://<domain>/ota/manifest.json`): ein signierter
Umschlag mit dem Manifest als Text. Die Signatur gilt für genau diese Bytes, man muss kein JSON kanonisieren.

```json
{ "kid": "3f9a…", "payload": "{\"schema\":1,…}", "sig": "<base64url, ECDSA P-256/SHA-256, r‖s>" }
```

```json
{
  "schema": 1,
  "channel": "production",
  "createdAt": "2026-11-20T10:00:00.000Z",
  "mode": "on",
  "bundle": {
    "id": "9c1e0f6a2b3d4e5f",
    "version": "1.16.1",
    "build": "a1b2c3d",
    "minNative": "1.16.0",
    "files": [{ "path": "/index.html", "sha256": "…", "size": 4711 }, …]
  }
}
```

- `id`: die ersten 16 Hex-Zeichen von SHA-256 über alle `path` und `sha256`. Der Client rechnet nach, so ist der
  Ordnername an den Inhalt gebunden.
- `version`: `package.json` des Bundles. `minNative`: kleinste native App-Version (`CFBundleShortVersionString`), die
  das Bundle ausführen kann. `createdAt` schützt gegen das Wiedereinspielen alter Manifeste: Der Client merkt sich das
  neueste gesehene und ignoriert ältere.
- `mode`: `on` (Bundle anbieten), `off` (Not-Aus: nichts Neues laden, Vorgemerktes verwerfen), `reset` (zusätzlich
  beim nächsten Start zurück zum eingebauten Bundle).
- **Signatur:** ECDSA P-256 mit SHA-256. Der Client prüft mit WebCrypto, das gibt es auf allen unterstützten
  iOS-Versionen (ab 16.0). Ed25519 ginge in WebKit erst ab iOS 17. Den privaten Schlüssel hat nur das
  GitHub-Environment `production` (bzw. `preview` für Beta). Die öffentlichen Schlüssel kommen über Repo-Variablen in
  jeden Build. Ohne Schlüssel im Build ist der Updater aus.
- **Prüfungen im Client** (`parseManifest`): Schema, Kanal, Datum, Versionen, ID-Format, Pfade (nur
  `/[A-Za-z0-9._-/]`, kein `..`, kein `//`, keine Dubletten, `/index.html` muss dabei sein), Hash-Format, Größen
  (höchstens 2000 Dateien, 10 MB je Datei, 40 MB gesamt), ID passt zu den Dateien.

### 3.2 Ablauf in der App

```
Start ──► bootLiveUpdate()  (vor initStorage, nur iOS, nur wenn etwas ansteht)
            ├─ Probelauf vorgemerkt, läuft aber nicht → fehlgeschlagen: Bundle auf die schwarze Liste
            ├─ reset angefordert → LiveUpdate.reset() → eingebautes Bundle (Reload)
            └─ Bundle vorgemerkt und passend → LiveUpdate.trial(id) → Reload ins neue Bundle (nicht gespeichert)
                                                    └─ nativer Wächter: 10 s
App läuft ──► appReady()  (nach dem ersten Bild)
            └─ LiveUpdate.ready() → Wächter aus, Startzähler 0; läuft ein geladenes Bundle, wird es Startbundle
3 s nach jedem Start, bei Rückkehr höchstens alle 30 min ──► check()
            ├─ Manifest holen (CapacitorHttp), Signatur, Schema, Kanal, createdAt prüfen
            ├─ entscheiden: neuer als das laufende? minNative ≤ native Version? nicht auf der schwarzen Liste?
            └─ laden: je Datei erst im laufenden Bundle suchen (gleicher Hash = kopieren), sonst herunterladen,
               SHA-256 prüfen → .tmp-<id>/ → umbenennen in <id>/ → „vorgemerkt“ (gilt ab dem nächsten Start)
```

- **Im Hintergrund laden, beim nächsten Start anwenden:** Laden stört nie eine laufende Runde. Umgeschaltet wird nur
  beim Kaltstart, bevor die Oberfläche gezeichnet ist.
- **Probelauf statt sofort speichern:** `trial` lädt das neue Bundle, ohne es zu speichern. Erst `ready()` aus dem
  neuen Bundle macht es zum Startbundle. Stürzt die App im Probelauf ab oder wird beendet, startet sie wieder mit dem
  vorherigen Bundle. Das alte JS sieht dann den offenen Probelauf und setzt das Bundle auf die schwarze Liste.
- **Wächter (nativ):** Kommt `ready()` nicht binnen 10 s, lädt das Plugin wieder das vorherige Bundle und vermerkt das
  Bundle als fehlgeschlagen. Geht die App im Probelauf in den Hintergrund, pausiert der Wächter und startet bei Rückkehr
  neu.
- **Startschutz (nativ):** Meldet sich ein gespeichertes Bundle drei Kaltstarts in Folge nicht mit `ready()`, oder
  fehlt sein Ordner, startet die App mit dem eingebauten Bundle (`MainViewController.instanceDescriptor()`).
- **Neues Binary:** Capacitor verwirft den gespeicherten Pfad selbst (siehe oben). Vorgemerkte Bundles prüft der Client
  beim Start erneut gegen die neue native Version und die eingebaute Version.
- **Aufräumen:** Behalten werden nur das laufende, das vorgemerkte und das im Probelauf befindliche Bundle, also
  höchstens drei Ordner à 1,6 MB. `NoCloud` ist vom iCloud-Backup ausgenommen.
- **Website unberührt:** Alles läuft über `src/platform/` und wird nur in der App geladen. `bootPlatform()` und
  `appReady()` kehren auf der Website sofort zurück.

### 3.3 Kompatibilität mit dem installierten Binary (`minNative`)

Ein Bundle darf nur native Fähigkeiten nutzen, die das installierte Binary hat. Das regelt
`ios/native-version.json`:

```json
{ "minNative": "1.16.0", "fingerprint": "…" }
```

- `fingerprint` ist ein Hash über alle nativen Eingaben: Swift-Dateien, `Info.plist`, Entitlements, Privacy Manifest,
  Storyboards, `project.pbxproj`, `CapApp-SPM/Package.swift`, `capacitor.config.json` und die Versionen der
  `@capacitor/*`-Pakete. App-Icons zählen nicht dazu.
- `npm test` schlägt fehl, sobald sich native Teile ändern, ohne dass die Datei nachgezogen wurde. Nachziehen:
  `npm run native:stamp`. Das setzt `minNative` auf die Version in `package.json`, die vorher auf die **nächste
  Store-Version** gesetzt sein muss. Damit lässt sich ein Bundle, das neue native Teile braucht, gar nicht mit
  falschem `minNative` veröffentlichen.
- Der Client lädt ein Bundle nur, wenn native Version ≥ `minNative`. Nach einer nativen Änderung bekommen ältere
  Binaries keine Updates mehr. Sie behalten ihr letztes passendes Bundle, und der Store-Hinweis führt sie zur neuen
  Version.

**Versionsregel:** `production` nimmt nur Bundles mit **höherer** Version als die laufende. Es gibt also nie ein
Downgrade, und kein unnötiges Update, wenn Store-Binary und Website dieselbe Version haben. `beta` nimmt auch dieselbe
Version mit anderem Inhalt, solange das Manifest neuer ist als das zuletzt gesehene.

**Zusammenspiel mit vorhandenen Funktionen:** „Was ist neu?“ zeigt auch Live-Update-Versionen; gewollt, so werden neue
Modi angekündigt. Der Store-Hinweis (`features/app-update.ts`) vergleicht die Store-Version mit der laufenden
Web-Version. Er meldet sich also nur, wenn der Store wirklich mehr bietet: eine höhere Version, die per Live-Update
nicht ankam, weil sie native Änderungen hat.

### 3.4 Kanäle

| Kanal | Quelle | Manifest | Wer bekommt es |
|---|---|---|---|
| `production` | Deploy von `release` (nach dem Release-Gate) | `https://mental-math.elias-steffen.de/ota/manifest.json` | alle App-Store-Installationen |
| `beta` | Deploy von `develop` (Vorschau-Build) | `https://preview.mental-math.elias-steffen.de/ota/manifest.json` | nur TestFlight-Installationen, die unter *Profil → Über → Beta-Updates* zugestimmt haben |

Wer Beta wieder ausschaltet, behält sein Beta-Bundle, bis `production` eine höhere Version hat (kein Downgrade).
Beta ist absichtlich freiwillig. Auch App Review läuft mit Sandbox-Beleg wie TestFlight und soll genau das
eingereichte Bundle sehen, nicht den Stand von `develop`. Jeder Kanal hat eigene Schlüssel
(`LIVE_UPDATE_PUBLIC_KEYS` bzw. `LIVE_UPDATE_BETA_PUBLIC_KEYS`): Ein Beta-Schlüssel kann kein Produktions-Manifest
signieren.

### 3.5 Not-Aus (Kill Switch)

| Ebene | Schalter | Wirkung |
|---|---|---|
| Server, sofort | Repo-Variable `LIVE_UPDATE=off`, dann *Actions → Deploy → Run workflow* auf `release` | signiertes Manifest `mode: off`: keine neuen Downloads, Vorgemerktes wird verworfen, laufende Bundles bleiben |
| Server, zurück | `LIVE_UPDATE=reset` und Deploy | `mode: reset`: Alle Geräte starten beim nächsten Mal mit dem eingebauten Bundle |
| Build | `LIVE_UPDATE_PUBLIC_KEYS` leer | Der Updater in diesem Build ist aus (kein vertrauenswürdiger Schlüssel) |
| Veröffentlichung | Secret `LIVE_UPDATE_SIGNING_KEY` fehlt | Deploy veröffentlicht kein Manifest, Clients sehen 404 und tun nichts |
| Gerät | automatisch | Wächter, Startschutz, schwarze Liste je Bundle |

Ein fehlerhaftes Bundle, das `ready()` meldet und erst später Probleme macht, behebt man mit einer neuen Version
(Patch erhöhen, normaler Ablauf) oder sofort mit `reset`.

### 3.6 Zusammenspiel mit dem Release-Gate

Das Gate (`release-gate.yml`, `scripts/release-gate.ts`) lässt Produktion nur live gehen, wenn derselbe Git-Tree als
TestFlight-Build existiert. Für Live-Updates bleibt es **unverändert** und ist sogar nützlich:

- Das Manifest entsteht im selben Deploy-Job **nach** dem Gate. Jedes Live-Update ist also als TestFlight-Build mit
  genau diesem Code nativ gebaut und testbar gewesen.
- Ein TestFlight-Upload ist **kein** Store-Release, er muss nicht ins Review. Ablauf für ein Live-Update:
  1. Auf `develop` die Patch-Version erhöhen, Release Notes, `npm run changelog`.
     `ios.yml` lädt einen TestFlight-Build hoch.
  2. Release-PR `develop` → `release`. Das Gate findet den Build, der Deploy veröffentlicht Website **und**
     `ota/manifest.json`.
  3. Die App-Store-Version bleibt, wie sie ist. Die Geräte holen das Update beim nächsten Start bzw. Öffnen.
- **Store-Release nur nötig**, wenn `npm test` wegen geänderter nativer Teile `native:stamp` verlangt hat
  (`minNative` steigt). Dann den TestFlight-Build wie bisher zur Prüfung einreichen.
- Spätere Option (nicht umgesetzt): Für reine Web-Änderungen (Fingerprint unverändert gegenüber der letzten
  Store-Version) könnte das Gate auf den TestFlight-Build verzichten. Das spart ~20 Minuten CI, verliert aber den
  nativen Smoke-Test.
- Notfall-Deploy ohne Gate (`skip_ios_gate`) veröffentlicht ebenfalls ein Manifest. `minNative` schützt trotzdem vor
  inkompatiblen Binaries.

### 3.7 Einrichtung (einmalig)

1. Schlüsselpaare erzeugen: `node scripts/live-update.ts keygen` zweimal, für Produktion und Beta. Das Skript gibt
   den privaten Schlüssel (PEM) und den öffentlichen (Base64-SPKI) aus.
2. GitHub → *Settings → Environments*:
   - `production`: Secret `LIVE_UPDATE_SIGNING_KEY` (privat, Produktion). Unter *Deployment branches* nur `release`.
   - `preview`: Secret `LIVE_UPDATE_SIGNING_KEY` (privat, Beta).
3. GitHub → *Settings → Variables*: `LIVE_UPDATE_PUBLIC_KEYS` (öffentlich, Produktion) und
   `LIVE_UPDATE_BETA_PUBLIC_KEYS` (öffentlich, Beta). Mehrere Schlüssel mit Komma trennen, für einen Wechsel:
   neuen Schlüssel zuerst zusätzlich ausliefern, dann umstellen.
4. Die nächste Store-Version enthält Updater und Plugin; Live-Updates erreichen nur Binaries ab dieser Version.
   `minNative` steht deshalb auf 1.15.1, der kleinsten Version nach dem heutigen Release 1.15.0. Ältere Binaries
   haben den Updater nicht und fragen nie nach. Ab dann gehen Patch-Versionen live.
5. Passt `LIVE_UPDATE_SIGNING_KEY` nicht zu den öffentlichen Schlüsseln im Build, bricht der Deploy ab. Sonst nähme
   die App nach diesem Update keine weiteren an.

### 3.8 Dateien

| Datei | Inhalt |
|---|---|
| `src/core/live-update.ts` | reine Logik: Manifest prüfen, Signatur, Versions- und Kompatibilitätsregeln, Start- und Prüfschritte (Zustandsmaschine) |
| `src/platform/live-update.ts` | Verdrahtung in der App: Plugin, Dateisystem, Download, Zustand in `localStorage` |
| `src/platform/native.ts`, `src/platform/index.ts`, `src/app.ts` | `bootPlatform()` vor dem Laden, `appReady()` nach dem ersten Bild |
| `src/views/settings.ts`, `src/i18n/locales/*/settings.ts` | Schalter *Beta-Updates* unter Profil → Über (nur TestFlight) |
| `ios/App/App/LiveUpdatePlugin.swift`, `MainViewController.swift` | Umschalten, Wächter, Startschutz, Reset |
| `ios/native-version.json`, `scripts/native-fingerprint.ts` | `minNative` und Fingerprint der nativen Teile |
| `scripts/live-update.ts` | Manifest bauen und signieren, Schlüssel erzeugen |
| `scripts/build-info.ts` | Schlüssel und Manifest-URLs in `PUBLIC_CONFIG` |
| `.github/workflows/deploy.yml`, `ios.yml` | Schlüssel in jeden Build, Manifest beim Deploy von `release`/`develop` |
| `tests/live-update.test.ts` | Manifest, Signatur, Versionen/Kompatibilität, Zustandsmaschine, Fingerprint, Workflows |

### 3.9 Risiken und offene Punkte

- **Review-Auslegung:** Die Leitplanken (Abschnitt 1) gelten für jedes Update. Wird ein Update zu groß, ist es ein
  Store-Release.
- **Speicher im Bundle:** `localStorage` und IndexedDB gehören zur Origin `capacitor://localhost` und gelten für alle
  Bundles gleich. Datenmigrationen müssen deshalb auch mit einem Rollback auf eine ältere Oberfläche leben können
  (gilt schon heute für die Website).
- **Gleichzeitiger Deploy:** Wechselt die Website während eines Downloads, passt ein Hash nicht mehr. Der Download
  bricht ab und läuft bei der nächsten Prüfung mit dem neuen Manifest.
- **Android:** nicht im Umfang. Der Mechanismus (`setServerBasePath`) existiert dort ebenfalls, der Wächter wäre neu
  zu schreiben.
