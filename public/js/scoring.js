// Bewertung, Punkte, Skill, Schwächen
import { SUBTYPES, CATEGORIES } from './generators.js';
import { unitFactor } from './numbers.js';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function timeFactor(timeMs, targetMs) {
  return clamp(1 - (0.6 * (timeMs - targetMs)) / (2 * targetMs), 0.4, 1);
}

export function evaluate(task, given, timeMs, { assisted = false } = {}) {
  const tf = timeFactor(timeMs, task.targetMs);
  if (given === null || given === undefined || Number.isNaN(given)) {
    return { correct: false, errorType: 'skip', points: 0, timeFactor: tf };
  }
  const { expected } = task;
  const { abs = 0, rel = 0 } = task.tolerance || {};
  const F = unitFactor(task.unit);
  const candidates = [given];
  if (F > 1) candidates.push(given / F);
  if (task.subtype === 'pct.change') candidates.push(Math.abs(given));
  const tol = Math.max(abs, rel * Math.abs(expected)) + 1e-9;
  const isOk = (c) => Math.abs(c - expected) <= tol;
  const ok = candidates.some(isOk);
  if (!ok && candidates.length > 1 && expected !== 0) {
    let best = given;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = Math.abs(Math.log10(Math.abs(c / expected)));
      if (Number.isFinite(d) && d < bestD) { bestD = d; best = c; }
    }
    given = best;
  }
  const diff = Math.abs(given - expected);
  if (ok) {
    const points = Math.round(100 * task.weight * tf);
    return { correct: true, errorType: null, points: assisted ? Math.round(points * 0.5) : points, timeFactor: tf };
  }
  if (expected !== 0 && given !== 0) {
    const L = Math.log10(Math.abs(given / expected));
    const k = Math.round(L);
    if (k !== 0 && Math.abs(L - k) < 0.02) {
      return { correct: false, errorType: 'nullen', points: 0, timeFactor: tf };
    }
  }
  if (expected !== 0 && diff / Math.abs(expected) <= 0.1) {
    return { correct: false, errorType: 'knapp', points: Math.round(20 * task.weight), timeFactor: tf };
  }
  return { correct: false, errorType: 'falsch', points: 0, timeFactor: tf };
}

export function skill(attempts, window = 25) {
  const list = (attempts || []).slice(-window);
  const n = list.length;
  if (n === 0) return { n: 0, accuracy: 0, speed: 0, score: null, avgTimeMs: 0, avgTargetMs: 0 };
  const right = list.filter((a) => a.correct);
  const accuracy = list.reduce((sum, a) => sum + (a.correct ? (a.assisted ? 0.5 : 1) : 0), 0) / n;
  const speed = right.length ? mean(right.map((a) => Math.min(1, a.targetMs / a.timeMs))) : 0;
  return {
    n,
    accuracy,
    speed,
    score: n < 3 ? null : Math.round(100 * (0.7 * accuracy + 0.3 * speed)),
    avgTimeMs: mean(list.map((a) => a.timeMs)),
    avgTargetMs: mean(list.map((a) => a.targetMs)),
  };
}

function groupBy(attempts, key) {
  const g = {};
  for (const a of attempts || []) (g[a[key]] ||= []).push(a);
  return g;
}

export function categoryStats(attempts) {
  const g = groupBy(attempts, 'category');
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, skill(g[c.id] || [])]));
}

export function subtypeStats(attempts) {
  const g = groupBy(attempts, 'subtype');
  return Object.fromEntries(Object.keys(SUBTYPES).map((id) => [id, skill(g[id] || [])]));
}

export function overall(attempts) {
  return skill(attempts, 100);
}

const LABELS = { nullen: 'Nullen-Fehler', ungenau: 'Ungenau', langsam: 'Zu langsam' };

export function weaknesses(attempts, limit = 3) {
  const g = groupBy(attempts, 'subtype');
  const out = [];
  for (const [id, list] of Object.entries(g)) {
    const s = SUBTYPES[id];
    if (!s) continue;
    const sk = skill(list);
    if (sk.n < 3 || sk.score >= 85) continue;
    const nullen = list.slice(-25).filter((a) => a.errorType === 'nullen').length;
    const reason = nullen >= 2 ? 'nullen' : sk.accuracy < 0.8 ? 'ungenau' : 'langsam';
    out.push({
      subtype: id,
      name: s.name,
      category: s.category,
      categoryName: CATEGORIES.find((c) => c.id === s.category).name,
      score: sk.score,
      accuracy: sk.accuracy,
      speed: sk.speed,
      avgTimeMs: sk.avgTimeMs,
      targetMs: s.targetMs,
      n: sk.n,
      reason,
      label: LABELS[reason],
      tip: s.tip,
    });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, limit);
}

export function errorPatterns(attempts) {
  const r = { nullen: 0, knapp: 0, falsch: 0, skip: 0 };
  for (const a of attempts || []) if (a.errorType in r) r[a.errorType]++;
  return r;
}

export function sessionSummary(attempts) {
  const list = attempts || [];
  const n = list.length;
  const correct = list.filter((a) => a.correct).length;
  return {
    n,
    correct,
    accuracy: n ? correct / n : 0,
    points: list.reduce((s, a) => s + (a.points || 0), 0),
    avgTimeMs: mean(list.map((a) => a.timeMs)),
  };
}
