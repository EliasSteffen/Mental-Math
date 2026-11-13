import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CARD_GAP, arrowOffset, edgePlacement, glide, holdPlacement, keepClear, overlaps, placeBeside, type Box,
} from '../src/core/tour-card.ts';

const PHONE = { w: 358, h: 760 };
const CARD = { w: 358, h: 140 };

test('Karte steht unter dem Ziel, wenn dort Platz ist, sonst darüber', () => {
  const top: Box = { x: 0, y: 40, w: 358, h: 120 };
  assert.deepEqual(placeBeside(top, CARD, PHONE), { x: 0, y: 160 + CARD_GAP, side: 'below' });
  const low: Box = { x: 0, y: 520, w: 358, h: 200 };
  assert.deepEqual(placeBeside(low, CARD, PHONE), { x: 0, y: 520 - CARD_GAP - 140, side: 'above' });
});

test('Karte ist waagerecht am Ziel ausgerichtet und bleibt in der Bühne', () => {
  const stage = { w: 1000, h: 700 };
  const card = { w: 400, h: 120 };
  assert.equal(placeBeside({ x: 450, y: 100, w: 100, h: 40 }, card, stage).x, 300);
  assert.equal(placeBeside({ x: 930, y: 10, w: 60, h: 40 }, card, stage).x, 600, 'rechter Rand');
  assert.equal(placeBeside({ x: 0, y: 10, w: 60, h: 40 }, card, stage).x, 0, 'linker Rand');
});

test('Hohes Ziel (Seitenleiste auf dem iPad): Karte daneben, senkrecht mittig', () => {
  const stage = { w: 1000, h: 700 };
  const p = placeBeside({ x: -10, y: -10, w: 240, h: 720 }, { w: 400, h: 120 }, stage);
  assert.deepEqual(p, { x: 230 + CARD_GAP, y: 290, side: 'right' });
});

test('Ziel füllt fast alles: Karte an den Rand gegenüber der sichtbaren Zielmitte', () => {
  assert.equal(placeBeside({ x: -6, y: 100, w: 370, h: 700 }, CARD, PHONE).side, 'top', 'Mitte unten → oben');
  assert.equal(placeBeside({ x: -6, y: 0, w: 370, h: 640 }, CARD, PHONE).side, 'bottom', 'Mitte oben → unten');
  const p = placeBeside({ x: -6, y: 0, w: 370, h: 640 }, CARD, PHONE);
  assert.equal(p.y, PHONE.h - CARD.h);
});

test('Ruheplatz unten mittig; Festhalten bleibt in der Bühne', () => {
  assert.deepEqual(edgePlacement({ w: 300, h: 100 }, { w: 1000, h: 700 }, 'bottom'), { x: 350, y: 600, side: 'bottom' });
  assert.deepEqual(holdPlacement({ x: 900, y: 650, side: 'below' }, { w: 300, h: 100 }, { w: 1000, h: 700 }), { x: 700, y: 600, side: 'below' });
});

test('Touch-Punkt unter der Karte: Karte weicht an den gegenüberliegenden Rand aus, sonst bleibt sie', () => {
  const at = edgePlacement(CARD, PHONE, 'bottom');
  const tab: Box = { x: 20, y: 700, w: 60, h: 50 };
  assert.ok(overlaps(at, CARD, tab));
  assert.equal(keepClear(at, CARD, PHONE, [tab]).side, 'top');
  const free: Box = { x: 20, y: 100, w: 60, h: 50 };
  assert.equal(keepClear(at, CARD, PHONE, [free]), at);
});

test('Antwortfeld bleibt frei: beim Eintippen und bei „Jetzt du“ weicht die Karte aus', () => {
  // Telefon: Frage oben, darunter das Antwortfeld, unten das Tastenfeld
  const field: Box = { x: 0, y: 206, w: 361, h: 84 };
  const key: Box = { x: 100, y: 430, w: 80, h: 80 };
  const numpad: Box = { x: -6, y: 389, w: 373, h: 244 };
  const stage = { w: 361, h: 619 };
  const card = { w: 361, h: 154 };
  // Karte steht unter der Frage (über dem Feld) → nach oben, nicht nach unten aufs Tastenfeld
  const held = keepClear({ x: 0, y: 218, side: 'below' }, card, stage, [key, field]);
  assert.deepEqual(held, { x: 0, y: 0, side: 'top' });
  // Spotlight aufs Tastenfeld: darüber läge die Karte auf dem Feld → an den oberen Rand
  assert.deepEqual(placeBeside(numpad, card, stage, [field]), { x: 0, y: 0, side: 'top' });
  // Ohne Freizuhaltendes stünde sie direkt darüber
  assert.equal(placeBeside(numpad, card, stage).side, 'above');
});

test('Pfeil zeigt auf die Zielmitte, mit Abstand zu den Ecken', () => {
  const card = { w: 400, h: 120 };
  const target: Box = { x: 500, y: 0, w: 100, h: 40 };
  assert.equal(arrowOffset('below', { x: 300, y: 60 }, card, target), 250);
  assert.equal(arrowOffset('above', { x: 300, y: 0 }, card, { x: 0, y: 200, w: 20, h: 20 }), 22, 'Ecke links');
  assert.equal(arrowOffset('right', { x: 300, y: 100 }, card, { x: 0, y: 0, w: 200, h: 1000 }), 98, 'Ecke unten');
  assert.equal(arrowOffset('bottom', { x: 0, y: 0 }, card, target), null);
});

test('Gleiten: kommt sanft und ohne Überschwingen an, auch bei schwankender Bildrate', () => {
  for (const fps of [30, 60, 120]) {
    let pos = 0;
    let vel = 0;
    let max = 0;
    const steps: number[] = [];
    for (let i = 0; i < fps * 2; i += 1) {
      [pos, vel] = glide(pos, vel, 300, 1 / fps);
      max = Math.max(max, pos);
      steps.push(pos);
    }
    assert.equal(pos, 300, `${fps} fps: angekommen`);
    assert.ok(max <= 300, `${fps} fps: kein Überschwingen`);
    // Sanfter Start: das erste Zehntel braucht deutlich mehr als einen Frame
    assert.ok((steps[0] ?? 0) < 30, `${fps} fps: Start ${steps[0]}`);
    // Nach einer halben Sekunde fast da, aber nicht sofort
    const half = steps[Math.round(fps * 0.5) - 1] ?? 0;
    assert.ok(half > 200 && half < 300, `${fps} fps: nach 0,5 s ${half}`);
  }
});
