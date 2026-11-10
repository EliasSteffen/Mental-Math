// Beispieldaten des Rundgangs: gut zwei Monate Üben, feste Aufgaben, ein angemeldetes Konto und Antworten für den Wettkampf.
// Alles reproduzierbar und nur im Speicher (data/storage.ts: enterDemoData).
import { SUBTYPES } from '../core/catalog.ts';
import { challengeDay, dailyId } from '../core/challenge.ts';
import type { ChallengeInfo, Leaderboard } from '../core/challenge.ts';
import { generate } from '../core/generators/index.ts';
import { addActivityMs, addAttempt, setSettings } from '../data/storage.ts';
import type { Settings, Task } from '../types.ts';
import type { Overview } from './challenge.ts';

const DAY = 86_400_000;
const MIN = 60_000;

/** Reproduzierbarer Zufall (mulberry32) */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Feste Aufgaben je Subtyp: ganzzahlige Lösung, damit der Touch-Punkt sie auf dem Tastenfeld tippen kann. */
export function demoTasks(subtypes: readonly string[], seed: number): Task[] {
  const rng = seededRandom(seed);
  return subtypes.map((id) => {
    for (let i = 0; i < 50; i += 1) {
      const task = generate(id, rng, { level: 2 });
      if (task.kind !== 'choice' && Number.isInteger(task.expected) && task.expected > 0) return task;
    }
    throw new Error(`Keine Demo-Aufgabe für ${id}`);
  });
}

export type DemoKeep = Pick<Settings, 'lang' | 'theme' | 'keypadSide' | 'numpadLayout'>;

/** Füllt die (leeren) Demo-Daten. Sprache, Theme und Tastenfeld übernimmt die Person von sich selbst. */
export function seedDemoData(keep: DemoKeep, now: number = Date.now()): void {
  setSettings({
    ...keep, keypad: 'on', timerDisplay: 'calm', autoSubmit: false, onboardingDone: true,
    difficulty: 'auto', sessionLength: 10, dailyGoalMin: 15, placement: { theta: 3, ts: now - 45 * DAY },
  });
  const rng = seededRandom(20261109);
  const subs = Object.values(SUBTYPES).filter((s) => s.category !== 'custom');
  for (let d = 40; d >= 0; d -= 1) {
    const growth = (40 - d) / 40;
    const count = 8 + Math.floor(rng() * 6);
    for (let i = 0; i < count; i += 1) {
      const sub = subs[Math.floor(rng() * subs.length)];
      if (!sub) continue;
      let task: Task;
      try { task = generate(sub.id, rng, { level: 2 }); } catch { continue; }
      // Prozente bleiben die sichtbare Schwäche, damit „Dein Fokus“ etwas zu sagen hat
      const skill = (sub.category === 'pct' ? 0.45 : 0.62) + growth * 0.3;
      const correct = rng() < skill;
      const wrongChoice = task.kind === 'choice' ? (task.expected + 1) % task.choices.length : task.expected * 10;
      addAttempt({
        ts: now - d * DAY - (count - i) * 90_000, sessionId: `demo-${d}`, mode: 'all', category: task.category, subtype: task.subtype,
        prompt: task.prompt, unit: task.unit, expected: task.expected, given: correct ? task.expected : wrongChoice, correct,
        errorType: correct ? null : (rng() < 0.4 ? 'nullen' : 'falsch'), timeMs: Math.round(task.targetMs * (0.7 + rng()) * (1 - growth * 0.25)),
        targetMs: task.targetMs, weight: task.weight, points: correct ? 100 : 0, params: task.params, level: task.level,
        ...(task.kind === 'choice' ? { kind: 'choice' as const, choices: task.choices.slice() } : {}),
      });
    }
  }
  // Serie der letzten zwei Wochen, davor unregelmäßig
  for (let d = 80; d >= 0; d -= 1) {
    if (d > 13 && rng() < 0.4) continue;
    addActivityMs(Math.round((d > 13 ? 6 + rng() * 14 : 16 + rng() * 9) * MIN), now - d * DAY);
  }
}

/** Antworten für Wettkampf und Rangliste; Namen sind erfunden. */
export function demoChallengeResponder(now: number = Date.now()): (path: string) => unknown {
  const id = dailyId(challengeDay(now));
  const daily: ChallengeInfo = {
    id, kind: 'daily', title: null, startsAt: new Date(now - 6 * 3600_000).toISOString(), endsAt: new Date(now + 9 * 3600_000).toISOString(),
    count: 15, level: 2, categories: null, groupId: null, groupName: null, state: 'open', participants: 128, result: null, deadline: null,
  };
  const overview: Overview = {
    day: challengeDay(now), daily, signedIn: true, profile: { displayName: 'Demo', listed: true },
    groups: [{ id: 'demo-1', name: 'Case-Club', code: 'ABC234', owner: true, members: 6 }, { id: 'demo-2', name: 'Team Berlin', code: 'XYZ987', owner: false, members: 3 }],
    competitions: [{ ...daily, id: 'comp-demo', kind: 'competition', title: { de: 'Prozente-Woche', en: 'Percent week' }, groupId: 'demo-1', groupName: 'Case-Club', participants: 5, endsAt: new Date(now + 3 * DAY).toISOString() }],
  };
  const names = ['Anna', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Hannes'];
  const board: Leaderboard = {
    scope: 'day', id, title: null, groupId: null, total: 128, me: null,
    top: names.map((name, i) => ({ rank: i + 1, name, points: 2300 - i * 70, timeMs: 80_000 + i * 3000, correct: 15 - Math.floor(i / 3), me: false })),
  };
  return (path) => {
    if (path.startsWith('/overview')) return overview;
    if (path.startsWith('/board')) return { board };
    return null;
  };
}
