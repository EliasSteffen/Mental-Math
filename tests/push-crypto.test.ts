import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PAYLOAD, b64uDecode, b64uEncode, concat, encryptPayload, generateVapidKeys, importEcdhKeyPair, sendPush,
  validVapidKeys, vapidAuthorization,
} from '../server/push-crypto.ts';
import type { Bytes, FetchLike } from '../server/push-crypto.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();
const b = (s: string): Bytes => {
  const v = b64uDecode(s);
  assert.ok(v, s);
  return v;
};

// RFC 8291, Appendix A
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, len: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

/** Gegenstück des Browsers (RFC 8291, Abschnitt 3.4): entschlüsselt mit dem privaten Schlüssel des Abos. */
async function decryptAsBrowser(body: Bytes, uaPublic: Bytes, uaPrivate: CryptoKey, auth: Bytes): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
  assert.equal(rs, 4096);
  const idlen = body[20] ?? 0;
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPrivate, 256));
  const ikm = await hkdf(auth, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  assert.equal(plain.at(-1), 2, 'Trennbyte für den letzten Datensatz');
  return dec.decode(plain.slice(0, -1));
}

test('base64url: Roundtrip und ungültige Eingaben', () => {
  for (let n = 0; n < 40; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    const s = b64uEncode(bytes);
    assert.match(s, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual(b64uDecode(s), bytes);
  }
  assert.equal(b64uDecode('ab+/'), null);
  assert.equal(b64uDecode('a=='), null);
});

test('RFC 8291 Anhang A: Testvektor', async () => {
  const body = await encryptPayload(enc.encode(RFC.plaintext), RFC.uaPublic, RFC.auth, {
    salt: b(RFC.salt), serverKeys: await importEcdhKeyPair(RFC.asPublic, RFC.asPrivate),
  });
  assert.equal(b64uEncode(body), RFC.body);
  const ua = await importEcdhKeyPair(RFC.uaPublic, RFC.uaPrivate);
  assert.equal(await decryptAsBrowser(b(RFC.body), ua.publicKey, ua.privateKey, b(RFC.auth)), RFC.plaintext);
});

test('Verschlüsselung: Roundtrip mit frischen Schlüsseln, zufälliges Salt', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const msg = JSON.stringify({ title: 'Zeit für Kopfrechnen', body: 'Ümläute & Emoji 🔥' });
  const a = await encryptPayload(enc.encode(msg), b64uEncode(uaPublic), b64uEncode(auth));
  const c = await encryptPayload(enc.encode(msg), b64uEncode(uaPublic), b64uEncode(auth));
  assert.notDeepEqual(a.slice(0, 16), c.slice(0, 16), 'Salt zufällig');
  assert.equal(await decryptAsBrowser(a, uaPublic, ua.privateKey, auth), msg);
});

test('Verschlüsselung: ungültige Abo-Schlüssel und zu große Nutzlast', async () => {
  await assert.rejects(encryptPayload(enc.encode('x'), 'abc', RFC.auth), /p256dh/);
  await assert.rejects(encryptPayload(enc.encode('x'), RFC.uaPublic, 'abc'), /auth/);
  await assert.rejects(encryptPayload(new Uint8Array(MAX_PAYLOAD + 1), RFC.uaPublic, RFC.auth), /too large/);
});

test('VAPID: Schlüssel erzeugen und prüfen', async () => {
  const keys = await generateVapidKeys();
  assert.ok(validVapidKeys(keys));
  assert.equal(b(keys.publicKey).length, 65);
  for (const bad of [null, {}, { publicKey: keys.publicKey }, { publicKey: 'x', privateKey: keys.privateKey }, { ...keys, privateKey: 'abc' }]) {
    assert.equal(validVapidKeys(bad), false);
  }
});

test('VAPID: Authorization-Header mit gültiger ES256-Signatur', async () => {
  const keys = await generateVapidKeys();
  const now = Date.parse('2026-01-15T10:00:00Z');
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://mental-math.example', now);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(m, header);
  const [, h64 = '', p64 = '', s64 = '', k] = m;
  assert.equal(k, keys.publicKey);
  assert.deepEqual(JSON.parse(dec.decode(b(h64))), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(dec.decode(b(p64))), { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://mental-math.example' });
  const pub = await crypto.subtle.importKey('raw', b(keys.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const sig = b(s64);
  assert.equal(sig.length, 64);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, sig, enc.encode(`${h64}.${p64}`)));
});

test('sendPush: Header, Body und Statusabbildung', async () => {
  const keys = await generateVapidKeys();
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const target = { endpoint: 'https://web.push.apple.com/QGuQyavXutnMH', p256dh: b64uEncode(uaPublic), auth: b64uEncode(auth) };
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let status = 201;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(null, { status });
  };
  const opts = { keys, subject: 'mailto:test@example.com', now: Date.now(), ttl: 3600, topic: 'daily', fetchImpl };
  assert.deepEqual(await sendPush(target, { title: 'Hallo' }, opts), { ok: true, status: 201, gone: false });
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, target.endpoint);
  assert.equal(call.init.method, 'POST');
  const headers = call.init.headers as Record<string, string>;
  assert.equal(headers['Content-Encoding'], 'aes128gcm');
  assert.equal(headers.TTL, '3600');
  assert.equal(headers.Topic, 'daily');
  assert.equal(headers.Urgency, 'normal');
  assert.match(headers.Authorization ?? '', /^vapid t=/);
  assert.equal(await decryptAsBrowser(call.init.body as Bytes, uaPublic, ua.privateKey, auth), '{"title":"Hallo"}');

  status = 410;
  assert.deepEqual(await sendPush(target, {}, opts), { ok: false, status: 410, gone: true });
  status = 404;
  assert.equal((await sendPush(target, {}, opts)).gone, true);
  status = 429;
  assert.deepEqual(await sendPush(target, {}, opts), { ok: false, status: 429, gone: false });
  await sendPush(target, {}, { ...opts, topic: 'not valid!' });
  assert.equal((calls.at(-1)?.init.headers as Record<string, string>).Topic, undefined);
});
