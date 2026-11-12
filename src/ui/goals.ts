// Nächstes Ziel als eine Zeile (v10 F): Symbol, Name, Text und dünner Balken. Antippbar; der Text kürzt sich mit Ellipse.
import type { NextGoal } from '../core/next-goal.ts';
import { progressBar } from './charts.ts';
import { h } from './dom.ts';
import { icon } from './kit.ts';
import { t } from '../i18n/index.ts';

export function nextGoalLine(goal: NextGoal): HTMLAnchorElement {
  return h('a', { class: `goal-next press is-${goal.kind}`, href: goal.href },
    h('span', { class: 'goal-next-icon', 'aria-hidden': 'true' }, icon('target', 16)),
    h('span', { class: 'goal-next-label' }, t('goals.next')),
    h('span', { class: 'goal-next-text' }, goal.label),
    h('span', { class: 'goal-next-meter' }, progressBar(goal.progress * 100, { decorative: true })));
}
