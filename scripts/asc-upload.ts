// Lädt die signierte .ipa über die App Store Connect API (buildUploads) hoch – an Xcodes älterem Upload-Dienst vorbei,
// der den Team-Schlüssel mit „Cannot verify client's JWT headers“ ablehnt. Aufruf in .github/workflows/ios.yml:
//   node scripts/asc-upload.ts <ipa> <Version> <Build-Nummer>
// Ablauf: Upload anlegen → Datei anmelden → Teile an die vorgegebenen Adressen senden → mit MD5 als hochgeladen
// markieren → Verarbeitung abwarten. Gibt nur Statusmeldungen aus, nie den Schlüssel.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ascToken } from './asc-check.ts';

const API = 'https://api.appstoreconnect.apple.com/v1';
/** So lange auf das Ergebnis der Verarbeitung warten; danach läuft sie bei Apple weiter */
const WAIT_MS = 20 * 60_000;
const POLL_MS = 30_000;

interface Key { keyId: string; issuerId: string; pem: string }
interface Detail { code?: string; description?: string }
interface UploadOperation {
  method: string;
  url: string;
  offset: number;
  length: number;
  requestHeaders?: Array<{ name: string; value: string }>;
}

async function api<T>(key: Key, method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${ascToken({ ...key, now: Date.now() })}`, 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, init);
  const json = (await res.json().catch(() => ({}))) as T & { errors?: Array<{ code?: string; detail?: string }> };
  if (!res.ok) {
    const why = (json.errors ?? []).map((e) => `${e.code ?? ''} ${e.detail ?? ''}`.trim()).join('; ');
    throw new Error(`${method} ${path.split('?')[0]}: HTTP ${res.status} ${why}`);
  }
  return json;
}

const details = (list: Detail[] | undefined): string =>
  (list ?? []).map((d) => `${d.code ?? ''}: ${d.description ?? ''}`).join('; ');

async function main(): Promise<void> {
  const [ipaPath = '', version = '', build = ''] = process.argv.slice(2);
  if (!ipaPath || !version || !build) throw new Error('Aufruf: node scripts/asc-upload.ts <ipa> <Version> <Build-Nummer>');
  const key: Key = {
    keyId: (process.env.ASC_KEY_ID ?? '').trim(),
    issuerId: (process.env.ASC_ISSUER_ID ?? '').trim(),
    pem: readFileSync(process.env.ASC_KEY_PATH ?? '', 'utf8'),
  };
  const { appId: bundleId } = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8')) as { appId: string };

  const apps = await api<{ data: Array<{ id: string }> }>(key, 'GET', `/apps?filter[bundleId]=${encodeURIComponent(bundleId)}&fields[apps]=bundleId`);
  const app = apps.data[0];
  if (!app) throw new Error(`Keine App mit Bundle-ID ${bundleId} in App Store Connect`);

  const file = readFileSync(ipaPath);
  const md5 = createHash('md5').update(file).digest('hex');
  console.log(`${basename(ipaPath)}: ${(file.length / 1024 / 1024).toFixed(1)} MB, Version ${version} (${build})`);

  const upload = await api<{ data: { id: string } }>(key, 'POST', '/buildUploads', {
    data: {
      type: 'buildUploads',
      attributes: { cfBundleShortVersionString: version, cfBundleVersion: build, platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: app.id } } },
    },
  });

  const uploadFile = await api<{ data: { id: string; attributes: { uploadOperations?: UploadOperation[] } } }>(key, 'POST', '/buildUploadFiles', {
    data: {
      type: 'buildUploadFiles',
      attributes: { assetType: 'ASSET', fileName: basename(ipaPath), fileSize: file.length, uti: 'com.apple.ipa' },
      relationships: { buildUpload: { data: { type: 'buildUploads', id: upload.data.id } } },
    },
  });

  const ops = uploadFile.data.attributes.uploadOperations ?? [];
  for (const [i, op] of ops.entries()) {
    const headers = Object.fromEntries((op.requestHeaders ?? []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method, headers, body: file.subarray(op.offset, op.offset + op.length) });
    if (!res.ok) throw new Error(`Teil ${i + 1}/${ops.length}: HTTP ${res.status}`);
  }
  console.log(`${ops.length} Teil(e) gesendet`);

  await api(key, 'PATCH', `/buildUploadFiles/${uploadFile.data.id}`, {
    data: {
      type: 'buildUploadFiles',
      id: uploadFile.data.id,
      attributes: { uploaded: true, sourceFileChecksums: { file: { algorithm: 'MD5', hash: md5 } } },
    },
  });

  const end = Date.now() + WAIT_MS;
  for (;;) {
    const r = await api<{ data: { attributes: { state?: { state?: string; errors?: Detail[]; warnings?: Detail[] } } } }>(
      key, 'GET', `/buildUploads/${upload.data.id}?fields[buildUploads]=state`);
    const st = r.data.attributes.state;
    if (st?.warnings?.length) console.log(`Hinweise von Apple: ${details(st.warnings)}`);
    if (st?.state === 'COMPLETE') {
      console.log('ok: Build hochgeladen und verarbeitet – in App Store Connect unter TestFlight sichtbar');
      return;
    }
    if (st?.state === 'FAILED') throw new Error(`Apple hat den Build abgelehnt: ${details(st.errors) || 'ohne Begründung'}`);
    if (Date.now() > end) {
      console.log(`Hochgeladen; Verarbeitung läuft noch (${st?.state ?? 'unbekannt'}) – der Build erscheint danach in TestFlight`);
      return;
    }
    await new Promise((r2) => setTimeout(r2, POLL_MS));
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.log(`::error::${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
