// Bildschirmtastatur: verdeckter Streifen unten (src/ui/keyboard-inset.ts) → --kb und has-keyboard auf <html>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyboardInset, watchKeyboardInset, type KeyboardWindow } from '../src/ui/keyboard-inset.ts';

test('keyboardInset: Tastatur offen, geschlossen, iOS schiebt den Bereich hoch, Zoom', () => {
  assert.equal(keyboardInset(844, { height: 844, offsetTop: 0, scale: 1 }), 0);
  // Safaris Leisten ändern die Höhe nur wenig: keine Tastatur
  assert.equal(keyboardInset(844, { height: 790, offsetTop: 0, scale: 1 }), 0);
  assert.equal(keyboardInset(844, { height: 508, offsetTop: 0, scale: 1 }), 336);
  // iOS hat den sichtbaren Bereich zum Feld hochgeschoben: nur der Rest unten ist verdeckt
  assert.equal(keyboardInset(844, { height: 508, offsetTop: 300, scale: 1 }), 36);
  assert.equal(keyboardInset(844, { height: 508, offsetTop: 400, scale: 1 }), 0);
  // gezoomt: VisualViewport ist kleiner, aber das ist keine Tastatur
  assert.equal(keyboardInset(844, { height: 400, offsetTop: 0, scale: 2 }), 0);
});

function fakeWindow(focusedInDialog: boolean) {
  const listeners: Record<string, Array<() => void>> = { resize: [], scroll: [] };
  const vars = new Map<string, string>();
  const classes = new Set<string>();
  const scrolled: string[] = [];
  const vv = {
    height: 844, offsetTop: 0, scale: 1,
    addEventListener: (type: 'resize' | 'scroll', fn: () => void) => { listeners[type]?.push(fn); },
    removeEventListener: (type: 'resize' | 'scroll', fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
  };
  const win: KeyboardWindow = {
    innerHeight: 844,
    visualViewport: vv,
    document: {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => { vars.set(k, v); },
          removeProperty: (k: string) => { vars.delete(k); return ''; },
        },
        classList: { toggle: (c: string, on?: boolean) => { if (on) classes.add(c); else classes.delete(c); return Boolean(on); } },
      },
      activeElement: {
        closest: (sel: string) => (focusedInDialog && sel === 'dialog' ? {} : null),
        scrollIntoView: () => { scrolled.push('field'); },
      },
    },
  };
  const fire = (type: 'resize' | 'scroll') => { for (const f of listeners[type] ?? []) f(); };
  return { win, vv, vars, classes, scrolled, fire, listeners };
}

test('watchKeyboardInset: setzt --kb beim Öffnen, entfernt es beim Schließen, hält das Feld im Sheet sichtbar', () => {
  const f = fakeWindow(true);
  const stop = watchKeyboardInset(f.win);
  assert.equal(f.vars.has('--kb'), false);
  assert.equal(f.classes.has('has-keyboard'), false);

  f.vv.height = 508;
  f.fire('resize');
  assert.equal(f.vars.get('--kb'), '336px');
  assert.equal(f.vars.get('--vvh'), '508px');
  assert.equal(f.vars.get('--vvt'), '0px');
  assert.equal(f.classes.has('has-keyboard'), true);
  assert.deepEqual(f.scrolled, ['field']);

  // gleicher Wert: nichts Neues
  f.fire('scroll');
  assert.deepEqual(f.scrolled, ['field']);

  // iOS schiebt den sichtbaren Bereich ganz hoch: Tastatur bleibt offen, Sheet liegt am sichtbaren Rand
  f.vv.offsetTop = 336;
  f.fire('scroll');
  assert.equal(f.vars.get('--kb'), '0px');
  assert.equal(f.vars.get('--vvt'), '336px');
  assert.equal(f.classes.has('has-keyboard'), true);

  f.vv.height = 844;
  f.vv.offsetTop = 0;
  f.fire('resize');
  assert.equal(f.vars.has('--kb'), false);
  assert.equal(f.vars.has('--vvh'), false);
  assert.equal(f.classes.has('has-keyboard'), false);

  stop();
  assert.equal(f.listeners.resize?.length, 0);
  assert.equal(f.listeners.scroll?.length, 0);
});

test('watchKeyboardInset: Feld außerhalb eines Dialogs wird nicht gescrollt; ohne VisualViewport passiert nichts', () => {
  const f = fakeWindow(false);
  watchKeyboardInset(f.win);
  f.vv.height = 500;
  f.fire('resize');
  assert.equal(f.vars.get('--kb'), '344px');
  assert.deepEqual(f.scrolled, []);

  const none = fakeWindow(false);
  none.win.visualViewport = null;
  assert.doesNotThrow(() => watchKeyboardInset(none.win)());
});
