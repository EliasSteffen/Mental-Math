// Lernen-Tab: Methodenliste mit Suche (#/lernen) und Detailseite je Aufgabentyp (#/lernen/:id).
// Die Suche filtert lokal (ohne rerender); die Scroll-Position von Liste und Detail merkt sich der Router.
import type { Level, Subtype, Task } from '../types.ts';
import { fmt, fmtSeconds } from '../core/numbers.ts';
import { CATEGORIES, LEVEL_NAMES, SUBTYPES, activeCategories } from '../core/catalog.ts';
import { generate } from '../core/generators/index.ts';
import { categoryStats, levelFor, subtypeStats } from '../core/scoring.ts';
import { getMethod } from '../core/methods.ts';
import { aiExplainMethod, isAiAvailable } from '../features/ai-client.ts';
import { aiControl } from '../features/ai-view.ts';
import { getAttempts, getSettings } from '../data/storage.ts';
import { app, appendChildren, h } from '../ui/dom.ts';
import {
  backLink, button, card, fold, group, insight, largeTitle, list, masteryMark, masteryOf, row, searchField, type Mastery,
} from '../ui/kit.ts';
import { setPrimaryAction } from '../ui/shell.ts';
import { t } from '../i18n/index.ts';
import { pitfallList, safeSteps, stepsList } from '../ui/widgets.ts';
import { matchesSearch, normalizeSearch, pickNext } from './lernen-search.ts';

/** Aufgaben je Übungsrunde aus dem Lernbereich (mit Methoden-Intro). */
const PRACTICE_N = 5;

const MASTERY_RANK: Readonly<Record<Mastery, number>> = { empty: 0, half: 1, full: 2 };

/** Letzte Suche – bleibt beim Wechsel Liste ↔ Detail (und beim Sprachwechsel) erhalten. */
let lastQuery = '';

const subtypesOf = (categoryId: string): Subtype[] => Object.values(SUBTYPES).filter((s) => s.category === categoryId);

const practiceHref = (id: string): string => `#/train/${id}?n=${PRACTICE_N}&intro=1`;

/* ---------- Liste ---------- */

interface Entry { el: HTMLElement; hay: string }
interface Section { el: HTMLElement; entries: Entry[] }

function renderList(): void {
  const attempts = getAttempts();
  const subStats = subtypeStats(attempts);
  const catStats = categoryStats(attempts);
  const cats = activeCategories(getSettings().enabledCategories);

  const sections: Section[] = [];
  const order: Array<{ sub: Subtype; mastery: Mastery }> = [];
  for (const c of cats) {
    const subs = subtypesOf(c.id);
    if (!subs.length) continue;
    const entries = subs.map((s): Entry => {
      const mastery = masteryOf(subStats[s.id]?.score);
      order.push({ sub: s, mastery });
      // Tipp-Zeile: kurzer, übersetzter Subtyp-Tipp; nur ohne ihn der (deutsche) Trick der Methode
      const trick = getMethod(s.id)?.trick ?? '';
      const tip = s.tip || trick;
      const el = row({ label: s.name, sub: tip || undefined, href: `#/lernen/${s.id}`, leading: masteryMark(mastery), class: 'learn-row' });
      return { el, hay: normalizeSearch([s.name, s.tip, trick, c.name].join(' ')) };
    });
    const score = catStats[c.id]?.score;
    const rows = list(entries.map((e) => e.el));
    const el = group({ title: c.name, meta: t('lernen.skill', { n: typeof score === 'number' ? score : '–' }) }, rows);
    el.classList.add('learn-group');
    sections.push({ el, entries });
  }

  // Ruhiger Leer-Hinweis; role=status liest ihn vor, sobald er erscheint
  const empty = h('p', { class: 'learn-empty', role: 'status' });

  function apply(query: string): void {
    lastQuery = query;
    const q = normalizeSearch(query);
    let shown = 0;
    for (const s of sections) {
      let any = false;
      for (const e of s.entries) {
        const ok = matchesSearch(e.hay, q);
        e.el.hidden = !ok;
        if (ok) { any = true; shown++; }
      }
      s.el.hidden = !any;
    }
    empty.textContent = shown ? '' : t('lernen.noResults', { q: query.trim() });
  }

  const search = searchField({ label: t('lernen.search'), placeholder: t('lernen.search'), onInput: apply });
  const input = search.querySelector('input');
  if (input && lastQuery) {
    input.value = lastQuery;
    apply(lastQuery);
  }

  appendChildren(app, [
    largeTitle(t('lernen.title'), t('lernen.subtitle')),
    search,
    sections.map((s) => s.el),
    empty,
  ]);

  // Weiterlernen: erster Subtyp mit der niedrigsten Meisterung (Kategorienreihenfolge); ohne Daten der erste
  const next = pickNext(order, (o) => MASTERY_RANK[o.mastery]);
  if (next) setPrimaryAction({ label: t('lernen.continue'), meta: next.sub.name, href: `#/lernen/${next.sub.id}` });
}

/* ---------- Detail ---------- */

/** Dezente Statuszeile: Meisterung, Skill, Versuche, Zielzeit, Stufe. */
function statusLine(sub: Subtype, score: number | null | undefined, count: number, lvl: Level): HTMLElement {
  const parts: string[] = [];
  if (typeof score === 'number') parts.push(t('lernen.skill', { n: score }));
  parts.push(count === 0 ? t('lernen.notPracticed')
    : count === 1 ? t('lernen.attemptsOne') : t('lernen.attempts', { n: fmt(count, 0) }));
  parts.push(t('lernen.goal', { time: fmtSeconds(sub.targetMs) }), t('lernen.level', { level: LEVEL_NAMES[lvl] }));
  const m = masteryOf(score);
  return h('p', { class: 'learn-status' }, masteryMark(m), h('span', null, parts.join(' · ')));
}

/** Beispielaufgabe mit aufklappbarem Lösungsweg; „Neues Beispiel“ würfelt neu (Fokus bleibt auf dem Button). */
function exampleGroup(sub: Subtype, lvl: Level): HTMLElement | null {
  const prompt = h('p', { class: 'learn-prompt', 'aria-live': 'polite' });
  const rest = h('div', { class: 'learn-example-rest' });

  function draw(): boolean {
    let task: Task;
    try {
      task = generate(sub.id, Math.random, { level: lvl });
    } catch {
      return false;
    }
    const steps = safeSteps(task);
    const choices = task.kind === 'choice' && Array.isArray(task.choices) ? task.choices : null;
    const answer = task.kind === 'choice'
      ? String(task.choices[task.expected] ?? '')
      : `${fmt(task.expected)}${task.unit ? ' ' + task.unit : ''}`;
    const note = [task.hint, !choices && task.unit ? t('lernen.answerIn', { unit: task.unit }) : ''].filter(Boolean).join(' · ');
    prompt.textContent = task.prompt;
    rest.replaceChildren();
    appendChildren(rest, [
      choices ? h('ul', { class: 'learn-choices' }, choices.map((c) => h('li', null, c))) : null,
      note ? h('p', { class: 'learn-note' }, note) : null,
      fold({
        label: t('lernen.solutionPath'),
        children: [steps.length ? stepsList(steps) : h('p', { class: 'learn-answer' }, t('lernen.solution', { answer }))],
      }),
    ]);
    return true;
  }
  if (!draw()) return null;

  const again = button({ label: t('lernen.newExample'), kind: 'link', icon: 'refresh', onClick: () => { draw(); } });
  again.classList.add('learn-again');
  return group(t('lernen.example'), card([prompt, rest, again]));
}

function renderDetail(sub: Subtype): void {
  const attempts = getAttempts();
  const score = subtypeStats(attempts)[sub.id]?.score;
  const count = attempts.reduce((n, a) => n + (a.subtype === sub.id ? 1 : 0), 0);
  const lvl = levelFor(sub.id, attempts, getSettings().difficulty);
  const m = getMethod(sub.id);
  const cat = CATEGORIES.find((c) => c.id === sub.category);

  appendChildren(app, [
    backLink({ label: t('lernen.title'), href: '#/lernen', ariaLabel: t('lernen.back') }),
    h('div', { class: 'learn-head' }, largeTitle(sub.name, cat?.name), statusLine(sub, score, count, lvl)),
    m?.idea ? group(t('lernen.idea'), card([h('p', { class: 'method-text' }, m.idea)])) : null,
    m?.steps?.length ? group(t('lernen.approach'), card([stepsList(m.steps)])) : null,
    exampleGroup(sub, lvl),
    m?.trick ? insight({ icon: 'bulb', tone: 'accent', title: t('lernen.trick'), text: m.trick }) : null,
    m?.pitfalls?.length ? group(t('lernen.pitfalls'), card([pitfallList(m.pitfalls)])) : null,
    isAiAvailable() ? aiControl(t('lernen.aiExplain'), () => aiExplainMethod(sub.id)) : null,
  ]);

  setPrimaryAction({ label: t('lernen.practice'), meta: t('lernen.practiceMeta', { n: PRACTICE_N }), href: practiceHref(sub.id) });
}

/* ---------- Einstieg ---------- */

export function renderLernen(openId: string | null): void {
  const sub = openId && Object.hasOwn(SUBTYPES, openId) ? SUBTYPES[openId] : undefined;
  if (sub) renderDetail(sub);
  else renderList();
}
