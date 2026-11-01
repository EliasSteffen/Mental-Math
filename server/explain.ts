// POST /api/explain – validiert, baut den Prompt, ruft Gemini auf (Cloudflare Workers + Node >= 20)
import { SUBTYPES, CATEGORIES } from '../src/core/catalog.ts';
import { getMethod } from '../src/core/methods.ts';
import type { Params, ParamValue } from '../src/types.ts';
import { locale } from '../src/i18n/index.ts';
import type { Lang } from '../src/i18n/index.ts';
import { APP_ORIGIN } from './app-origin.ts';
import { durableLimiter, memoryLimiter } from './rate-limit.ts';
import type { DoNamespace, RateLimiter } from './rate-limit.ts';

const DEFAULT_MODEL = 'gemini-flash-lite-latest';
const MAX_BODY = 4000;
const JSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

export interface ExplainMethodValue { kind: 'method'; subtype: string; lang?: Lang }
export interface ExplainTaskValue {
  kind: 'task';
  subtype: string;
  prompt: string;
  params: Params;
  expected: number;
  unit: string;
  given: number | null;
  /** Antwortsprache der KI (Standard: de) */
  lang?: Lang;
}
export type ExplainValue = ExplainMethodValue | ExplainTaskValue;
export type ExplainValidation = { ok: true; value: ExplainValue } | { ok: false; error: 'invalid' };

export interface ExplainEnv { GOOGLE_API_KEY?: string; GEMINI_MODEL?: string; RATE_LIMITER?: DoNamespace }
export type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;
export interface ExplainDeps { fetchImpl?: FetchImpl; now?: () => number }

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown, max: number): x is string => typeof x === 'string' && x.length <= max;
const INVALID = { ok: false, error: 'invalid' } as const;

export function validateExplainRequest(body: unknown): ExplainValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return INVALID;
  const b = body as Record<string, unknown>;
  const { kind, subtype } = b;
  if (kind !== 'task' && kind !== 'method') return INVALID;
  if (typeof subtype !== 'string' || !Object.prototype.hasOwnProperty.call(SUBTYPES, subtype)) return INVALID;
  const lang = b['lang'] === undefined ? 'de' : b['lang'];
  if (lang !== 'de' && lang !== 'en') return INVALID;
  if (kind === 'method') return { ok: true, value: { kind, subtype, lang } };

  const { prompt, params, expected, unit, given } = b;
  if (!isStr(prompt, 160) || prompt.length === 0) return INVALID;
  if (!isNum(expected)) return INVALID;
  const u = unit === undefined || unit === null ? '' : unit;
  if (!isStr(u, 20)) return INVALID;
  const g = given === undefined ? null : given;
  if (g !== null && !isNum(g)) return INVALID;
  const p = params === undefined || params === null ? {} : params;
  if (typeof p !== 'object' || Array.isArray(p)) return INVALID;
  const rec = p as Record<string, unknown>;
  const keys = Object.keys(rec);
  if (keys.length > 12) return INVALID;
  const cleanParams: Params = {};
  for (const k of keys) {
    const v = rec[k];
    if (k.length > 40) return INVALID;
    if (!(isNum(v) || isStr(v, 40))) return INVALID;
    cleanParams[k] = v;
  }
  return { ok: true, value: { kind, subtype, prompt, params: cleanParams, expected, unit: u, given: g, lang } };
}

// Prompt-Texte je Sprache: Anweisungen ans Modell und Beschriftungen der Aufgabendaten
const PROMPT: Record<Lang, Record<'coach' | 'steps' | 'format' | 'close' | 'task' | 'method' | 'type' | 'cat' | 'ask' | 'choice'
  | 'right' | 'wrong' | 'params' | 'general' | 'pref' | 'idea' | 'stepsL' | 'trick', string>> = {
  de: {
    coach: 'Du bist ein Mathe-Coach für Consulting-Case-Interviews.',
    steps: 'Erkläre den Rechenweg fürs Kopfrechnen mit den konkreten Zahlen, in nummerierten Schritten.',
    format: 'Nutze deutsches Zahlenformat (Punkt als Tausendertrenner, Komma als Dezimaltrenner), kein LaTeX, keine Überschriften.',
    close: 'Schließe mit einem kurzen Plausibilitätscheck und einem Merksatz.',
    task: 'Antworte mit höchstens 120 Wörtern. Wenn die Antwort des Nutzers falsch war, nenne zuerst kurz den wahrscheinlichen Denkfehler (z. B. einen Nullen-Fehler).',
    method: 'Antworte mit höchstens 180 Wörtern, für jemanden, dem dieser Aufgabentyp schwerfällt, und gib 2 eigene Mini-Beispiele.',
    type: 'Aufgabentyp', cat: 'Kategorie', ask: 'Aufgabe', choice: 'Auswahl-Aufgabe mit den Optionen', right: 'Richtige Antwort',
    wrong: 'Antwort des Nutzers (falsch)', params: 'Parameter', general: 'Erkläre die Methode für diesen Aufgabentyp allgemein.',
    pref: 'Bevorzugte Methode der App (bitte darauf aufbauen):', idea: 'Idee', stepsL: 'Schritte', trick: 'Trick',
  },
  en: {
    coach: 'You are a maths coach for consulting case interviews.',
    steps: 'Explain the mental-maths solution with the concrete numbers, in numbered steps.',
    format: 'Answer in English. Use English number format (comma as thousands separator, point as decimal separator), no LaTeX, no headings.',
    close: 'Finish with a short sanity check and a one-line takeaway.',
    task: 'Answer in at most 120 words. If the user’s answer was wrong, first briefly name the likely mistake (e.g. a zeros error).',
    method: 'Answer in at most 180 words, for someone who finds this task type hard, and give 2 mini examples of your own.',
    type: 'Task type', cat: 'Category', ask: 'Task', choice: 'Multiple-choice task with the options', right: 'Correct answer',
    wrong: 'User’s answer (wrong)', params: 'Parameters', general: 'Explain the method for this task type in general.',
    pref: 'The app’s preferred method (please build on it):', idea: 'Idea', stepsL: 'Steps', trick: 'Trick',
  },
};

export function buildPrompt(value: ExplainValue): { system: string; user: string } {
  const sub = SUBTYPES[value.subtype];
  if (!sub) throw new Error(`unknown subtype ${value.subtype}`);
  const cat = CATEGORIES.find((c) => c.id === sub.category);
  const lang: Lang = value.lang === 'en' ? 'en' : 'de';
  const L = PROMPT[lang];
  const nf = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 4 });
  const num = (x: number): string => nf.format(x);
  const method = getMethod(value.subtype, lang);
  const system = [L.coach, L.steps, L.format, L.close, value.kind === 'task' ? L.task : L.method].join('\n');

  const lines = [`${L.type}: ${sub.name}`, `${L.cat}: ${cat ? cat.name : sub.category}`];
  if (value.kind === 'task') {
    lines.push(`${L.ask}: ${value.prompt}`);
    const p: Params = value.params || {};
    const opts = [0, 1, 2, 3].map((i) => p['c' + i]).filter((x): x is string => typeof x === 'string');
    const isChoice = typeof p['c0'] === 'string';
    const unit = value.unit ? ' ' + value.unit : '';
    if (isChoice) {
      lines.push(`${L.choice}: ` + opts.map((o, i) => `${i + 1}) ${o}`).join(' | '));
      lines.push(`${L.right}: ${opts[value.expected] ?? num(value.expected)}`);
      if (value.given !== null && value.given !== undefined) {
        lines.push(`${L.wrong}: ${opts[value.given] ?? num(value.given)}`);
      }
    } else {
      lines.push(`${L.right}: ${num(value.expected)}${unit}`);
      if (value.given !== null && value.given !== undefined) {
        lines.push(`${L.wrong}: ${num(value.given)}${unit}`);
      }
    }
    const entries = Object.entries(p).filter(([k]) => !(isChoice && /^c[0-3]$/.test(k)));
    if (entries.length) lines.push(`${L.params}: ` + entries.map(([k, v]: [string, ParamValue]) => `${k}=${v}`).join(', '));
  } else {
    lines.push(L.general);
  }
  if (method) {
    lines.push(L.pref);
    lines.push(`${L.idea}: ${method.idea}`);
    if (Array.isArray(method.steps)) lines.push(`${L.stepsL}: ` + method.steps.join(' | '));
    if (method.trick) lines.push(`${L.trick}: ${method.trick}`);
  }
  return { system, user: lines.join('\n') };
}

class UpstreamError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown } | null> } }> }

export async function callGemini(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  fetchImpl?: FetchImpl;
}): Promise<{ text: string; model: string }> {
  const { apiKey, model, system, user, fetchImpl = fetch } = args;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  let res: Response;
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
    throw new UpstreamError('upstream unreachable', 502);
  }
  if (!res.ok) throw new UpstreamError(`upstream status ${res.status}`, res.status);
  let data: GeminiResponse;
  try {
    data = (await res.json()) as GeminiResponse;
  } catch {
    throw new UpstreamError('upstream invalid json', 502);
  }
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim()
    : '';
  if (!text) throw new UpstreamError('empty response', 502);
  return { text, model };
}

// ---- Rate-Limit: global per Durable Object (Binding RATE_LIMITER), sonst pro Isolate ----
const memory = memoryLimiter();
export function _resetRateLimits(): void {
  memory.reset();
}
const limiterFor = (env: ExplainEnv): RateLimiter => (env.RATE_LIMITER ? durableLimiter(env.RATE_LIMITER, memory) : memory);

const json = (status: number, obj: unknown): Response =>
  new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });

function originOk(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  if (origin === APP_ORIGIN) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function handleExplain(
  request: Request,
  env: ExplainEnv = {},
  { fetchImpl = fetch, now = Date.now }: ExplainDeps = {},
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...JSON_HEADERS, Allow: 'POST' },
    });
  }
  if (!originOk(request)) return json(403, { error: 'forbidden' });

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (await limiterFor(env).limited(ip, now())) return json(429, { error: 'rate_limited' });

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json(400, { error: 'invalid' });
  }
  if (raw.length > MAX_BODY) return json(413, { error: 'too_large' });
  let body: unknown;
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
    if (e instanceof UpstreamError && e.status === 429) return json(429, { error: 'quota' });
    return json(502, { error: 'upstream' });
  }
}
