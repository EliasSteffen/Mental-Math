// localStorage mit In-Memory-Fallback
const KEY = 'kopfrechner.v1';
const MAX_ATTEMPTS = 5000;
const MAX_SESSIONS = 500;

let mem = null;

const defaults = () => ({ version: 1, attempts: [], sessions: [], settings: { sessionLength: 10 } });

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
    settings: { ...d.settings, ...(s.settings && typeof s.settings === 'object' ? s.settings : {}) },
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
