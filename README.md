# Kopfrechner

Minimalistischer Kopfrechen-Trainer für Case Interviews (Consulting). Er ist rein statisch, braucht keinen Build-Schritt und keine Dependencies und speichert alle Daten nur lokal im Browser.

- **8 Kategorien** + „Alle Kategorien“: Multiplikation, Division, Große Zahlen, Prozente, Brüche, Wachstum, Business (Payback, Break-even, TCO, FTE, SLA …), Überschlag
- **Score pro Aufgabe** aus Ergebnis, Zeit im Verhältnis zur Zielzeit und Schwierigkeit
- **Skill pro Kategorie und Aufgabentyp** (0–100) aus Genauigkeit und Tempo der letzten Versuche
- **Schwächen-Erkennung** mit Diagnose (Nullen-Fehler, ungenau, zu langsam) und Tipps, dazu ein Modus „Schwächen trainieren“
- **Analyse-Seite** mit Kategorien, Fehlermustern, Verlauf, letzten Fehlern und Export

Details: [docs/SPEC.md](docs/SPEC.md)

- **Lösungsweg mit den Zahlen der Aufgabe** nach jeder Antwort, dazu „Wie geht das?“ als Hilfe vor dem Antworten (halbe Punkte)
- **Lernbereich** (`#/lernen`): Methode, Vorgehen, Trick und typische Fehler für alle 30 Aufgabentypen, mit Beispiel zum Mitrechnen
- **Optionale KI-Erklärungen** (Google Gemini, nur auf Knopfdruck) – siehe unten

## Lokal starten

```bash
npm run dev        # → http://localhost:8080 (ohne KI)
```

```bash
npm run dev:ai     # → http://localhost:8788 (mit KI-Function; liest GOOGLE_API_KEY aus .env)
```

```bash
npm test           # Logik-Tests (node:test, keine Dependencies)
```

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

Der Button „KI-Erklärung“ (nach einer Antwort) und „KI: anders erklären“ (im Lernbereich) rufen die Cloudflare Pages Function `functions/api/explain.js` auf. Die Logik dazu steckt in `server/explain.js`. Die Function fragt Google Gemini an, Standardmodell ist `gemini-flash-lite-latest`. **Der API-Key liegt nur als Cloudflare-Secret auf dem Server und erreicht nie den Browser.** Ist kein Key gesetzt, blendet die App die KI-Buttons automatisch aus.

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
public/          ← wird ausgeliefert
  index.html
  css/style.css
  js/numbers.js     Formatieren & Parsen (de-DE)
  js/generators.js  Kategorien, Aufgabentypen, Generatoren
  js/solutions.js   Lösungsweg mit den Zahlen der Aufgabe
  js/methods.js     Lernmethoden pro Aufgabentyp
  js/scoring.js     Bewertung, Punkte, Skill, Schwächen
  js/storage.js     localStorage
  js/ai.js          Client für /api/explain
  js/app.js         Router & Views
functions/api/explain.js  ← Cloudflare Pages Function (KI-Endpoint)
server/explain.js         ← Validierung, Prompt, Gemini-Aufruf, Rate-Limit
tests/           ← node --test
docs/SPEC.md     ← Spezifikation & Design
.github/workflows/deploy.yml  ← CI/CD: Tests + Deploy auf Cloudflare Pages
```
