// Wiederholungssperre fürs Training: innerhalb einer Sitzung keine Aufgabe, die einer der letzten K Aufgaben gleicht.
// Rein und ohne eigene Zufallsquelle – der Erzeuger (`make`) bringt den Zufall mit; das Daily bleibt unberührt.
import type { Task } from '../../types.ts';

/** Fenstergröße K: so viele zuletzt gestellte Aufgaben sind gesperrt. */
export const RECENT_WINDOW = 8;
/** So viele Kandidaten werden höchstens erzeugt. Kostet fast nichts – große Pools treffen fast immer im ersten Versuch. */
export const FRESH_TRIES = 20;

const CHOICE_KEY = /^c\d+$/;

/**
 * Identität einer Aufgabe: Subtyp + Prompt + Parameter. Die gemischten Auswahl-Optionen (c0 … c3) zählen nicht –
 * dieselbe Frage mit anderer Reihenfolge der Optionen ist dieselbe Aufgabe.
 */
export function taskKey(t: Pick<Task, 'subtype' | 'prompt' | 'params'>): string {
  const params = t.params ?? {};
  const kept = Object.keys(params).filter((k) => !CHOICE_KEY.test(k)).sort().map((k) => [k, params[k]]);
  return `${t.subtype}|${t.prompt}|${JSON.stringify(kept)}`;
}

export interface FreshOptions {
  /** Anzahl gesperrter letzter Aufgaben (Standard RECENT_WINDOW); 0 schaltet die Sperre ab */
  window?: number;
  /** Höchstzahl erzeugter Kandidaten (Standard FRESH_TRIES) */
  tries?: number;
}

/** Fenster um einen Schlüssel fortschreiben (rein). */
export function pushRecent(recent: readonly string[], key: string, window = RECENT_WINDOW): string[] {
  return window > 0 ? [...recent, key].slice(-window) : [];
}

/**
 * Erzeugt mit `make` eine Aufgabe, die keiner der letzten `window` Aufgaben in `recent` gleicht.
 * Bis zu `tries` Kandidaten; ist keiner frei (Pool kleiner als das Fenster), gewinnt der am längsten nicht gestellte –
 * das Fenster schrumpft so von selbst auf die Poolgröße, und dieselbe Aufgabe kommt nie zweimal direkt hintereinander,
 * sobald unter den Kandidaten eine andere ist. `recent` bleibt unverändert; zurück kommt das fortgeschriebene Fenster.
 */
export function pickFresh(
  make: () => Task,
  recent: readonly string[],
  { window = RECENT_WINDOW, tries = FRESH_TRIES }: FreshOptions = {},
): { task: Task; key: string; recent: string[] } {
  const blocked = window > 0 ? recent.slice(-window) : [];
  let best: Task | null = null;
  let bestKey = '';
  let bestPos = Infinity;
  for (let i = 0; i < Math.max(1, tries); i++) {
    const task = make();
    const key = taskKey(task);
    const pos = blocked.lastIndexOf(key);
    if (pos < 0) return { task, key, recent: pushRecent(blocked, key, window) };
    // kleinere Position = länger her
    if (pos < bestPos) {
      best = task;
      bestKey = key;
      bestPos = pos;
    }
  }
  return { task: best as Task, key: bestKey, recent: pushRecent(blocked, bestKey, window) };
}

/** Wiederholungssperre einer Sitzung (Training, Übungsrunde, Beispiele im Lernbereich). */
export interface NoRepeat {
  /** Nächste Aufgabe, die keiner der letzten K gleicht */
  next(make: () => Task): Task;
  /** Bereits gezeigte Aufgabe vormerken (z. B. das Beispiel vor einer Übungsrunde) */
  remember(task: Task): void;
}

export function noRepeat(opts: FreshOptions = {}): NoRepeat {
  const window = opts.window ?? RECENT_WINDOW;
  let recent: string[] = [];
  return {
    next(make) {
      const r = pickFresh(make, recent, opts);
      recent = r.recent;
      return r.task;
    },
    remember(task) {
      recent = pushRecent(recent, taskKey(task), window);
    },
  };
}
