// POST /api/explain – validiert, baut den Prompt, ruft Gemini auf (Cloudflare Workers + Node >= 20)
import { SUBTYPES, CATEGORIES } from '../public/js/generators.js';
import { getMethod } from '../public/js/methods.js';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MAX_BODY = 4000;
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const isStr = (x, max) => typeof x === 'string' && x.length <= max;
const INVALID = { ok: false, error: 'invalid' };

export function validateExplainRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return INVALID;
  const { kind, subtype } = body;
  if (kind !== 'task' && kind !== 'method') return INVALID;
  if (typeof subtype !== 'string' || !Object.prototype.hasOwnProperty.call(SUBTYPES, subtype)) return INVALID;
  if (kind === 'method') return { ok: true, value: { kind, subtype } };

  const { prompt, params, expected, unit, given } = body;
  if (!isStr(prompt, 160) || prompt.length === 0) return INVALID;
  if (!isNum(expected)) return INVALID;
  const u = unit === undefined || unit === null ? '' : unit;
  if (!isStr(u, 20)) return INVALID;
  const g = given === undefined ? null : given;
  if (g !== null && !isNum(g)) return INVALID;
  const p = params === undefined || params === null ? {} : params;
  if (typeof p !== 'object' || Array.isArray(p)) return INVALID;
  const keys = Object.keys(p);
  if (keys.length > 12) return INVALID;
  const cleanParams = {};
  for (const k of keys) {
    const v = p[k];
    if (k.length > 40) return INVALID;
    if (!(isNum(v) || isStr(v, 40))) return INVALID;
    cleanParams[k] = v;
  }
  return { ok: true, value: { kind, subtype, prompt, params: cleanParams, expected, unit: u, given: g } };
}

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 });
const num = (x) => nf.format(x);

export function buildPrompt(value) {
  const sub = SUBTYPES[value.subtype];
  const cat = CATEGORIES.find((c) => c.id === sub.category);
  const method = getMethod(value.subtype);
  const system = [
    'Du bist ein Mathe-Coach für Consulting-Case-Interviews.',
    'Erkläre den Rechenweg fürs Kopfrechnen mit den konkreten Zahlen, in nummerierten Schritten.',
    'Nutze deutsches Zahlenformat (Punkt als Tausendertrenner, Komma als Dezimaltrenner), kein LaTeX, keine Überschriften.',
    'Schließe mit einem kurzen Plausibilitätscheck und einem Merksatz.',
    value.kind === 'task'
      ? 'Antworte mit höchstens 120 Wörtern. Wenn die Antwort des Nutzers falsch war, nenne zuerst kurz den wahrscheinlichen Denkfehler (z. B. einen Nullen-Fehler).'
      : 'Antworte mit höchstens 180 Wörtern, für jemanden, dem dieser Aufgabentyp schwerfällt, und gib 2 eigene Mini-Beispiele.',
  ].join('\n');

  const lines = [`Aufgabentyp: ${sub.name}`, `Kategorie: ${cat ? cat.name : sub.category}`];
  if (value.kind === 'task') {
    lines.push(`Aufgabe: ${value.prompt}`);
    lines.push(`Richtige Antwort: ${num(value.expected)}${value.unit ? ' ' + value.unit : ''}`);
    if (value.given !== null && value.given !== undefined) {
      lines.push(`Antwort des Nutzers (falsch): ${num(value.given)}${value.unit ? ' ' + value.unit : ''}`);
    }
    const entries = Object.entries(value.params || {});
    if (entries.length) lines.push('Parameter: ' + entries.map(([k, v]) => `${k}=${v}`).join(', '));
  } else {
    lines.push('Erkläre die Methode für diesen Aufgabentyp allgemein.');
  }
  if (method) {
    lines.push('Bevorzugte Methode der App (bitte darauf aufbauen):');
    lines.push(`Idee: ${method.idea}`);
    if (Array.isArray(method.steps)) lines.push('Schritte: ' + method.steps.join(' | '));
    if (method.trick) lines.push(`Trick: ${method.trick}`);
  }
  return { system, user: lines.join('\n') };
}

export async function callGemini({ apiKey, model, system, user, fetchImpl = fetch }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
      }),
    });
  } catch {
    const e = new Error('upstream unreachable');
    e.status = 502;
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`upstream status ${res.status}`);
    e.status = res.status;
    throw e;
  }
  let data;
  try {
    data = await res.json();
  } catch {
    const e = new Error('upstream invalid json');
    e.status = 502;
    throw e;
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim() : '';
  if (!text) {
    const e = new Error('empty response');
    e.status = 502;
    throw e;
  }
  return { text, model };
}

// ---- Rate-Limit (best effort, pro Isolate) ----
const ipHits = new Map(); // ip -> number[] (Zeitstempel, letzte 24 h)
let globalHits = [];
export function _resetRateLimits() {
  ipHits.clear();
  globalHits = [];
}

function rateLimited(ip, t) {
  const DAY = 86400000;
  const MIN = 60000;
  globalHits = globalHits.filter((x) => t - x < MIN);
  const arr = (ipHits.get(ip) || []).filter((x) => t - x < DAY);
  const lastMin = arr.filter((x) => t - x < MIN).length;
  if (globalHits.length >= 60 || lastMin >= 15 || arr.length >= 200) {
    ipHits.set(ip, arr);
    return true;
  }
  arr.push(t);
  globalHits.push(t);
  ipHits.set(ip, arr);
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) if (!v.length || t - v[v.length - 1] >= DAY) ipHits.delete(k);
  }
  return false;
}

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

function originOk(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function handleExplain(request, env = {}, { fetchImpl = fetch, now = Date.now } = {}) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: 'POST' },
    });
  }
  if (!originOk(request)) return json(403, { error: 'forbidden' });

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (rateLimited(ip, now())) return json(429, { error: 'rate_limited' });

  let raw;
  try {
    raw = await request.text();
  } catch {
    return json(400, { error: 'invalid' });
  }
  if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid' });
  }
  const v = validateExplainRequest(body);
  if (!v.ok) return json(400, { error: 'invalid' });

  const apiKey = env && env.GOOGLE_API_KEY;
  if (!apiKey) return json(503, { error: 'not_configured' });

  const model = (env && env.GEMINI_MODEL) || DEFAULT_MODEL;
  const { system, user } = buildPrompt(v.value);
  try {
    const out = await callGemini({ apiKey, model, system, user, fetchImpl });
    return json(200, { text: out.text, model: out.model });
  } catch (e) {
    if (e && e.status === 429) return json(429, { error: 'quota' });
    return json(502, { error: 'upstream' });
  }
}
