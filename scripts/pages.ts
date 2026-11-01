// Öffentliche Seiten der Website (auch für App Store Connect): /datenschutz, /hilfe, /neuigkeiten.
// Erzeugt dist/datenschutz.html, dist/hilfe.html, dist/neuigkeiten.html (Cloudflare Pages liefert sie ohne .html aus).
// Deutsch zuerst, Englisch darunter (#en). Läuft nach copy-static; Stil in public/css/pages.css (CSP: keine Inline-Styles).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RELEASES } from '../src/releases.ts';
import type { Release } from '../src/types.ts';

const DIST: string = fileURLToPath(new URL('../dist/', import.meta.url));

export const CONTACT = { name: 'Elias Steffen', email: 'mail(at)elias-steffen.de' };
/** Stand der Datenschutzerklärung – bei inhaltlichen Änderungen anpassen */
export const PRIVACY_DATE = { de: '1. November 2026', en: 'November 1, 2026' };
const SOURCE_URL = 'https://github.com/EliasSteffen/Mental-Math';

type Lang = 'de' | 'en';

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NAV: Record<Lang, Array<[string, string]>> = {
  de: [['/neuigkeiten', 'Neuigkeiten'], ['/hilfe', 'Hilfe'], ['/datenschutz', 'Datenschutz']],
  en: [['/neuigkeiten#en', 'What’s new'], ['/hilfe#en', 'Help'], ['/datenschutz#en', 'Privacy']],
};

interface Page { slug: string; title: string; description: string; de: string; en: string }

export function layout(p: Page): string {
  const nav = NAV.de.map(([href, label]) =>
    `<a href="${href}"${href === `/${p.slug}` ? ' aria-current="page"' : ''}>${label}</a>`).join('');
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.title)} – Mental Math</title>
<meta name="description" content="${esc(p.description)}">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/css/pages.css">
</head>
<body>
<header class="top">
  <a class="brand" href="/"><img src="/icons/icon-192.png" alt="" width="36" height="36">Mental Math</a>
  <nav aria-label="Seiten">${nav}</nav>
</header>
<main class="doc">
  <p class="switch"><a href="#en" hreflang="en">English version ↓</a></p>
  <article lang="de">${p.de}</article>
  <hr>
  <article lang="en" id="en">${p.en}</article>
</main>
<footer class="foot">
  <a href="/">Zur App · Open the app</a>
  <span>${esc(CONTACT.name)} · ${esc(CONTACT.email)}</span>
</footer>
</body>
</html>
`;
}

/* ---------- Neuigkeiten ---------- */

function fmtDate(iso: string, lang: Lang): string {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

function releaseList(releases: readonly Release[], lang: Lang): string {
  return releases.map((r) => `
    <section class="release">
      <h2><span class="ver">${esc(r.version)}</span> ${esc(r.title[lang])}</h2>
      <p class="date">${fmtDate(r.date, lang)}</p>
      <ul>${r.highlights.map((h) => `<li>${esc(h[lang])}</li>`).join('')}</ul>
    </section>`).join('');
}

export function releasesPage(releases: readonly Release[] = RELEASES): string {
  return layout({
    slug: 'neuigkeiten',
    title: 'Neuigkeiten',
    description: 'Was ist neu in Mental Math? Alle Versionen mit ihren Neuerungen.',
    de: `<h1>Neuigkeiten</h1>
      <p class="lead">Was sich in Mental Math geändert hat – die neueste Version zuerst. In der App unter Profil → Neuigkeiten.</p>
      ${releaseList(releases, 'de')}`,
    en: `<h1>What’s new</h1>
      <p class="lead">What has changed in Mental Math – newest version first. In the app under Profile → What’s new.</p>
      ${releaseList(releases, 'en')}`,
  });
}

/* ---------- Hilfe ---------- */

export function helpPage(): string {
  return layout({
    slug: 'hilfe',
    title: 'Hilfe & Kontakt',
    description: 'Hilfe zu Mental Math: Konto, Passkeys, Erinnerungen, Daten übertragen und löschen – und wie du mich erreichst.',
    de: `<h1>Hilfe &amp; Kontakt</h1>
      <p class="lead">Mental Math trainiert Kopfrechnen für Case Interviews. Fragen, Fehler oder Ideen? Schreib mir.</p>
      <div class="contact"><strong>Kontakt</strong><span>${esc(CONTACT.name)}</span><span>E-Mail: ${esc(CONTACT.email)}</span></div>
      <h2>Häufige Fragen</h2>
      <h3>Brauche ich ein Konto?</h3>
      <p>Nein. Alles funktioniert ohne Konto, deine Daten bleiben dann auf dem Gerät. Ein Konto brauchst du nur, wenn du mehrere Geräte synchronisieren willst.</p>
      <h3>Wie melde ich mich an?</h3>
      <p>Mit einem Passkey (Face ID, Touch ID oder Gerätecode), ohne E-Mail und Passwort: Profil → Anmelden oder Konto erstellen.</p>
      <h3>Ich habe meinen Passkey verloren.</h3>
      <p>Beim Anlegen des Kontos zeigt die App einmalig einen Wiederherstellungscode. Damit legst du unter Profil → Daten &amp; Account → „Passkey verloren?“ einen neuen Passkey an.</p>
      <h3>Wie übertrage ich meine Daten auf ein neues Gerät?</h3>
      <p>Mit Konto: auf dem neuen Gerät anmelden, die Daten werden synchronisiert. Ohne Konto: Profil → Exportieren und auf dem neuen Gerät Profil → Importieren.</p>
      <h3>Die Erinnerungen kommen nicht an.</h3>
      <p>iPhone-App: Einstellungen → Mental Math → Mitteilungen erlauben. Website: Benachrichtigungen für die Seite im Browser erlauben; auf dem iPhone geht das nur, wenn die Website über Teilen → „Zum Home-Bildschirm“ installiert ist. Danach unter Profil → Erinnerungen einschalten und „Test-Benachrichtigung senden“ antippen.</p>
      <h3>Wie lösche ich meine Daten?</h3>
      <p>Profil → Alle Daten löschen entfernt alles auf dem Gerät. Mit Konto löscht Profil → Konto löschen außerdem Konto, Passkeys und synchronisierte Daten auf dem Server.</p>
      <h3>Was passiert bei „KI-Erklärung“?</h3>
      <p>Nur auf Knopfdruck wird die Aufgabe (ohne Namen oder Kontodaten) an eine KI geschickt, die sie anders erklärt. Details in der <a href="/datenschutz">Datenschutzerklärung</a>.</p>
      <h2>Mehr</h2>
      <p><a href="/neuigkeiten">Neuigkeiten</a> · <a href="/datenschutz">Datenschutz</a> · <a href="${SOURCE_URL}">Quellcode auf GitHub</a></p>`,
    en: `<h1>Help &amp; contact</h1>
      <p class="lead">Mental Math trains mental arithmetic for case interviews. Questions, bugs or ideas? Write to me.</p>
      <div class="contact"><strong>Contact</strong><span>${esc(CONTACT.name)}</span><span>Email: ${esc(CONTACT.email)}</span></div>
      <h2>FAQ</h2>
      <h3>Do I need an account?</h3>
      <p>No. Everything works without an account; your data then stays on your device. You only need an account to sync several devices.</p>
      <h3>How do I sign in?</h3>
      <p>With a passkey (Face ID, Touch ID or device passcode) – no email, no password: Profile → Sign in or create account.</p>
      <h3>I lost my passkey.</h3>
      <p>When you create your account, the app shows a recovery code once. Use it under Profile → Data &amp; account → “Lost your passkey?” to create a new passkey.</p>
      <h3>How do I move my data to a new device?</h3>
      <p>With an account: sign in on the new device and your data syncs. Without an account: Profile → Export, then Profile → Import on the new device.</p>
      <h3>Reminders don’t arrive.</h3>
      <p>iPhone app: Settings → Mental Math → allow notifications. Website: allow notifications for the site in your browser; on iPhone this only works once the website is installed via Share → “Add to Home Screen”. Then turn them on under Profile → Reminders and tap “Send test notification”.</p>
      <h3>How do I delete my data?</h3>
      <p>Profile → Delete all data removes everything on the device. With an account, Profile → Delete account also deletes your account, passkeys and synced data on the server.</p>
      <h3>What happens with “AI explanation”?</h3>
      <p>Only when you tap it, the task (no name or account data) is sent to an AI that explains it differently. Details in the <a href="/datenschutz#en">privacy policy</a>.</p>
      <h2>More</h2>
      <p><a href="/neuigkeiten#en">What’s new</a> · <a href="/datenschutz#en">Privacy</a> · <a href="${SOURCE_URL}">Source code on GitHub</a></p>`,
  });
}

/* ---------- Datenschutz ---------- */

export function privacyPage(): string {
  return layout({
    slug: 'datenschutz',
    title: 'Datenschutz',
    description: 'Datenschutzerklärung von Mental Math (Website und iOS-App): welche Daten wann verarbeitet werden und wie du sie löschst.',
    de: `<h1>Datenschutzerklärung</h1>
      <p class="lead">Für die Website mental-math.elias-steffen.de und die iOS-App „Mental Math“. Kurz gesagt: Ohne Konto bleiben deine Trainingsdaten auf deinem Gerät. Es gibt kein Tracking, keine Werbung und keine Analyse-Tools.</p>
      <p class="date">Stand: ${PRIVACY_DATE.de}</p>

      <h2>1. Verantwortlicher</h2>
      <div class="contact"><span>${esc(CONTACT.name)}</span><span>E-Mail: ${esc(CONTACT.email)}</span></div>

      <h2>2. Aufruf der Website und der App</h2>
      <p>Website und Server-Schnittstellen werden von Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) ausgeliefert. Dabei verarbeitet Cloudflare technisch notwendige Verbindungsdaten (IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser- bzw. App-Kennung), um die Inhalte auszuliefern und Angriffe abzuwehren. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (sicherer und stabiler Betrieb). Cloudflare kann Daten auch in den USA verarbeiten und ist nach dem EU-US Data Privacy Framework zertifiziert.</p>
      <p>Die iOS-App enthält alle Inhalte selbst und verbindet sich nur für die optionalen Funktionen unten mit dem Server. Für den Download aus dem App Store gelten die Datenschutzbestimmungen von Apple.</p>

      <h2>3. Daten auf deinem Gerät</h2>
      <p>Trainingsverlauf, Ergebnisse, Statistiken und Einstellungen speichert die App im Speicher deines Browsers bzw. der App auf deinem Gerät. Ohne Konto verlassen sie das Gerät nicht. Du kannst sie unter Profil exportieren, importieren und löschen; sie verschwinden auch, wenn du die App oder die Website-Daten im Browser löschst.</p>

      <h2>4. Konto und Synchronisierung (optional)</h2>
      <p>Wenn du ein Konto anlegst, speichern wir:</p>
      <ul>
        <li>deinen frei gewählten Benutzernamen (keine E-Mail-Adresse, kein Klarname nötig),</li>
        <li>für jeden Passkey den öffentlichen Schlüssel, seine Kennung und Zeitpunkte der Nutzung – der private Schlüssel bleibt auf deinem Gerät bzw. in deinem Passwortmanager (z. B. iCloud-Schlüsselbund), für den die Bestimmungen seines Anbieters gelten,</li>
        <li>Anmeldesitzungen und deinen Wiederherstellungscode nur als Hash-Wert,</li>
        <li>deine Trainingsdaten zur Synchronisierung zwischen deinen Geräten (Runden, Ergebnisse je Aufgabe mit Aufgabe, Antwort, Zeit und Punkten, Einstellungen) sowie eine zufällige Geräte-ID.</li>
      </ul>
      <p>Die Daten liegen bei Supabase, Inc. in einem Rechenzentrum in der EU. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Bereitstellung des Kontos, das du anlegst).</p>
      <p>Auf der Website hält ein technisch notwendiges Cookie („mm_rt“, HttpOnly, 30 Tage) deine Anmeldung; es dient keinem anderen Zweck (§ 25 Abs. 2 TDDDG). In der iOS-App liegt dieser Anmeldeschlüssel stattdessen im Schlüsselbund des Geräts.</p>
      <p>Unter Profil → Konto löschen löschst du dein Konto, deine Passkeys und alle synchronisierten Daten auf dem Server. Die Daten auf dem Gerät bleiben, bis du sie dort löschst.</p>

      <h2>5. Erinnerungen (optional)</h2>
      <p><strong>Website (Web Push):</strong> Wenn du Erinnerungen einschaltest, speichern wir auf dem Server dein Push-Abonnement (die Adresse beim Push-Dienst deines Browsers, z. B. Apple, Google oder Mozilla, mit den zugehörigen Schlüsseln), eine zufällige Geräte-ID, einen Hash-Wert eines Geräte-Geheimnisses, Zeitzone, Sprache, deine Erinnerungs-Einstellungen und einen knappen Lernstand (Serie, ob das Tagesziel erreicht ist, Zahl fälliger Wiederholungen, bis zu drei schwache Aufgabentypen). Zugestellt werden die Mitteilungen über den Push-Dienst des Browser-Herstellers. Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die du durch Ausschalten jederzeit widerrufen kannst; dabei wird das Abonnement auf dem Server gelöscht.</p>
      <p><strong>iOS-App:</strong> Die App plant Erinnerungen als lokale Mitteilungen auf deinem Gerät. Dafür werden keine Daten an uns gesendet.</p>

      <h2>6. KI-Erklärungen (optional)</h2>
      <p>Nur wenn du „KI-Erklärung“ antippst, schickt die App die Aufgabe (Aufgabentyp, Aufgabentext und Zahlen, richtiges Ergebnis, deine Antwort und die Sprache) über unseren Server an die Gemini API von Google (Google LLC). Name, Konto- oder Gerätedaten werden nicht übermittelt; Google erhält die Anfrage von unserem Server, nicht von deinem Gerät. Da die Erklärungen über das kostenlose Angebot der Gemini API laufen, kann Google die übermittelten Aufgabeninhalte nach eigenen Bedingungen auch zur Verbesserung seiner Dienste verwenden. Die Antwort speichert die App auf deinem Gerät zwischen.</p>
      <p>Um Missbrauch zu begrenzen, zählt unser Server die Anfragen je IP-Adresse; diese Zähler werden nach spätestens 24 Stunden gelöscht. Rechtsgrundlagen sind Art. 6 Abs. 1 lit. b DSGVO (du forderst die Erklärung an) und lit. f (Schutz vor Missbrauch).</p>

      <h2>7. Keine Weitergabe, kein Tracking</h2>
      <p>Wir verkaufen keine Daten, zeigen keine Werbung und setzen keine Analyse- oder Tracking-Werkzeuge ein. Daten gehen nur an die oben genannten Dienstleister und nur für die genannten Zwecke.</p>

      <h2>8. Deine Rechte</h2>
      <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit (z. B. über Profil → Exportieren) und Widerspruch sowie das Recht, eine Einwilligung jederzeit zu widerrufen. Schreib dazu an die oben genannte E-Mail-Adresse. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, etwa der deines Wohnorts.</p>`,
    en: `<h1>Privacy policy</h1>
      <p class="lead">For the website mental-math.elias-steffen.de and the iOS app “Mental Math”. In short: without an account, your training data stays on your device. There is no tracking, no advertising and no analytics.</p>
      <p class="date">Last updated: ${PRIVACY_DATE.en}</p>

      <h2>1. Controller</h2>
      <div class="contact"><span>${esc(CONTACT.name)}</span><span>Email: ${esc(CONTACT.email)}</span></div>

      <h2>2. Using the website and the app</h2>
      <p>The website and server interfaces are delivered by Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA). Cloudflare processes technically necessary connection data (IP address, time, requested address, browser or app identifier) to deliver content and fend off attacks. The legal basis is Art. 6(1)(f) GDPR (secure and stable operation). Cloudflare may also process data in the USA and is certified under the EU-US Data Privacy Framework.</p>
      <p>The iOS app contains all content itself and only connects to the server for the optional features below. Apple’s privacy terms apply to downloading from the App Store.</p>

      <h2>3. Data on your device</h2>
      <p>Training history, results, statistics and settings are stored in your browser’s or the app’s storage on your device. Without an account they never leave the device. You can export, import and delete them under Profile; they are also removed when you delete the app or the website data in your browser.</p>

      <h2>4. Account and sync (optional)</h2>
      <p>If you create an account, we store:</p>
      <ul>
        <li>the username you choose (no email address or real name needed),</li>
        <li>for each passkey its public key, identifier and times of use – the private key stays on your device or in your password manager (e.g. iCloud Keychain), whose provider’s terms apply,</li>
        <li>sign-in sessions and your recovery code only as hash values,</li>
        <li>your training data to sync between your devices (rounds, per-task results with task, answer, time and points, settings) and a random device ID.</li>
      </ul>
      <p>The data is stored with Supabase, Inc. in a data centre in the EU. The legal basis is Art. 6(1)(b) GDPR (providing the account you create).</p>
      <p>On the website, a strictly necessary cookie (“mm_rt”, HttpOnly, 30 days) keeps you signed in and serves no other purpose. In the iOS app, this sign-in key is kept in the device keychain instead.</p>
      <p>Profile → Delete account deletes your account, your passkeys and all synced data on the server. Data on your device stays until you delete it there.</p>

      <h2>5. Reminders (optional)</h2>
      <p><strong>Website (web push):</strong> When you turn reminders on, we store on the server your push subscription (the address at your browser’s push service, e.g. Apple, Google or Mozilla, with its keys), a random device ID, a hash of a device secret, time zone, language, your reminder settings and a brief learning status (streak, whether the daily goal is met, number of due reviews, up to three weak task types). Notifications are delivered through the browser vendor’s push service. The legal basis is your consent (Art. 6(1)(a) GDPR), which you can withdraw at any time by turning reminders off; the subscription is then deleted from the server.</p>
      <p><strong>iOS app:</strong> The app schedules reminders as local notifications on your device. No data is sent to us for this.</p>

      <h2>6. AI explanations (optional)</h2>
      <p>Only when you tap “AI explanation” does the app send the task (task type, task text and numbers, correct result, your answer and the language) via our server to Google’s Gemini API (Google LLC). No name, account or device data is transmitted; Google receives the request from our server, not from your device. Because the explanations use the free tier of the Gemini API, Google may also use the submitted task content to improve its services under its own terms. The app caches the answer on your device.</p>
      <p>To limit abuse, our server counts requests per IP address; these counters are deleted after 24 hours at the latest. The legal bases are Art. 6(1)(b) GDPR (you request the explanation) and Art. 6(1)(f) (abuse prevention).</p>

      <h2>7. No sharing, no tracking</h2>
      <p>We do not sell data, show ads or use analytics or tracking tools. Data only goes to the service providers named above and only for the purposes stated.</p>

      <h2>8. Your rights</h2>
      <p>You have the right of access, rectification, erasure, restriction of processing, data portability (e.g. via Profile → Export) and objection, and you can withdraw consent at any time. Write to the email address above. You can also lodge a complaint with a data protection supervisory authority, for example the one where you live.</p>`,
  });
}

function main(): void {
  writeFileSync(`${DIST}datenschutz.html`, privacyPage());
  writeFileSync(`${DIST}hilfe.html`, helpPage());
  writeFileSync(`${DIST}neuigkeiten.html`, releasesPage());
  console.log('pages: datenschutz.html, hilfe.html, neuigkeiten.html');
}

if (import.meta.main) main();
