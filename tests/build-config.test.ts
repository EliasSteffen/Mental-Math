// Tests für die reinen Build-Helfer (ohne vollen Build-Lauf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deployChannel, validPublicKey, validPublicUrl } from '../scripts/build-info.ts';
import { addConnectSrc, addNoIndex, appleAppSiteAssociation, previewManifest } from '../scripts/copy-static.ts';

const URL_OK = 'https://anrfpvgcaplyjkmraald.supabase.co';
const CSP_LINE = "  Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const HEADERS = `/*\n  X-Frame-Options: DENY\n${CSP_LINE}\n\n/sw.js\n  Cache-Control: no-cache\n`;

function cspLines(text: string): string[] {
  return text.split('\n').filter((l: string): boolean => /Content-Security-Policy:/.test(l));
}

test('connect-src wird eingefügt, wenn keiner vorhanden ist', () => {
  const out = addConnectSrc(HEADERS, URL_OK);
  const [csp] = cspLines(out);
  assert.ok(csp, 'CSP-Zeile fehlt');
  assert.ok(csp.includes(`connect-src 'self' ${URL_OK};`) || csp.endsWith(`connect-src 'self' ${URL_OK}`));
  assert.ok(csp.includes("default-src 'self'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  assert.ok(out.includes('X-Frame-Options: DENY'));
});

test('URL wird an ein bestehendes connect-src angehängt', () => {
  const text = HEADERS.replace("frame-ancestors 'none'", "frame-ancestors 'none'; connect-src 'self' https://alt.supabase.co");
  const out = addConnectSrc(text, URL_OK);
  const [csp] = cspLines(out);
  assert.ok(csp?.includes(`connect-src 'self' https://alt.supabase.co ${URL_OK}`));
  assert.equal((csp?.match(/connect-src/g) ?? []).length, 1);
});

test('leere URL lässt den Text unverändert', () => {
  assert.equal(addConnectSrc(HEADERS, ''), HEADERS);
});

test('ungültige URL lässt den Text unverändert', () => {
  assert.equal(addConnectSrc(HEADERS, 'https://evil.example.com'), HEADERS);
  assert.equal(addConnectSrc(HEADERS, 'http://abc.supabase.co'), HEADERS);
  assert.equal(addConnectSrc(HEADERS, 'https://abc.supabase.co/x'), HEADERS);
});

test('validPublicUrl akzeptiert nur Supabase-Projekt-URLs', () => {
  assert.equal(validPublicUrl(URL_OK), true);
  assert.equal(validPublicUrl('https://a.b.supabase.co'), false);
  assert.equal(validPublicUrl('https://evil.com'), false);
  assert.equal(validPublicUrl(''), false);
});

test('validPublicKey akzeptiert nur publishable oder anon-Keys', () => {
  assert.equal(validPublicKey('sb_publishable_abc123'), true);
  assert.equal(validPublicKey('eyJhbGciOiJFUzI1NiJ9'), true);
  assert.equal(validPublicKey('sb_secret_abc123'), false);
  assert.equal(validPublicKey('irgendwas'), false);
  assert.equal(validPublicKey(''), false);
});

test('apple-app-site-association: webcredentials nur mit gültiger Team-ID', () => {
  const aasa = appleAppSiteAssociation('ABCDE12345', 'de.example.app');
  assert.deepEqual(JSON.parse(aasa ?? 'null'), { webcredentials: { apps: ['ABCDE12345.de.example.app'] } });
  assert.equal(appleAppSiteAssociation('abc', 'de.example.app'), null);
  assert.equal(appleAppSiteAssociation('ABCDE12345', 'de example'), null);
});

test('Kanal: nur DEPLOY_CHANNEL=preview ergibt eine Vorschau', () => {
  assert.equal(deployChannel('preview'), 'preview');
  assert.equal(deployChannel(' preview '), 'preview');
  assert.equal(deployChannel(undefined), 'production');
  assert.equal(deployChannel(''), 'production');
  assert.equal(deployChannel('Preview'), 'production');
});

test('Vorschau: noindex im Block /*, genau einmal; ohne Block wird einer angelegt', () => {
  const out = addNoIndex(HEADERS);
  const lines = out.split('\n');
  assert.equal(lines[0], '/*');
  assert.ok(lines.slice(1, lines.indexOf('')).includes('  X-Robots-Tag: noindex'), 'im Block für alle Pfade');
  assert.ok(lines.indexOf('  X-Robots-Tag: noindex') < lines.indexOf('/sw.js'));
  assert.equal(addNoIndex(out), out);
  assert.match(addNoIndex('/sw.js\n  Cache-Control: no-cache\n'), /^\/\*\n {2}X-Robots-Tag: noindex\n\n\/sw\.js/);
  const real = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
  assert.equal(addNoIndex(real).split('X-Robots-Tag').length, 2);
});

test('Vorschau: eigener Name im Manifest, Rest unverändert', () => {
  const m = JSON.parse(previewManifest(JSON.stringify({ name: 'Mental Math', short_name: 'Mental Math', start_url: '/' }))) as Record<string, string>;
  assert.deepEqual(m, { name: 'Mental Math (Preview)', short_name: 'MM Preview', start_url: '/' });
});
