// Prüft vor dem Archivieren (.github/workflows/ios.yml), ob App Store Connect den API-Schlüssel annimmt und ob die App
// (Bundle-ID aus capacitor.config.json) dort angelegt ist. Gibt nur Statuscodes und Apples Fehlertexte aus, nie den Schlüssel.
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const API = 'https://api.appstoreconnect.apple.com/v1/apps';

/** JWT für die App Store Connect API (ES256, 10 Minuten). Ohne issuerId in der Form eines individuellen Schlüssels. */
export function ascToken(o: { keyId: string; issuerId: string | null; pem: string; now: number }): string {
  const iat = Math.floor(o.now / 1000);
  const who = o.issuerId ? { iss: o.issuerId } : { sub: 'user' };
  const enc = (x: unknown): string => Buffer.from(JSON.stringify(x)).toString('base64url');
  const data = `${enc({ alg: 'ES256', kid: o.keyId, typ: 'JWT' })}.${enc({ ...who, iat, exp: iat + 600, aud: 'appstoreconnect-v1' })}`;
  const sig = sign('sha256', Buffer.from(data), { key: createPrivateKey(o.pem), dsaEncoding: 'ieee-p1363' });
  return `${data}.${sig.toString('base64url')}`;
}

interface Probe { status: number; detail: string; apps: number }

async function probe(token: string, bundleId: string): Promise<Probe> {
  const res = await fetch(`${API}?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => ({}))) as { data?: unknown[]; errors?: Array<{ code?: string; detail?: string }> };
  const e = body.errors?.[0];
  return { status: res.status, detail: e ? `${e.code ?? ''} ${e.detail ?? ''}`.trim() : '', apps: body.data?.length ?? 0 };
}

const fail = (msg: string): never => {
  console.log(`::error::${msg}`);
  process.exit(1);
};

async function main(): Promise<void> {
  const keyId = (process.env.ASC_KEY_ID ?? '').trim();
  const issuerId = (process.env.ASC_ISSUER_ID ?? '').trim();
  const { appId } = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8')) as { appId: string };

  if (!/^[A-Z0-9]{10}$/.test(keyId)) fail('ASC_KEY_ID: erwartet die 10-stellige Schlüssel-ID (steht auch im Dateinamen AuthKey_<ID>.p8).');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)) {
    fail('ASC_ISSUER_ID: erwartet die Aussteller-ID (UUID) oben auf der Seite „Team-Schlüssel“.');
  }
  let pem = '';
  try {
    pem = readFileSync(process.env.ASC_KEY_PATH ?? '', 'utf8');
    createPrivateKey(pem);
  } catch {
    fail('ASC_KEY_P8: kein gültiger privater Schlüssel – den ganzen Inhalt der .p8-Datei inkl. BEGIN-/END-Zeile eintragen.');
  }

  const team = await probe(ascToken({ keyId, issuerId, pem, now: Date.now() }), appId);
  console.log(`App Store Connect als Team-Schlüssel: HTTP ${team.status} ${team.detail}`);
  if (team.status === 200) {
    if (team.apps === 0) fail(`Schlüssel ok, aber keine App mit Bundle-ID ${appId} – in App Store Connect unter Apps → + anlegen.`);
    console.log(`ok: Schlüssel gültig, App ${appId} vorhanden`);
    return;
  }
  if (team.status === 403) fail(`Schlüssel gültig, aber ohne Berechtigung (${team.detail}). Rolle des Schlüssels: Admin.`);

  const individual = await probe(ascToken({ keyId, issuerId: null, pem, now: Date.now() }), appId);
  console.log(`App Store Connect als individueller Schlüssel: HTTP ${individual.status} ${individual.detail}`);
  if (individual.status === 200) {
    fail('Das ist ein individueller Schlüssel; xcodebuild braucht einen Team-Schlüssel: App Store Connect → Benutzer und Zugriff → '
      + 'Integrationen → App Store Connect API → Team-Schlüssel (ggf. erst „Zugriff anfordern“), Rolle Admin. '
      + 'Danach ASC_KEY_ID, ASC_ISSUER_ID und ASC_KEY_P8 neu setzen.');
  }
  fail(`App Store Connect lehnt den Schlüssel ab (${team.detail || `HTTP ${team.status}`}). Prüfen: ASC_ISSUER_ID ist die Aussteller-ID `
    + 'oben auf der Seite „Team-Schlüssel“, ASC_KEY_ID gehört zur .p8-Datei, der Schlüssel ist nicht widerrufen.');
}

if (import.meta.main) await main();
