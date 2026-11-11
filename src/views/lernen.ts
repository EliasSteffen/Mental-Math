// Lernen-Tab: Methodenliste mit Suche (#/lernen), Detailseite je Aufgabentyp (#/lernen/:id) und geführter
// Lernmodus „Schritt für Schritt“ (#/lernen/:id/schritte, views/lernen-guide.ts).
// Die Suche filtert lokal (ohne rerender); die Scroll-Position von Liste und Detail merkt sich der Router.
import type { Level, Subtype, Task } from '../types.ts';
import { fmt, fmtSeconds } from '../core/numbers.ts';
import { CATEGORIES, LEVEL_NAMES, SUBTYPES, activeCategories } from '../core/catalog.ts';
import { generate, noRepeat } from '../core/generators/index.ts';
import { categoryStats, levelFor, subtypeStats } from '../core/scoring.ts';
import { getMethod } from '../core/methods.ts';
import { renderExhibit } from '../ui/exhibit.ts';
import { aiExplainMethod, isAiAvailable } from '../features/ai-client.ts';
import { aiControl } from '../features/ai-view.ts';
import { getAttempts, getSettings } from '../data/storage.ts';
import { app, appendChildren, h, type Child } from '../ui/dom.ts';
import {
  backLink, button, card, fold, group, insight, largeTitle, list, masteryMark, masteryOf, row, searchField, type Mastery,
} from '../ui/kit.ts';
import { masteryCounts, type MasteryCounts } from '../core/mastery.ts';
import { setPrimaryAction } from '../ui/shell.ts';
import { isWide } from '../ui/viewport.ts';
import { t } from '../i18n/index.ts';
import { pitfallList, safeSteps, stepsList } from '../ui/widgets.ts';
import { matchesSearch, normalizeSearch, pickNext } from './lernen-search.ts';
import { hasGuided } from '../core/solutions/guided.ts';
import { PRACTICE_N, guideHref, practiceHref, renderGuide, resetGuide } from './lernen-guide.ts';

const MASTERY_RANK: Readonly<Record<Mastery, number>> = { empty: 0, half: 1, full: 2 };

/** Letzte Suche – bleibt beim Wechsel Liste ↔ Detail (und beim Sprachwechsel) erhalten. */
let lastQuery = '';

const subtypesOf = (categoryId: string): Subtype[] => Object.values(SUBTYPES).filter((s) => s.category === categoryId);

const NO_COUNTS: MasteryCounts = { full: 0, half: 0, empty: 0, total: 0 };

/** Gestapelter Balken: sicher (--good), in Arbeit (--accent), offen (neutral). Anteile über --n (Anzahl). */
function stackBar(c: MasteryCounts, cls: string, label?: string): HTMLElement {
  const seg = (kind: 'full' | 'half' | 'empty', n: number): HTMLElement => {
    const el = h('span', { class: `learn-stack-seg is-${kind}` });
    el.style.setProperty('--n', String(n));
    return el;
  };
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' };
  return h('span', { class: `learn-stack ${cls}`, ...a11y }, seg('full', c.full), seg('half', c.half), seg('empty', c.empty));
}

/** Lernkarte oben in der Liste: Meisterung gesamt, Balken und Weiterlernen; ohne Aufgabentypen keine Karte. */
function summaryCard(c: MasteryCounts, next: Subtype | null): HTMLElement | null {
  if (!c.total) return null;
  const counts = { full: c.full, half: c.half, empty: c.empty, total: c.total };
  return card([
    h('p', { class: 'learn-card-count' }, t('lernen.cardCount', counts)),
    stackBar(c, 'learn-card-bar', t('lernen.cardBarAria', counts)),
    next ? button({ label: t('lernen.cardContinue', { name: next.name }), kind: 'link', icon: 'play', href: `#/lernen/${next.id}` }) : null,
  ], { title: t('lernen.cardTitle'), class: 'learn-summary' });
}

/* ---------- Liste ---------- */

interface Entry { el: HTMLElement; hay: string }
interface Section { el: HTMLElement; entries: Entry[] }
interface ListParts {
  nodes: Child[];
  /** Zeilen je Aufgabentyp (Master-Detail markiert die geöffnete) */
  rows: ReadonlyMap<string, HTMLElement>;
  /** Weiterlernen: erster Subtyp mit der niedrigsten Meisterung */
  next: Subtype | null;
}

let catSeq = 0;

function listParts(): ListParts {
  const attempts = getAttempts();
  const subStats = subtypeStats(attempts);
  const catStats = categoryStats(attempts);
  const cats = activeCategories(getSettings().enabledCategories)
    .map((c) => ({ c, subs: subtypesOf(c.id) }))
    .filter((g) => g.subs.length);

  // Meisterung vorab zählen: Lernkarte und Kategorie-Balken brauchen die Summen vor dem Aufbau der Zeilen
  const levels = cats.flatMap(({ c, subs }) => subs.map((s) => ({ category: c.id, sub: s, mastery: masteryOf(subStats[s.id]?.score) })));
  const counts = masteryCounts(levels);

  const sections: Section[] = [];
  const rowsById = new Map<string, HTMLElement>();
  const order: Array<{ sub: Subtype; mastery: Mastery }> = [];
  for (const { c, subs } of cats) {
    const catCounts = counts.categories[c.id] ?? NO_COUNTS;
    const entries = subs.map((s): Entry => {
      const mastery = masteryOf(subStats[s.id]?.score);
      order.push({ sub: s, mastery });
      // Tipp-Zeile: kurzer, übersetzter Subtyp-Tipp; nur ohne ihn der (deutsche) Trick der Methode
      const trick = getMethod(s.id)?.trick ?? '';
      const tip = s.tip || trick;
      const el = row({ label: s.name, sub: tip || undefined, href: `#/lernen/${s.id}`, leading: masteryMark(mastery), class: 'learn-row' });
      rowsById.set(s.id, el);
      return { el, hay: normalizeSearch([s.name, s.tip, trick, c.name].join(' ')) };
    });
    const score = catStats[c.id]?.score;
    // Kopf wie group(), zusätzlich mit Balken und „3/6 sicher“ unter dem Titel
    const headId = `learn-cat-${++catSeq}`;
    const el = h('section', { class: 'group learn-group', 'aria-labelledby': headId },
      h('div', { class: 'group-head' },
        h('h2', { class: 'group-title', id: headId }, c.name),
        h('p', { class: 'group-meta' }, t('lernen.skill', { n: typeof score === 'number' ? score : '–' }))),
      h('div', { class: 'learn-cat-progress' },
        stackBar(catCounts, 'learn-cat-bar'),
        h('p', { class: 'learn-cat-count' }, t('lernen.categorySolid', { full: catCounts.full, total: catCounts.total }))),
      list(entries.map((e) => e.el)));
    sections.push({ el, entries });
  }

  // Weiterlernen: erster Subtyp mit der niedrigsten Meisterung (Kategorienreihenfolge; ohne Daten der erste)
  const next = pickNext(order, (o) => MASTERY_RANK[o.mastery])?.sub ?? null;
  const summary = summaryCard(counts.overall, next);

  // Ruhiger Leer-Hinweis; role=status liest ihn vor, sobald er erscheint
  const empty = h('p', { class: 'learn-empty', role: 'status' });

  function apply(query: string): void {
    lastQuery = query;
    const q = normalizeSearch(query);
    // Die Lernkarte gilt dem Gesamtbild und verschwindet bei einer Suche
    if (summary) summary.hidden = q !== '';
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

  return {
    nodes: [
      largeTitle(t('lernen.title'), t('lernen.subtitle')),
      summary,
      search,
      h('div', { class: 'learn-groups' }, sections.map((s) => s.el)),
      empty,
    ],
    rows: rowsById,
    next,
  };
}

function renderList(): void {
  const { nodes, next } = listParts();
  appendChildren(app, nodes);
  if (next) setPrimaryAction({ label: t('lernen.continue'), meta: next.name, href: `#/lernen/${next.id}` });
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

/** Einstieg in den geführten Lernmodus (nur für Typen mit strukturierten Schritten); startet immer frisch. */
function guideEntry(id: string): HTMLElement {
  const entry = row({
    icon: 'play', label: t('guide.entry'), sub: t('guide.entrySub'), href: guideHref(id), onClick: resetGuide, class: 'guide-entry',
  });
  return group(null, list([entry]));
}

/** Beispielaufgabe mit aufklappbarem Lösungsweg; „Neues Beispiel“ würfelt neu (Fokus bleibt auf dem Button). */
function exampleGroup(sub: Subtype, lvl: Level): HTMLElement | null {
  const exhibit = h('div', { class: 'learn-exhibit' });
  const prompt = h('p', { class: 'learn-prompt', 'aria-live': 'polite' });
  const rest = h('div', { class: 'learn-example-rest' });
  // „Neues Beispiel“ zeigt nicht gleich wieder eins der letzten
  const fresh = noRepeat();

  function draw(): boolean {
    let task: Task;
    try {
      task = fresh.next(() => generate(sub.id, Math.random, { level: lvl }));
    } catch {
      return false;
    }
    const steps = safeSteps(task);
    const choices = task.kind === 'choice' && Array.isArray(task.choices) ? task.choices : null;
    const answer = task.kind === 'choice'
      ? String(task.choices[task.expected] ?? '')
      : `${fmt(task.expected)}${task.unit ? ' ' + task.unit : ''}`;
    const note = [task.hint, !choices && task.unit ? t('lernen.answerIn', { unit: task.unit }) : ''].filter(Boolean).join(' · ');
    exhibit.replaceChildren();
    appendChildren(exhibit, [renderExhibit(task.params)]);
    exhibit.hidden = !exhibit.firstChild;
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
  return group(t('lernen.example'), card([exhibit, prompt, rest, again]));
}

/** Inhalt der Detailseite; ohne `back`, wenn die Liste danebensteht. */
function detailNodes(sub: Subtype, back: boolean): Child[] {
  const attempts = getAttempts();
  const score = subtypeStats(attempts)[sub.id]?.score;
  const count = attempts.reduce((n, a) => n + (a.subtype === sub.id ? 1 : 0), 0);
  const lvl = levelFor(sub.id, attempts, getSettings().difficulty);
  const m = getMethod(sub.id);
  const cat = CATEGORIES.find((c) => c.id === sub.category);

  return [
    back ? backLink({ label: t('lernen.title'), href: '#/lernen', ariaLabel: t('lernen.back') }) : null,
    h('div', { class: 'learn-head' }, largeTitle(sub.name, cat?.name), statusLine(sub, score, count, lvl)),
    hasGuided(sub.id) ? guideEntry(sub.id) : null,
    m?.idea ? group(t('lernen.idea'), card([h('p', { class: 'method-text' }, m.idea)])) : null,
    m?.steps?.length ? group(t('lernen.approach'), card([stepsList(m.steps)])) : null,
    exampleGroup(sub, lvl),
    m?.trick ? insight({ icon: 'bulb', tone: 'accent', title: t('lernen.trick'), text: m.trick }) : null,
    m?.pitfalls?.length ? group(t('lernen.pitfalls'), card([pitfallList(m.pitfalls)])) : null,
    isAiAvailable() ? aiControl(t('lernen.aiExplain'), () => aiExplainMethod(sub.id)) : null,
  ];
}

function practiceAction(sub: Subtype): void {
  setPrimaryAction({ label: t('lernen.practice'), meta: t('lernen.practiceMeta', { n: PRACTICE_N }), href: practiceHref(sub.id) });
}

function renderDetail(sub: Subtype): void {
  appendChildren(app, detailNodes(sub, true));
  practiceAction(sub);
}

/** Wo die Liste im Master-Detail stand: Jeder Tipp auf eine Zeile zeichnet die Seite neu. */
let masterScrollTop = 0;

/** Ab 1024 px: Liste links, Detail rechts. Ohne Auswahl steht dort der Aufgabentyp, mit dem es weitergeht. */
function renderSplit(selected: Subtype | undefined): void {
  const { nodes, rows, next } = listParts();
  const shown = selected ?? next;
  if (shown) rows.get(shown.id)?.setAttribute('aria-current', 'true');
  const master = h('div', { class: 'split-master learn-master' }, ...nodes);
  master.addEventListener('scroll', () => { masterScrollTop = master.scrollTop; }, { passive: true });
  appendChildren(app, [
    h('div', { class: 'split' }, master, h('div', { class: 'split-detail' }, ...(shown ? detailNodes(shown, false) : []))),
  ]);
  master.scrollTop = masterScrollTop;
  if (shown) practiceAction(shown);
}

/* ---------- Einstieg ---------- */

/** Liste, Detailseite oder – mit `guide` und für Typen mit strukturierten Schritten – der geführte Lernmodus. */
export function renderLernen(openId: string | null, guide = false): void {
  const sub = openId && Object.hasOwn(SUBTYPES, openId) ? SUBTYPES[openId] : undefined;
  if (sub && guide && hasGuided(sub.id) && renderGuide(sub)) return;
  if (isWide()) renderSplit(sub);
  else if (sub) renderDetail(sub);
  else renderList();
}
