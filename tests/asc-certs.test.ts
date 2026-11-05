import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CI_NAME, KEEP_RECENT_MS, staleCiCerts, type Cert } from '../scripts/asc-certs.ts';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const YEAR = 365 * 24 * 60 * 60_000;
/** Zertifikat, das vor `ageMs` angelegt wurde (Ablauf = Anlage + 1 Jahr) */
const cert = (id: string, type: string, name: string, ageMs: number): Cert => ({
  id, type, name, displayName: name, expirationDate: new Date(NOW - ageMs + YEAR).toISOString(),
});

test('staleCiCerts: nur alte CI-Entwicklungszertifikate', () => {
  const certs = [
    cert('a', 'DEVELOPMENT', CI_NAME, 2 * 24 * 60 * 60_000),          // alt, CI → weg
    cert('b', 'IOS_DEVELOPMENT', CI_NAME, 5 * 60 * 60_000),           // älter als 3 h, CI → weg
    cert('c', 'DEVELOPMENT', CI_NAME, 30 * 60_000),                   // gerade angelegt → bleibt
    cert('d', 'DEVELOPMENT', 'Elias Steffen', 100 * 24 * 60 * 60_000), // eigenes vom Mac → bleibt
    cert('e', 'DISTRIBUTION', CI_NAME, 100 * 24 * 60 * 60_000),        // Verteilung → bleibt
    cert('f', 'IOS_DISTRIBUTION', 'Elias Steffen', 10 * 24 * 60 * 60_000),
  ];
  assert.deepEqual(staleCiCerts(certs, NOW).map((c) => c.id), ['a', 'b']);
});

test('staleCiCerts: Grenze und ungültiges Ablaufdatum', () => {
  assert.deepEqual(staleCiCerts([cert('x', 'DEVELOPMENT', CI_NAME, KEEP_RECENT_MS - 60_000)], NOW), []);
  assert.deepEqual(staleCiCerts([cert('y', 'DEVELOPMENT', CI_NAME, KEEP_RECENT_MS + 60_000)], NOW).map((c) => c.id), ['y']);
  assert.deepEqual(staleCiCerts([{ id: 'z', type: 'DEVELOPMENT', name: CI_NAME, displayName: '', expirationDate: 'kaputt' }], NOW), []);
});

test('staleCiCerts: Name steht nur im displayName', () => {
  const c: Cert = { id: 'n', type: 'DEVELOPMENT', name: 'Apple Development', displayName: `Apple Development: ${CI_NAME}`, expirationDate: new Date(NOW + YEAR - 10 * 24 * 60 * 60_000).toISOString() };
  assert.deepEqual(staleCiCerts([c], NOW).map((x) => x.id), ['n']);
});
