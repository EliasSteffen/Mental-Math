// Widerruft alte Entwicklungszertifikate, die Xcode in CI über den API-Schlüssel anlegt („Created via API“).
// Der Runner ist bei jedem Lauf frisch und hat kein Zertifikat, also legt `xcodebuild -allowProvisioningUpdates`
// jedes Mal ein neues an. Sein privater Schlüssel verschwindet mit dem Runner, das Zertifikat ist danach nutzlos,
// zählt aber gegen Apples Höchstzahl („Your account has reached the maximum number of certificates“).
// Aufruf in .github/workflows/ios.yml vor dem Archivieren:
//   node scripts/asc-certs.ts            widerrufen
//   node scripts/asc-certs.ts --dry-run  nur anzeigen
// Unberührt bleiben: Verteilungszertifikate, Zertifikate mit anderem Namen (z. B. das eigene vom Mac) und
// CI-Zertifikate der letzten Stunden (ein paralleler Lauf könnte sein eigenes gerade benutzen).
import { readFileSync } from 'node:fs';
import { ascToken } from './asc-check.ts';

const API = 'https://api.appstoreconnect.apple.com/v1';
/** Name, den Apple Zertifikaten gibt, die über einen API-Schlüssel entstehen */
export const CI_NAME = 'Created via API';
/** Entwicklungszertifikate laufen ein Jahr; jünger als das hier gilt als „gerade in Benutzung“ */
export const KEEP_RECENT_MS = 3 * 60 * 60_000;
const YEAR_MS = 365 * 24 * 60 * 60_000;
const DEV_TYPES: ReadonlySet<string> = new Set(['DEVELOPMENT', 'IOS_DEVELOPMENT']);

export interface Cert { id: string; type: string; name: string; displayName: string; expirationDate: string }

/** Welche Zertifikate weg können: Entwicklung, von CI angelegt, älter als KEEP_RECENT_MS. */
export function staleCiCerts(certs: readonly Cert[], now: number): Cert[] {
  return certs.filter((c) => {
    if (!DEV_TYPES.has(c.type)) return false;
    if (!`${c.name} ${c.displayName}`.includes(CI_NAME)) return false;
    const expires = Date.parse(c.expirationDate);
    if (!Number.isFinite(expires)) return false;
    const created = expires - YEAR_MS;
    return now - created > KEEP_RECENT_MS;
  });
}

interface Key { keyId: string; issuerId: string; pem: string }
interface ApiCert { id: string; attributes?: { certificateType?: string; name?: string; displayName?: string; expirationDate?: string } }

async function api(key: Key, method: string, path: string): Promise<unknown> {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${ascToken({ ...key, now: Date.now() })}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { errors?: Array<{ code?: string; detail?: string }> };
    const why = (body.errors ?? []).map((e) => `${e.code ?? ''} ${e.detail ?? ''}`.trim()).join('; ');
    throw new Error(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${why}`);
  }
  return res.status === 204 ? null : res.json();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const key: Key = {
    keyId: (process.env.ASC_KEY_ID ?? '').trim(),
    issuerId: (process.env.ASC_ISSUER_ID ?? '').trim(),
    pem: readFileSync(process.env.ASC_KEY_PATH ?? '', 'utf8'),
  };
  const fields = 'certificateType,name,displayName,expirationDate';
  const res = (await api(key, 'GET', `/certificates?limit=200&fields[certificates]=${fields}`)) as { data?: ApiCert[] };
  const certs: Cert[] = (res.data ?? []).map((c) => ({
    id: c.id,
    type: c.attributes?.certificateType ?? '',
    name: c.attributes?.name ?? '',
    displayName: c.attributes?.displayName ?? '',
    expirationDate: c.attributes?.expirationDate ?? '',
  }));
  const stale = staleCiCerts(certs, Date.now());
  console.log(`Zertifikate im Team: ${certs.length}, davon alte CI-Entwicklungszertifikate: ${stale.length}`);
  if (stale.length === 0) {
    // Nichts Passendes: zeigen, was da ist (Typ und Name, nichts Geheimes), damit man es von Hand prüfen kann
    for (const c of certs) console.log(`  ${c.type.padEnd(16)} ${c.displayName || c.name} (läuft ab ${c.expirationDate.slice(0, 10)})`);
    return;
  }
  for (const c of stale) {
    if (dryRun) { console.log(`  würde widerrufen: ${c.type} ${c.displayName || c.name} (läuft ab ${c.expirationDate.slice(0, 10)})`); continue; }
    await api(key, 'DELETE', `/certificates/${encodeURIComponent(c.id)}`);
    console.log(`  widerrufen: ${c.type} ${c.displayName || c.name} (lief ab ${c.expirationDate.slice(0, 10)})`);
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
