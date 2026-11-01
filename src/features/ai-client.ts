// Client für /api/explain + sicherer Mini-Markdown-Parser (kein HTML, nur Datenstruktur)
import type { AiBlock, AiInline, AiResult, SubtypeId, Task } from '../types.ts';
import { getLang } from '../i18n/index.ts';
import { apiUrl } from '../platform/index.ts';

const CACHE_KEY = 'kopfrechner.ai.v1';
const OFF_KEY = 'kopfrechner.ai.off';
const MAX_CACHE = 100;
const TIMEOUT_MS = 20000;

const MESSAGES: Record<string, string> = {
  quota: 'KI-Kontingent für heute aufgebraucht – versuch es später.',
  rate_limited: 'Zu viele Anfragen – kurz warten.',
};
const DEFAULT_MESSAGE = 'KI gerade nicht erreichbar.';

interface AiCache { order: string[]; items: Record<string, string> }

export function isAiAvailable(): boolean {
  try {
    return sessionStorage.getItem(OFF_KEY) !== '1';
  } catch {
    return true;
  }
}

function setOff(): void {
  try {
    sessionStorage.setItem(OFF_KEY, '1');
  } catch {
    /* ignorieren */
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readCache(): AiCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const c: unknown = raw === null ? null : JSON.parse(raw);
    if (isRecord(c) && Array.isArray(c['order']) && isRecord(c['items'])) {
      return { order: c['order'] as string[], items: c['items'] as Record<string, string> };
    }
  } catch {
    /* ignorieren */
  }
  return { order: [], items: {} };
}

function cacheGet(key: string): string | null {
  const c = readCache();
  return Object.prototype.hasOwnProperty.call(c.items, key) ? (c.items[key] ?? null) : null;
}

function cacheSet(key: string, text: string): void {
  try {
    const c = readCache();
    c.order = c.order.filter((k) => k !== key);
    c.order.push(key);
    c.items[key] = text;
    while (c.order.length > MAX_CACHE) {
      const old = c.order.shift();
      if (old !== undefined) delete c.items[old];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignorieren */
  }
}

const fail = (error: string): AiResult => ({ ok: false, error, message: MESSAGES[error] || DEFAULT_MESSAGE });

async function request(payload: Record<string, unknown>, key: string): Promise<AiResult> {
  const cached = cacheGet(key);
  if (cached) return { ok: true, text: cached };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(apiUrl('/api/explain'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (res.status === 404 || res.status === 405 || res.status === 503) {
      setOff();
      return fail('unavailable');
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* ignorieren */
    }
    if (!res.ok) return fail((isRecord(data) && typeof data['error'] === 'string' && data['error']) || 'upstream');
    if (!isRecord(data) || typeof data['text'] !== 'string' || !data['text'].trim()) return fail('upstream');
    cacheSet(key, data['text']);
    return { ok: true, text: data['text'] };
  } catch {
    return fail('network');
  } finally {
    clearTimeout(timer);
  }
}

/** `correct`: Wertung der App (inkl. Toleranz), damit die KI einer richtigen Antwort keinen Fehler unterstellt. */
export function aiExplainTask(task: Task, given: number | null | undefined, correct: boolean): Promise<AiResult> {
  const g = typeof given === 'number' && Number.isFinite(given) ? given : null;
  const payload = {
    kind: 'task',
    subtype: task.subtype,
    prompt: task.prompt,
    params: task.params || {},
    expected: task.expected,
    unit: task.unit || '',
    given: g,
    correct,
    lang: getLang(),
  };
  return request(payload, `${getLang()}|t|${task.subtype}|${task.prompt}|${g === null ? '' : g}|${correct ? 1 : 0}`);
}

export function aiExplainMethod(subtypeId: SubtypeId): Promise<AiResult> {
  return request({ kind: 'method', subtype: subtypeId, lang: getLang() }, `${getLang()}|m|${subtypeId}`);
}

// ---- Mini-Markdown → Blocks ----
export function parseInline(s: string): AiInline[] {
  const parts: AiInline[] = [];
  const re = /\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const push = (text: string, bold: boolean, italic: boolean): void => {
    if (text) parts.push({ text, bold, italic });
  };
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index), false, false);
    if (m[1] !== undefined) push(m[1], true, false);
    else push(m[2] ?? '', false, true);
    last = m.index + m[0].length;
  }
  push(s.slice(last), false, false);
  return parts.length ? parts : [{ text: '', bold: false, italic: false }];
}

export function parseAiText(text: unknown): AiBlock[] {
  const clean = String(text ?? '').replace(/\r\n?/g, '\n').replace(/`/g, '');
  const blocks: AiBlock[] = [];
  let para: string[] = [];
  let list: { type: 'ol' | 'ul'; items: AiInline[][] } | null = null;
  const flushPara = (): void => {
    if (para.length) blocks.push({ type: 'p', parts: parseInline(para.join(' ')) });
    para = [];
  };
  const flushList = (): void => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const rawLine of clean.split('\n')) {
    const line = rawLine.replace(/^\s*#{1,6}\s+/, '').trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    const ul = /^[-*•]\s+(.*)$/.exec(line);
    const hit = ol ?? ul;
    if (hit) {
      flushPara();
      const type = ol ? 'ol' : 'ul';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(parseInline(hit[1] ?? ''));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
