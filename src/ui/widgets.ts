import type { Method, Task } from '../types.ts';
import { solutionSteps } from '../core/solutions/index.ts';
import { h } from './dom.ts';

export type ScoreLevel = 'muted' | 'good' | 'warn' | 'bad';

export function level(score: number | null | undefined): ScoreLevel {
  if (score === null || score === undefined) return 'muted';
  if (score >= 85) return 'good';
  if (score >= 60) return 'warn';
  return 'bad';
}

export function badge(score: number | null | undefined): HTMLSpanElement {
  const lv = level(score);
  return h('span', { class: `badge ${lv}` }, lv === 'muted' ? 'neu' : String(score));
}

export function tile(value: string, label: string, lv?: string): HTMLDivElement {
  return h('div', { class: `tile${lv ? ' ' + lv : ''}` },
    h('div', { class: 'tile-value' }, value),
    h('div', { class: 'tile-label' }, label));
}

export function pct(x: number | null | undefined): string {
  return `${Math.round((x || 0) * 100)} %`;
}

export function safeSteps(task: Pick<Task, 'subtype' | 'params' | 'expected' | 'unit' | 'prompt'> | Task): string[] {
  try {
    const steps = solutionSteps(task as Task);
    return Array.isArray(steps) ? steps : [];
  } catch {
    return [];
  }
}

export function stepsList(steps: readonly string[]): HTMLOListElement {
  return h('ol', { class: 'steps' }, steps.map((s) => h('li', null, s)));
}

export function fold(
  summaryText: string,
  content: Node,
  { open = false, cls = '' }: { open?: boolean; cls?: string } = {},
): HTMLDetailsElement {
  return h('details', { class: `fold${cls ? ' ' + cls : ''}`, open },
    h('summary', null, summaryText),
    h('div', { class: 'fold-body' }, content));
}

export function methodBlock(
  m: Method,
  { pitfalls = false, link = null }: { pitfalls?: boolean; link?: string | null } = {},
): HTMLDivElement {
  return h('div', { class: 'method' },
    h('p', { class: 'method-idea' }, m.idea),
    m.steps && m.steps.length ? stepsList(m.steps) : null,
    m.trick ? h('div', { class: 'callout' }, h('span', { class: 'callout-label' }, 'Trick'), m.trick) : null,
    pitfalls && m.pitfalls && m.pitfalls.length
      ? h('div', null, h('h4', { class: 'method-heading' }, 'Typische Fehler'),
        h('ul', { class: 'bullets' }, m.pitfalls.map((p) => h('li', null, p))))
      : null,
    link ? h('a', { class: 'linkbtn', href: link, target: '_blank', rel: 'noopener' }, 'Im Lernbereich öffnen') : null);
}
