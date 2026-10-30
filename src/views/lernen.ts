import type { Level, Subtype, SkillStats } from '../types.ts';
import { fmt, fmtSeconds } from '../core/numbers.ts';
import { CATEGORIES, SUBTYPES, LEVEL_NAMES } from '../core/catalog.ts';
import { generate } from '../core/generators/index.ts';
import { subtypeStats, levelFor } from '../core/scoring.ts';
import { getMethod } from '../core/methods.ts';
import { aiExplainMethod, isAiAvailable } from '../features/ai-client.ts';
import { aiControl } from '../features/ai-view.ts';
import { getAttempts, getSettings } from '../data/storage.ts';
import { icon, ring } from '../ui/charts.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { skeleton, deferRender } from '../ui/skeleton.ts';
import { t } from '../i18n/index.ts';
import { safeSteps, stepsList } from '../ui/widgets.ts';

function learnCard(sub: Subtype, stat: SkillStats | undefined, open: boolean, lvl: Level): HTMLDetailsElement {
  const m = getMethod(sub.id);
  const exBody = h('div', { class: 'example-body' });

  function drawExample(): void {
    const task = generate(sub.id);
    const steps = safeSteps(task);
    const choices = task.kind === 'choice' && Array.isArray(task.choices) ? task.choices : null;
    const answer = choices ? String(choices[task.expected])
      : `${fmt(task.expected as number)}${task.unit ? ' ' + task.unit : ''}`;
    const solution = h('div', { class: 'example-solution', hidden: true },
      steps.length ? stepsList(steps) : h('p', null, t('lernen.solution', { answer })));
    const showBtn = h('button', {
      type: 'button', class: 'btn small',
      onclick: () => {
        solution.hidden = !solution.hidden;
        showBtn.textContent = solution.hidden ? t('lernen.showSolution') : t('lernen.hideSolution');
      },
    }, t('lernen.showSolution'));
    const newBtn = h('button', { type: 'button', class: 'btn small', onclick: drawExample }, t('lernen.newExample'));
    exBody.replaceChildren();
    appendChildren(exBody, [
      h('div', { class: 'example-prompt' }, task.prompt),
      choices ? h('ul', { class: 'bullets' }, choices.map((c) => h('li', null, c))) : null,
      task.hint || (!choices && task.unit)
        ? h('div', { class: 'small muted' }, [task.hint, task.unit ? t('lernen.answerIn', { unit: task.unit }) : null].filter(Boolean).join(' · '))
        : null,
      h('div', { class: 'card-actions' }, showBtn, newBtn),
      solution]);
  }
  drawExample();

  const score = stat ? stat.score : null;
  return h('details', { class: 'learn-card', id: `learn-${sub.id}`, open },
    h('summary', null,
      score === null || score === undefined
        ? h('span', { class: 'chip' }, t('lernen.isNew'))
        : ring(score / 100, { size: 'sm', text: String(score) }),
      h('span', { class: 'ls-name' }, sub.name),
      h('span', { class: 'chip' }, LEVEL_NAMES[lvl]),
      h('span', { class: 'ls-goal muted' }, t('lernen.goal', { time: fmtSeconds(sub.targetMs) }))),
    h('div', { class: 'learn-body' },
      m ? h('div', { class: 'method' },
        h('p', { class: 'method-idea' }, m.idea),
        m.steps && m.steps.length ? h('div', null, h('h4', { class: 'method-heading' }, t('lernen.approach')), stepsList(m.steps)) : null,
        m.trick ? h('div', { class: 'callout' }, h('span', { class: 'callout-label' }, t('lernen.trick')), m.trick) : null,
        m.pitfalls && m.pitfalls.length
          ? h('div', null, h('h4', { class: 'method-heading' }, t('lernen.pitfalls')),
            h('ul', { class: 'bullets' }, m.pitfalls.map((p) => h('li', null, p))))
          : null) : null,
      h('div', { class: 'example' }, h('h4', { class: 'method-heading' }, t('lernen.example')), exBody),
      h('div', { class: 'btn-row' }, h('a', { class: 'btn primary', href: `#/train/${sub.id}?intro=1&n=5` }, t('lernen.practice'))),
      isAiAvailable() ? aiControl(t('lernen.aiExplain'), () => aiExplainMethod(sub.id)) : null));
}

export function renderLernen(openId: string | null): void {
  const attempts = getAttempts();
  const stats = subtypeStats(attempts);
  const difficulty = getSettings().difficulty;
  const sections = CATEGORIES.map((c) => {
    const subs = Object.values(SUBTYPES).filter((s) => s.category === c.id);
    const cardsSk = skeleton('cards', subs.length);
    deferRender(cardsSk, () => {
      const stack = h('div', { class: 'stack' }, subs.map((s) => learnCard(s, stats[s.id], s.id === openId, levelFor(s.id, attempts, difficulty))));
      if (openId) {
        const el = stack.querySelector(`#learn-${openId}`);
        if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
      }
      return stack;
    });
    return h('section', null,
      h('h2', { class: 'section-title' }, icon('book', { size: 18 }), ' ', c.name, h('span', { class: 'muted section-sub' }, ` · ${c.description}`)),
      cardsSk);
  });
  appendChildren(app, [
    h('div', { class: 'stack' },
      h('h1', { class: 'page-title' }, t('lernen.title')),
      h('p', { class: 'muted' }, t('lernen.intro'))),
    sections,
  ]);
}
