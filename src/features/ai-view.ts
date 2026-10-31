// KI-Erklärung (Lernen-Detail, Feedback-Sheet): Kit-Button mit Sprechblase, Antwort als ruhige Karte (.ai-answer).
import type { AiInline, AiResult } from '../types.ts';
import { h } from '../ui/dom.ts';
import { button, setButtonLabel, steps } from '../ui/kit.ts';
import { t } from '../i18n/index.ts';
import { parseAiText } from './ai-client.ts';

export function partNodes(parts: readonly AiInline[] | null | undefined): Node[] {
  return (parts || []).map((p) => {
    let node: Node = document.createTextNode(p.text);
    if (p.italic) node = h('em', null, node);
    if (p.bold) node = h('strong', null, node);
    return node;
  });
}

/** Antwort der KI: Absätze, nummerierte Schritte (.steps) und Listen mit kleinen Punkten (.method-list). */
export function aiBox(text: string): HTMLDivElement {
  const box = h('div', { class: 'ai-answer', tabindex: '-1' }, h('p', { class: 'ai-label' }, t('lernen.aiLabel')));
  for (const block of parseAiText(text)) {
    if (block.type === 'p') {
      box.append(h('p', null, partNodes(block.parts)));
    } else if (block.type === 'ol') {
      box.append(steps(block.items.map((parts) => partNodes(parts))));
    } else {
      box.append(h('ul', { class: 'method-list' }, block.items.map((parts) => h('li', null, partNodes(parts)))));
    }
  }
  return box;
}

/**
 * Button „Mit KI erklären“ (Sprechblase) und darunter die Antwort. `kind`: 'soft' (Standard, eigenständig) oder
 * 'outline' (neben „Methode“ im Feedback-Sheet).
 */
export function aiControl(label: string, fetcher: () => Promise<AiResult>, { kind = 'soft' }: { kind?: 'soft' | 'outline' } = {}): HTMLDivElement {
  const out = h('div', { class: 'ai-out', 'aria-live': 'polite' });
  const btn = button({
    label, kind, icon: 'chat',
    onClick: async () => {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      setButtonLabel(btn, t('lernen.aiBusy'));
      let res: AiResult | null;
      try { res = await fetcher(); } catch { res = null; }
      btn.removeAttribute('aria-busy');
      if (res && res.ok) {
        const box = aiBox(res.text);
        out.replaceChildren(box);
        btn.remove();
        box.focus();
      } else {
        out.replaceChildren(h('p', { class: 'ai-note' }, (res && !res.ok && res.message) || t('lernen.aiUnavailable')));
        btn.disabled = false;
        setButtonLabel(btn, label);
      }
    },
  });
  return h('div', { class: 'ai' }, btn, out);
}
