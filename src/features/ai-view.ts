import type { AiInline, AiResult } from '../types.ts';
import { h } from '../ui/dom.ts';
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

export function aiBox(text: string): HTMLDivElement {
  const box = h('div', { class: 'ai-box', tabindex: '-1' }, h('div', { class: 'ai-label' }, t('lernen.aiLabel')));
  for (const block of parseAiText(text)) {
    if (block.type === 'p') {
      box.append(h('p', null, partNodes(block.parts)));
    } else {
      box.append(h(block.type, { class: block.type === 'ol' ? 'steps' : 'bullets' },
        block.items.map((parts) => h('li', null, partNodes(parts)))));
    }
  }
  return box;
}

export function aiControl(label: string, fetcher: () => Promise<AiResult>): HTMLDivElement {
  const out = h('div', { class: 'ai-out', 'aria-live': 'polite' });
  const btn = h('button', {
    type: 'button', class: 'btn small',
    onclick: async () => {
      btn.disabled = true;
      btn.textContent = t('lernen.aiBusy');
      let res: AiResult | null;
      try { res = await fetcher(); } catch { res = null; }
      if (res && res.ok) {
        const box = aiBox(res.text);
        out.replaceChildren(box);
        btn.remove();
        box.focus();
      } else {
        out.replaceChildren(h('p', { class: 'small muted' }, (res && !res.ok && res.message) || t('lernen.aiUnavailable')));
        btn.disabled = false;
        btn.textContent = label;
      }
    },
  }, label);
  return h('div', { class: 'ai' }, btn, out);
}
