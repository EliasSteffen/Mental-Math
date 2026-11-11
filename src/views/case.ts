// Mini-Case: Auswahl (#/case) und Einstieg ins Spiel (#/case/<id>, #/case/random) – v9 C.
import { CASE_TEMPLATES, caseBest, caseById, randomCaseId } from '../core/cases/index.ts';
import { getSessions } from '../data/storage.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { go } from '../router.ts';
import { backLink, group, largeTitle, list, row } from '../ui/kit.ts';
import { setPrimaryAction } from '../ui/shell.ts';
import { t } from '../i18n/index.ts';
import { renderCasePlay } from './case-play.ts';

/** Zuletzt gespielte Vorlage dieser Sitzung (Zufall wiederholt sie nicht gleich). */
let lastPlayed: string | null = null;

export function renderCase(id: string | null): void {
  if (id === 'random') {
    const pick = randomCaseId(Math.random, lastPlayed);
    lastPlayed = pick;
    renderCasePlay(pick, true);
    return;
  }
  if (id && caseById(id)) {
    lastPlayed = id;
    renderCasePlay(id, false);
    return;
  }
  renderPicker();
}

function renderPicker(): void {
  const sessions = getSessions();
  const rows = CASE_TEMPLATES.map((c) => {
    const best = caseBest(sessions, c.id);
    return row({
      label: c.title(), href: `#/case/${c.id}`,
      sub: best ? t('cases.best', { correct: best.correct, n: best.n }) : t('cases.noBest'),
    });
  });
  appendChildren(app, [
    backLink({ label: t('common.tabToday'), href: '#/' }),
    largeTitle(t('cases.title')),
    h('p', { class: 'play-intro' }, t('cases.intro')),
    group(t('cases.all'), list(rows)),
  ]);
  setPrimaryAction({ label: t('cases.random'), onClick: () => go('#/case/random') });
}
