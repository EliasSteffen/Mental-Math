// v9 F: Feedback-Mail (mailto:), Kontakt-Helfer und Einzahl/Mehrzahl-Schlüssel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT, contactAddress, contactDisplay } from '../src/core/contact.ts';
import { deviceKind, feedbackBody, feedbackMailto, type FeedbackInfo } from '../src/core/feedback.ts';
import { dict as de } from '../src/i18n/locales/de/index.ts';
import { dict as en } from '../src/i18n/locales/en/index.ts';

const info: FeedbackInfo = { version: '2.0.0', build: 'abc1234', platform: 'iOS', lang: 'de', device: 'tablet' };

/** Query-Parameter der mailto-Adresse, dekodiert */
function params(url: string): Map<string, string> {
  const q = url.slice(url.indexOf('?') + 1);
  return new Map(q.split('&').map((kv) => {
    const i = kv.indexOf('=');
    return [decodeURIComponent(kv.slice(0, i)), decodeURIComponent(kv.slice(i + 1))] as const;
  }));
}

test('Kontakt: Adresse zur Laufzeit, Anzeige mit (at) ohne @', () => {
  assert.equal(contactAddress(), 'mail@elias-steffen.de');
  assert.equal(contactDisplay(), 'mail(at)elias-steffen.de');
  assert.equal(CONTACT.name, 'Elias Steffen');
  assert.ok(!contactDisplay().includes('@'), 'Anzeige ohne @ (kein Klartext-Link)');
});

test('deviceKind: Telefon bis 720 px, Tablet bis 1024 px, sonst Desktop', () => {
  assert.equal(deviceKind(390), 'phone');
  assert.equal(deviceKind(719), 'phone');
  assert.equal(deviceKind(720), 'tablet');
  assert.equal(deviceKind(1023), 'tablet');
  assert.equal(deviceKind(1024), 'desktop');
  assert.equal(deviceKind(1440), 'desktop');
});

test('feedbackMailto: Adresse, Betreff je Art und Text kodiert', () => {
  const url = feedbackMailto('feedback', info);
  assert.ok(url.startsWith('mailto:mail@elias-steffen.de?'), url);
  assert.equal(params(url).get('subject'), 'Mental Math Feedback');
  assert.equal(params(feedbackMailto('bug', info)).get('subject'), 'Mental Math Fehler');
  // Leerzeichen und Zeilenumbrüche nicht roh im Link
  const query = url.slice(url.indexOf('?') + 1);
  assert.ok(!/[ \n]/.test(query), 'keine rohen Leerzeichen/Umbrüche');
  assert.ok(query.includes('%0A'), 'Zeilenumbruch kodiert');
});

test('feedbackMailto: Text enthält nur Version, Build, Plattform, Sprache, Gerät', () => {
  const body = params(feedbackMailto('feedback', info)).get('body');
  assert.equal(body, feedbackBody(info));
  assert.deepEqual(body?.split('\n'), [
    'Version: 2.0.0 (abc1234)',
    'Plattform: iOS',
    'Sprache: de',
    'Gerät: tablet',
  ]);
});

test('feedbackMailto: keine personenbezogenen oder Trainingsdaten', () => {
  const url = feedbackMailto('bug', info);
  // Nur die vier Zeilen des Textes und die zwei Felder der Mail; sonst nichts (Geräte-ID, Konto, Ergebnisse, Name)
  assert.deepEqual([...params(url).keys()].sort(), ['body', 'subject']);
  const body = params(url).get('body') ?? '';
  assert.deepEqual(body.split('\n').map((l) => l.split(':')[0]), ['Version', 'Plattform', 'Sprache', 'Gerät']);
  assert.doesNotMatch(body, /@|deviceId|user|konto|account|score|ergebnis|aufgabe/i);
});

test('feedbackMailto: Adresse lässt sich ersetzen (Test)', () => {
  assert.ok(feedbackMailto('feedback', info, 'x@example.org').startsWith('mailto:x@example.org?'));
});

test('Einzahl/Mehrzahl: Schlüssel in de und en, Einzahl ohne Platzhalter', () => {
  for (const dict of [de, en] as const) {
    const s = dict.settings as Record<string, string>;
    for (const key of ['taskCountOne', 'taskCountMany', 'roundCountOne', 'roundCountMany', 'skippedOne', 'skippedMany',
      'storedCount', 'importDone', 'importDoneSkipped', 'feedbackSend', 'reportBug']) {
      assert.ok(s[key]?.trim(), key);
    }
    assert.doesNotMatch(s.taskCountOne ?? '', /\{n\}/);
    assert.doesNotMatch(s.roundCountOne ?? '', /\{n\}/);
    assert.match(s.taskCountMany ?? '', /\{n\}/);
    assert.match(s.roundCountMany ?? '', /\{n\}/);
  }
});
