// Tests für die reinen Build-Helfer (ohne vollen Build-Lauf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validPublicKey, validPublicUrl } from '../scripts/build-info.ts';
import { addConnectSrc, appleAppSiteAssociation } from '../scripts/copy-static.ts';

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
