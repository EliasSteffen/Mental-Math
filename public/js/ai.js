// Client für /api/explain + sicherer Mini-Markdown-Parser (kein HTML, nur Datenstruktur)
const CACHE_KEY = 'kopfrechner.ai.v1';
const OFF_KEY = 'kopfrechner.ai.off';
const MAX_CACHE = 100;
const TIMEOUT_MS = 20000;

const MESSAGES = {
  quota: 'KI-Kontingent für heute aufgebraucht – versuch es später.',
  rate_limited: 'Zu viele Anfragen – kurz warten.',
};
const DEFAULT_MESSAGE = 'KI gerade nicht erreichbar.';

export function isAiAvailable() {
  try {
    return sessionStorage.getItem(OFF_KEY) !== '1';
  } catch {
    return true;
  }
}

function setOff() {
  try {
    sessionStorage.setItem(OFF_KEY, '1');
  } catch {
    /* ignorieren */
  }
}

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (c && typeof c === 'object' && Array.isArray(c.order) && c.items && typeof c.items === 'object') return c;
  } catch {
    /* ignorieren */
  }
  return { order: [], items: {} };
}

function cacheGet(key) {
  const c = readCache();
  return Object.prototype.hasOwnProperty.call(c.items, key) ? c.items[key] : null;
}

function cacheSet(key, text) {
  try {
    const c = readCache();
    c.order = c.order.filter((k) => k !== key);
    c.order.push(key);
    c.items[key] = text;
    while (c.order.length > MAX_CACHE) delete c.items[c.order.shift()];
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignorieren */
  }
}

const fail = (error) => ({ ok: false, error, message: MESSAGES[error] || DEFAULT_MESSAGE });

async function request(payload, key) {
  const cached = cacheGet(key);
  if (cached) return { ok: true, text: cached };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('/api/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (res.status === 404 || res.status === 405 || res.status === 503) {
      setOff();
      return fail('unavailable');
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* ignorieren */
    }
    if (!res.ok) return fail((data && data.error) || 'upstream');
    if (!data || typeof data.text !== 'string' || !data.text.trim()) return fail('upstream');
    cacheSet(key, data.text);
    return { ok: true, text: data.text };
  } catch {
    return fail('network');
  } finally {
    clearTimeout(timer);
  }
}

export function aiExplainTask(task, given) {
  const g = typeof given === 'number' && Number.isFinite(given) ? given : null;
  const payload = {
    kind: 'task',
    subtype: task.subtype,
    prompt: task.prompt,
    params: task.params || {},
    expected: task.expected,
    unit: task.unit || '',
    given: g,
  };
  return request(payload, `t|${task.subtype}|${task.prompt}|${g === null ? '' : g}`);
}

export function aiExplainMethod(subtypeId) {
  return request({ kind: 'method', subtype: subtypeId }, `m|${subtypeId}`);
}

// ---- Mini-Markdown → Blocks ----
export function parseInline(s) {
  const parts = [];
  const re = /\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  let m;
  const push = (text, bold, italic) => {
    if (text) parts.push({ text, bold, italic });
  };
  while ((m = re.exec(s))) {
    push(s.slice(last, m.index), false, false);
    if (m[1] !== undefined) push(m[1], true, false);
    else push(m[2], false, true);
    last = m.index + m[0].length;
  }
  push(s.slice(last), false, false);
  return parts.length ? parts : [{ text: '', bold: false, italic: false }];
}

export function parseAiText(text) {
  const clean = String(text ?? '').replace(/\r\n?/g, '\n').replace(/`/g, '');
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', parts: parseInline(para.join(' ')) });
    para = [];
  };
  const flushList = () => {
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
    if (ol || ul) {
      flushPara();
      const type = ol ? 'ol' : 'ul';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(parseInline((ol || ul)[1]));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}
