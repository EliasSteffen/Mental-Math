// Herausforderung annehmen (#/duell?d=<payload>, v9 I): zeigt Absender und Ergebnis, „Annehmen“ spielt die Aufgaben.
// Der Link ist untrusted: decodeDuel prüft streng; Name und Zahlen erscheinen nur als Text (h() setzt textContent).
import { LEVEL_NAMES, CATEGORIES, mixCategories } from '../core/catalog.ts';
import { decodeDuel, newDuelSeed } from '../core/duel-link.ts';
import type { DuelPayload } from '../core/duel-link.ts';
import { fmtSeconds } from '../core/numbers.ts';
import { stashDuel } from '../features/duel.ts';
import { t } from '../i18n/index.ts';
import { go } from '../router.ts';
import { app, h } from '../ui/dom.ts';
import type { CategoryId } from '../types.ts';
import { button, card, largeTitle } from '../ui/kit.ts';
import { toast } from '../ui/toast.ts';
import { notice } from './compete-ui.ts';

/** „8/10 · 52 s · Gemischt · Mittel“ bzw. „Daily 30.10.2026 · 8/15 · 3:10“ */
export function duelFacts(p: DuelPayload): string {
  const time = fmtSeconds(p.t);
  if (p.kind === 'daily') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.day ?? '');
    const date = m ? t('core.daily.date', { d: m[3] ?? '', m: m[2] ?? '', y: m[1] ?? '' }) : (p.day ?? '');
    return t('duel.dailyFacts', { date, correct: p.c, n: p.n, time });
  }
  const cat = p.cat === 'all' ? t('duel.catAll') : (CATEGORIES.find((c) => c.id === p.cat)?.name ?? p.cat);
  return t('duel.facts', { correct: p.c, n: p.n, time, cat, level: LEVEL_NAMES[p.lvl] });
}

export function renderDuel(raw: string | null): void {
  const p = decodeDuel(raw);
  if (!p) {
    app.replaceChildren(
      largeTitle(t('duel.invalidTitle')),
      notice(t('duel.invalidText')),
      h('div', { class: 'duel-actions' }, button({ label: t('duel.toCompete'), kind: 'primary', full: true, href: '#/wettbewerbe' })));
    return;
  }
  const accept = button({
    label: t('duel.accept'), kind: 'primary', full: true, icon: 'play',
    onClick: () => {
      if (!stashDuel(p, true)) { toast(t('train.notPossible')); return; }
      go('#/train/duel');
    },
  });
  app.replaceChildren(
    largeTitle(p.name ? t('duel.incoming', { name: p.name }) : t('duel.incomingAnon'), t('duel.title')),
    card([
      h('p', { class: 'duel-facts num' }, duelFacts(p)),
      h('p', { class: 'duel-hint' }, t('duel.acceptHint')),
    ], { hero: true }),
    h('div', { class: 'duel-actions' }, accept));
}

/** Neue Herausforderung (Satz mit frischem Seed, du spielst zuerst) starten */
export function startNewDuel(cat: CategoryId | 'all' = 'all'): void {
  if (!stashDuel({ v: 1, kind: 'set', seed: newDuelSeed(), cat, n: 10, lvl: 2, c: 0, p: 0, t: 0 }, false)) { toast(t('train.notPossible')); return; }
  go('#/train/duel');
}

/** Karte „Freund herausfordern“ im Wettkampf-Tab (auch ohne Konto): Kategorie wählen, 10 Aufgaben, Stufe Mittel */
export function duelCard(): HTMLElement {
  const selectId = 'duel-cat';
  const select = h('select', { class: 'prof-input', id: selectId },
    h('option', { value: 'all' }, t('duel.catAll')),
    ...mixCategories(null).map((c) => h('option', { value: c.id }, c.name)));
  return card([
    h('p', { class: 'duel-card-title' }, t('duel.cardTitle')),
    h('p', { class: 'duel-card-text' }, t('duel.cardText')),
    h('div', { class: 'duel-card-controls' },
      h('label', { class: 'prof-field', for: selectId }, t('duel.cardCategory')), select,
      h('p', { class: 'duel-card-facts' }, t('duel.cardFacts', { n: 10, level: LEVEL_NAMES[2] }))),
    button({
      label: t('duel.cardStart'), kind: 'primary', full: true, icon: 'play',
      onClick: () => startNewDuel(select.value as CategoryId | 'all'),
    }),
  ]);
}
