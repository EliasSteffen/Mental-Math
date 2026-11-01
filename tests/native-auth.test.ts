// Eigenes Capacitor-Plugin der App (NativeAuth): Zugriff aus JS über src/platform/native.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nativeAuthPlugin } from '../src/platform/native.ts';

const TIMEOUT = Symbol('timeout');
const within = <T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> =>
  Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms).unref())]);

// Capacitors Plugin-Proxy beantwortet jede Eigenschaft mit einer Methode, auch `then`. Liefert ein Promise den Proxy
// direkt, hält await ihn für ein Promise und wartet ewig: In der App erschien beim Passkey-Login kein System-Sheet.
test('nativeAuthPlugin: await liefert das Plugin, statt zu hängen', async () => {
  const p = await within(nativeAuthPlugin(), 2000);
  assert.notEqual(p, TIMEOUT, 'nativeAuthPlugin() hängt');
  if (p === TIMEOUT) return;
  assert.equal(typeof (p as unknown as { then?: unknown }).then, 'undefined');
  assert.equal(await within(nativeAuthPlugin(), 2000), p);
});

test('nativeAuthPlugin: Aufrufe gehen an das Plugin (ohne native Seite: nicht implementiert)', async () => {
  const p = await nativeAuthPlugin();
  const r = await within(p.secureGet({ key: 'refresh-token' }).then(() => 'ok', (e: { code?: unknown }) => e.code), 2000);
  assert.equal(r, 'UNIMPLEMENTED');
});
