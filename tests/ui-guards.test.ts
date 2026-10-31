// Scroll-Sperre (Sheets + Dialoge, gemeinsamer Zähler) und Doppeltipp-Schutz von Dock/Sheet – mit minimalem DOM-Ersatz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';

const classes = new Set<string>();
(globalThis as { document?: unknown }).document = {
  documentElement: { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) } },
  getElementById: () => null,
  body: {},
};

const { lockScroll } = await import('../src/ui/scroll-lock.ts');
const { tapGuard } = await import('../src/ui/dock.ts');

test('lockScroll: Sperre bleibt, bis Sheet und Dialog beide geschlossen sind', () => {
  const unlockSheet = lockScroll();
  const unlockModal = lockScroll();
  assert.ok(classes.has('is-sheet-locked'));
  unlockSheet();
  unlockSheet(); // idempotent: löst nicht die Sperre des Dialogs
  assert.ok(classes.has('is-sheet-locked'));
  unlockModal();
  assert.equal(classes.has('is-sheet-locked'), false);
});

function click(target: EventTarget, detail: number): Event {
  const e = new Event('click', { cancelable: true });
  Object.defineProperty(e, 'detail', { value: detail });
  target.dispatchEvent(e);
  return e;
}

test('tapGuard: Zeiger-Klicks kurz nach dem Erscheinen verworfen, Tastatur sofort, danach normal', async () => {
  const el = new EventTarget() as unknown as HTMLElement;
  const rearm = tapGuard(el, 40);
  assert.equal(click(el, 1).defaultPrevented, true, 'zweiter Tipp eines Doppeltipps');
  assert.equal(click(el, 0).defaultPrevented, false, 'Enter/Leertaste (detail 0)');
  await wait(60);
  assert.equal(click(el, 1).defaultPrevented, false, 'nach Ablauf');
  rearm();
  assert.equal(click(el, 1).defaultPrevented, true, 'erneut scharfgeschaltet');
});
