// Freund herausfordern (v9 I): Übergabe an #/train/duel über sessionStorage und das Teilen-Sheet mit optionalem Namen.
import { cleanDuelName, decodeDuel, duelBase, encodeDuel, type DuelBase, type DuelPayload, type DuelStats } from '../core/duel-link.ts';
import { fmtSeconds } from '../core/numbers.ts';
import { getSettings, setSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { publicUrl, shareText } from '../platform/index.ts';
import { h } from '../ui/dom.ts';
import { button } from '../ui/kit.ts';
import { openSheet } from '../ui/sheet.ts';
import { toast } from '../ui/toast.ts';
import { getAccountState } from './account.ts';

const KEY = 'mm.duel';

/** Gegner-Ergebnis (aus dem Link) samt Anzeigename */
export interface DuelOpponent extends DuelStats { name?: string }

export interface DuelHandoff { base: DuelBase; them: DuelOpponent | null }

/** Satz (und ggf. Ergebnis des Absenders) für die nächste Runde ablegen; false, wenn der Speicher nicht geht. */
export function stashDuel(p: DuelPayload, opponent: boolean): boolean {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ d: encodeDuel(p), opp: opponent }));
    return true;
  } catch {
    return false;
  }
}

/** Abgelegten Satz lesen (erneut geprüft wie ein Link); null, wenn nichts oder Ungültiges liegt. */
export function loadDuel(): DuelHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o: unknown = JSON.parse(raw);
    if (typeof o !== 'object' || o === null) return null;
    const rec = o as Record<string, unknown>;
    const p = decodeDuel(rec['d']);
    if (!p) return null;
    return { base: duelBase(p), them: rec['opp'] === true ? { c: p.c, p: p.p, t: p.t, ...(p.name ? { name: p.name } : {}) } : null };
  } catch {
    return null;
  }
}

/** Link zu einer Herausforderung */
export function duelUrl(p: DuelPayload): string {
  return `${publicUrl()}#/duell?d=${encodeDuel(p)}`;
}

/** Teilen-Sheet: optionaler Name (gemerkt in `duelName`), dann Link über das Teilen-Menü der Plattform. */
export function openDuelShare(base: DuelBase, mine: DuelStats): void {
  const st = getAccountState();
  const saved = getSettings().duelName;
  const suggestion = saved || (st.status === 'signed-in' ? cleanDuelName(st.user.username) : '');
  const inputId = 'duel-name';
  const input = h('input', {
    class: 'prof-input', id: inputId, type: 'text', maxlength: 24, autocomplete: 'nickname', placeholder: t('duel.namePlaceholder'), value: suggestion,
  });
  const send = button({ label: t('duel.share'), kind: 'primary', full: true, cta: false, type: 'submit', icon: 'link' });
  const form = h('form', { class: 'prof-form', novalidate: true },
    h('label', { class: 'prof-field', for: inputId }, t('duel.nameLabel')), input,
    h('p', { class: 'prof-sheet-text' }, t('duel.nameHint')), send);
  const sheet = openSheet({ title: t('duel.sheetTitle'), children: [h('p', { class: 'prof-sheet-text' }, t('duel.sheetText')), form] });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanDuelName(input.value);
    if (name !== saved) setSettings({ duelName: name });
    const url = duelUrl({ v: 1, ...base, ...mine, ...(name ? { name } : {}) });
    const params = { correct: mine.c, n: base.n, time: fmtSeconds(mine.t), url, name };
    send.disabled = true;
    void shareText(t(name ? 'duel.shareTextNamed' : 'duel.shareText', params)).then((res) => {
      if (res === 'copied') toast(t('duel.copied'), { kind: 'success' });
      if (res !== 'cancelled') sheet.close();
    }).finally(() => { send.disabled = false; });
  });
}
