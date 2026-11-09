// Öffentliche Build-Konfiguration (scripts/build-info.ts → readPublicConfig): API-Origin je Kanal, Live-Update-Manifeste
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_API_ORIGIN, readPublicConfig } from '../scripts/build-info.ts';

const KEYS = ['PUBLIC_API_ORIGIN', 'PUBLIC_PREVIEW_API_ORIGIN', 'PUBLIC_LIVE_UPDATE_URL', 'PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

test('Produktion: API und Manifest der Produktion', () => {
  delete process.env.PUBLIC_API_ORIGIN;
  delete process.env.PUBLIC_LIVE_UPDATE_URL;
  const c = readPublicConfig('production');
  assert.equal(c.apiOrigin, DEFAULT_API_ORIGIN);
  assert.equal(c.liveUpdateUrl, `${DEFAULT_API_ORIGIN}/ota/manifest.json`);
});

test('Vorschau (Beta-Live-Update): API der Produktion (Sync-Tokens), Vorschau-API nur ausdrücklich', () => {
  process.env.PUBLIC_API_ORIGIN = 'https://mental-math.example';
  delete process.env.PUBLIC_PREVIEW_API_ORIGIN;
  delete process.env.PUBLIC_LIVE_UPDATE_URL;
  const c = readPublicConfig('preview');
  assert.equal(c.apiOrigin, 'https://mental-math.example');
  assert.equal(c.liveUpdateUrl, 'https://mental-math.example/ota/manifest.json');
  process.env.PUBLIC_PREVIEW_API_ORIGIN = 'https://preview.example';
  assert.equal(readPublicConfig('preview').apiOrigin, 'https://preview.example');
  process.env.PUBLIC_PREVIEW_API_ORIGIN = 'http://unsafe.example';
  assert.equal(readPublicConfig('preview').apiOrigin, 'https://mental-math.example');
  // Nur Beta-Bundles: die Produktion ignoriert die Vorschau-API
  process.env.PUBLIC_PREVIEW_API_ORIGIN = 'https://preview.example';
  assert.equal(readPublicConfig('production').apiOrigin, 'https://mental-math.example');
});
