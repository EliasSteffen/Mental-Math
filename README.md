# Kopfrechner

Minimalistischer Kopfrechen-Trainer für Case Interviews (Consulting). Er ist in TypeScript geschrieben (Build per `tsc`, keine Laufzeit-Dependencies) und speichert alle Daten nur lokal im Browser.

- **8 Kategorien** + „Alle Kategorien“: Multiplikation, Division, Große Zahlen, Prozente, Brüche, Wachstum, Business (Payback, Break-even, TCO, FTE, SLA …), Überschlag
- **Score pro Aufgabe** aus Ergebnis, Zeit im Verhältnis zur Zielzeit und Schwierigkeit
- **Skill pro Kategorie und Aufgabentyp** (0–100) aus Genauigkeit und Tempo der letzten Versuche
- **Schwächen-Erkennung** mit Diagnose (Nullen-Fehler, ungenau, zu langsam) und Tipps, dazu ein Modus „Schwächen trainieren“
- **Analyse-Seite** mit Kategorien, Fehlermustern, Verlauf, letzten Fehlern und Export

Details: [docs/SPEC.md](docs/SPEC.md)

- **Lösungsweg mit den Zahlen der Aufgabe** nach jeder Antwort, dazu „Wie geht das?“ als Hilfe vor dem Antworten (halbe Punkte)
- **Lernbereich** (`#/lernen`): Methode, Vorgehen, Trick und typische Fehler für alle 30 Aufgabentypen, mit Beispiel zum Mitrechnen
- **Optionale KI-Erklärungen** (Google Gemini, nur auf Knopfdruck) – siehe unten
- **Tagesziel & Serie** (Minuten pro Tag, einstellbar), Aktivitäts-Heatmap, Level/XP
- **Schwierigkeitsstufen** Leicht/Mittel/Schwer – automatisch nach Skill oder fest
- **Fehler-Wiederholung über Tage** (Leitner-Boxen: 1, 2, 4, 7, 14 Tage) und eine **Tagesempfehlung** auf der Startseite
- **Verlauf pro Kategorie** (14 Tage) auf der Analyse-Seite
- **Themes** (Neon, OLED, Pastel, System), Einstellungen, Haptik/Sound, ±-Taste für Minus auf iOS
- **PWA**: auf dem Handy installierbar, funktioniert offline (außer KI)

## Lokal starten

```bash
npm install        # TypeScript + @types/node (nur Dev-Dependencies)
```

```bash
npm run dev        # Build + http://localhost:8080 (ohne KI)
```

```bash
npm run dev:ai     # Build + http://localhost:8788 (mit KI-Function; liest GOOGLE_API_KEY aus .env)
```

```bash
npm run build      # tsc (src → public/js, sw.ts → public/sw.js) + scripts/precache.mjs
npm run typecheck  # tsc über src, server, functions, tests
npm test           # Tests (node --test, TypeScript direkt per Type-Stripping)
```

`public/js/`, `public/sw.js` und `public/precache.json` sind **Build-Output** (gitignored). Der Service Worker liest Version und Precache-Liste zur Laufzeit aus `precache.json`.

> Einmalige Migration für den Repo-Owner vor dem ersten TS-Commit: `git rm -r --cached public/js public/sw.js`

## Deployment (GitHub Actions → Cloudflare Pages)

- **Repo:** `mental-math`
- **Cloudflare-Pages-Projekt:** `mental-math` (→ `mental-math.pages.dev`)
- **Domain:** `mental-math.elias-steffen.de`

Jeder Push auf `main` startet [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Der Workflow führt erst die Tests aus und deployt dann `public/` auf Cloudflare Pages. Schlagen die Tests fehl, wird nichts deployt. Manuell anstoßen lässt er sich über **Actions → Deploy → Run workflow**.

### Einmalige Einrichtung

1. **Cloudflare-API-Token** anlegen: Dashboard → *My Profile → API Tokens → Create Token → Create Custom Token*
   - Berechtigung: **Account · Cloudflare Pages · Edit**
   - Account Resources: nur dein Account
2. **Account-ID** kopieren: Dashboard → *Workers & Pages* (rechte Spalte) oder aus der URL `dash.cloudflare.com/<account-id>/…`
3. **Pages-Projekt einmalig anlegen** (der Workflow legt es nicht selbst an):

   ```bash
   npx wrangler login
   ```

   ```bash
   npx wrangler pages project create mental-math --production-branch=main
   ```

4. **GitHub-Secrets** im Repo setzen, entweder unter *Settings → Secrets and variables → Actions* oder per CLI:

   ```bash
   gh secret set CLOUDFLARE_API_TOKEN
   ```

   ```bash
   gh secret set CLOUDFLARE_ACCOUNT_ID
   ```

5. **Auf `main` pushen.** Danach ist die Seite unter `https://mental-math.pages.dev` erreichbar.
6. **Eigene Domain:** Pages-Projekt `mental-math` → *Custom domains → Set up a custom domain* → `mental-math.elias-steffen.de`. Liegt die Zone `elias-steffen.de` bei Cloudflare, wird der DNS-Eintrag automatisch angelegt.

> ⚠️ Das Pages-Projekt **nicht zusätzlich** per „Connect to Git“ mit GitHub verbinden, sonst wird doppelt deployt.

**Manuell deployen (ohne GitHub):**

```bash
npx wrangler pages deploy public --project-name=mental-math
```

`public/_headers` setzt Security-Header (u. a. eine strikte Content-Security-Policy). Die App lädt nichts von externen Quellen.

## KI-Erklärungen (optional)

Der Button „KI-Erklärung“ (nach einer Antwort) und „KI: anders erklären“ (im Lernbereich) rufen die Cloudflare Pages Function `functions/api/explain.ts` auf. Die Logik dazu steckt in `server/explain.ts`. Die Function fragt Google Gemini an, Standardmodell ist `gemini-flash-lite-latest`. **Der API-Key liegt nur als Cloudflare-Secret auf dem Server und erreicht nie den Browser.** Ist kein Key gesetzt, blendet die App die KI-Buttons automatisch aus.

**Einrichten (einmalig):**

```bash
npx wrangler pages secret put GOOGLE_API_KEY --project-name=mental-math
```

Alternativ im Dashboard unter *Workers & Pages → mental-math → Settings → Variables and Secrets → Add* mit Typ **Secret** und Name `GOOGLE_API_KEY`. Ein neuer Secret-Wert wirkt erst ab dem nächsten Deployment, danach also einmal neu deployen (*Actions → Deploy → Run workflow*). Optional wählst du mit der Variable `GEMINI_MODEL` ein anderes Modell.

**Schutz vor Missbrauch des Free Tiers:**
- Der Endpoint nimmt nur strukturierte Aufgabendaten an (bekannter Aufgabentyp, kurze Felder), keinen Freitext. Er taugt also nicht als allgemeiner Chat-Proxy.
- Er prüft den `Origin`-Header und begrenzt die Anfragen pro IP (15 pro Minute, 200 pro Tag; Best Effort pro Worker-Instanz).
- Der Browser speichert Antworten zwischen (`localStorage`), sodass die gleiche Frage kein zweites Mal Kontingent kostet.
- Im Google-Cloud-Projekt des Keys sollte **kein Billing aktiv** sein. Dann kann im schlimmsten Fall nur das Gratis-Kontingent ausgehen, Kosten entstehen keine. Zusätzlich lohnt es sich, den Key in der Google Cloud Console auf die „Generative Language API“ zu beschränken.

**Lokal:** `npm run dev:ai` liest `GOOGLE_API_KEY` automatisch aus `.env`. `.env` und `.dev.vars` stehen in `.gitignore` und dürfen nie committet werden.

## Daten

Fortschritt und Statistiken liegen nur im `localStorage` deines Browsers (Schlüssel `kopfrechner.v1`). Es gibt keinen Server und kein Tracking. Auf der Analyse-Seite lassen sich die Daten als JSON exportieren oder zurücksetzen. Verschiedene Geräte und Browser haben jeweils eigene Daten.

## Struktur

```
src/
  types.ts          zentrale Typen
  core/             DOM-frei: numbers, rng, units, catalog, generators/, solutions/,
                    methods, scoring, review, progress, modes, daily, chain
  data/storage.ts   localStorage (Schema + Migration)
  ui/               dom, charts, icons, keypad, fx, theme, toast
  features/         ai-client, activity, pwa
  views/            home, lernen, analyse, settings, daily, chain, train/
  router.ts  app.ts
  sw.ts             Service Worker (→ public/sw.js)
public/             ← wird ausgeliefert
  index.html  css/  icons/  manifest.webmanifest  _headers
  js/ sw.js precache.json   ← Build-Output
scripts/precache.mjs        erzeugt public/precache.json
functions/api/explain.ts    ← Cloudflare Pages Function (KI-Endpoint)
server/explain.ts           ← Validierung, Prompt, Gemini-Aufruf, Rate-Limit
tests/                      ← node --test (*.test.ts)
docs/                       ← SPEC, ARCHITECTURE, PLAN-v5
.github/workflows/deploy.yml  ← CI/CD: Tests + Build + Deploy auf Cloudflare Pages
```
