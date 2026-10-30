// localStorage mit In-Memory-Fallback
const KEY = 'kopfrechner.v1';
const MAX_ATTEMPTS = 5000;
const MAX_SESSIONS = 500;

let mem = null;

const MAX_ACTIVITY_DAYS = 400;

export const DEFAULT_SETTINGS = {
  sessionLength: 10, dailyGoalMin: 15, theme: 'system', difficulty: 'auto',
  timer: true, sound: false, haptics: true, celebrated: '', keypad: 'auto',
  enabledCategories: null,
};

const defaults = () => ({
  version: 1, attempts: [], sessions: [], settings: { ...DEFAULT_SETTINGS }, reviews: {}, activity: {},
});

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function normalize(s) {
  const d = defaults();
  if (!s || typeof s !== 'object') return d;
  return {
    version: 1,
    attempts: Array.isArray(s.attempts) ? s.attempts : d.attempts,
    sessions: Array.isArray(s.sessions) ? s.sessions : d.sessions,
    settings: { ...d.settings, ...(isObj(s.settings) ? s.settings : {}) },
    reviews: isObj(s.reviews) ? s.reviews : d.reviews,
    activity: isObj(s.activity) ? s.activity : d.activity,
  };
}

export function load() {
  try {
    const ls = store();
    const raw = ls && ls.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {
    /* Fallback unten */
  }
  return normalize(mem);
}

export function save(state) {
  mem = state;
  try {
    const ls = store();
    if (ls) ls.setItem(KEY, JSON.stringify(state));
  } catch {
    /* In-Memory-Fallback */
  }
}

export const getAttempts = () => load().attempts;
export const getSessions = () => load().sessions;
export const getSettings = () => load().settings;

export function setSettings(partial) {
  const s = load();
  s.settings = { ...s.settings, ...partial };
  save(s);
  return s.settings;
}

export const getReviews = () => load().reviews;

export function setReviews(reviews) {
  const s = load();
  s.reviews = isObj(reviews) ? reviews : {};
  save(s);
  return s.reviews;
}

export const getActivity = () => load().activity;

export function addActivityMs(ms, ts = Date.now()) {
  const s = load();
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  s.activity[key] = (Number(s.activity[key]) || 0) + (Number(ms) || 0);
  const keys = Object.keys(s.activity).sort();
  if (keys.length > MAX_ACTIVITY_DAYS) for (const k of keys.slice(0, keys.length - MAX_ACTIVITY_DAYS)) delete s.activity[k];
  save(s);
  return s.activity[key];
}

export function addAttempt(attempt) {
  const s = load();
  s.attempts.push(attempt);
  if (s.attempts.length > MAX_ATTEMPTS) s.attempts = s.attempts.slice(-MAX_ATTEMPTS);
  save(s);
}

export function addSession(session) {
  const s = load();
  s.sessions.push(session);
  if (s.sessions.length > MAX_SESSIONS) s.sessions = s.sessions.slice(-MAX_SESSIONS);
  save(s);
}

export function resetAll() {
  mem = null;
  try {
    const ls = store();
    if (ls) ls.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

export function exportJSON() {
  return JSON.stringify(load(), null, 2);
}
