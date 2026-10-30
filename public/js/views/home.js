import { SUBTYPES, activeCategories } from '../generators.js';
import { categoryStats, overall } from '../scoring.js';
import { getAttempts, getReviews, getActivity, getSettings } from '../storage.js';
import { streakInfo, xpInfo, recommendation } from '../progress.js';
import { dueReviews } from '../review.js';
import { icon, ring, progressBar } from '../charts.js';
import { app, h, appendChildren } from '../ui.js';

export function renderHome() {
  const now = Date.now();
  const attempts = getAttempts();
  const reviews = getReviews();
  const settings = getSettings();
  const goalMs = (settings.dailyGoalMin || 15) * 60000;
  const st = streakInfo(getActivity(), goalMs, now);
  const xp = xpInfo(attempts);
  const rec = recommendation(attempts, reviews, now, { enabledCategories: settings.enabledCategories });
  const due = dueReviews(reviews, now);
  const stats = categoryStats(attempts);
  const counts = {};
  for (const a of attempts) counts[a.category] = (counts[a.category] || 0) + 1;
  const fresh = attempts.length === 0;

  const streakTile = h('div', { class: `tile tile-streak${st.current >= 1 || st.todayDone ? ' is-hot' : ''}` },
    icon('flame', { size: 28 }),
    h('div', { class: 'big-num' }, String(st.current)),
    h('div', { class: 'label' }, st.current === 1 ? 'Tag Serie' : 'Tage Serie'),
    h('div', { class: 'sub' }, `Rekord ${st.best}`));

  const scoreTile = h('div', { class: 'tile tile-score' },
    h('span', { class: 'level-badge' }, `Level ${xp.level}`),
    h('div', { class: 'big-num' }, String(xp.xp)),
    h('div', { class: 'label' }, 'XP'),
    progressBar(xp.needed ? (xp.into / xp.needed) * 100 : 0),
    h('div', { class: 'sub' }, `${xp.into} / ${xp.needed} bis Level ${xp.level + 1}`));

  const todayMin = Math.floor(st.todayMs / 60000);
  const goalMin = settings.dailyGoalMin || 15;
  const goalTile = h('div', { class: 'tile tile-goal span-2' },
    ring(Math.min(1, st.todayMs / goalMs), { size: 'md', text: `${todayMin}` }),
    h('div', null,
      h('div', { class: 'label' }, 'Tagesziel'),
      h('div', { class: 'big-num' }, `${todayMin} / ${goalMin} min`),
      h('div', { class: 'sub' }, st.todayDone ? 'Geschafft – stark!' : `Noch ${Math.max(1, goalMin - todayMin)} min bis zum Ziel`)));

  let heroHref = '#/train/all';
  let heroBtn = 'Los geht\'s';
  let heroTitle = 'Heute: Gemischtes Training';
  let heroReason = 'Starte mit ein paar Aufgaben und finde heraus, wo du stehst.';
  if (!fresh || rec.kind !== 'new') {
    heroTitle = rec.kind === 'review' ? 'Heute: Fehler-Wiederholung' : `Heute: ${rec.title}`;
    heroReason = rec.reason;
    if (rec.kind === 'review') {
      heroHref = '#/train/review';
      heroBtn = `${due.length} ${due.length === 1 ? 'Wiederholung' : 'Wiederholungen'} starten`;
    } else if (rec.subtype && SUBTYPES[rec.subtype]) {
      heroHref = `#/train/${rec.subtype}?n=5&intro=1`;
      heroBtn = 'Methode & 5 Aufgaben';
    } else {
      heroHref = `#/train/${rec.mode}`;
      heroBtn = 'Training starten';
    }
  } else if (rec.subtype) {
    heroTitle = `Willkommen! Starte mit ${rec.title}`;
    heroReason = 'Erst die Methode, dann 5 Aufgaben.';
    heroHref = `#/train/${rec.subtype}?n=5&intro=1`;
    heroBtn = 'Methode & 5 Aufgaben';
  }
  const heroTile = h('div', { class: 'tile tile-hero span-2' },
    h('div', { class: 'label' }, 'Empfehlung'),
    h('div', { class: 'card-title' }, heroTitle),
    h('div', { class: 'sub' }, heroReason),
    h('a', { class: 'btn primary', href: heroHref }, heroBtn));

  const allTile = h('a', { class: 'tile span-2', href: '#/train/all' },
    h('div', { class: 'label' }, 'Schnellstart'),
    h('div', { class: 'card-title' }, 'Alle Kategorien'),
    h('div', { class: 'sub' }, `Gemischt · ${attempts.length} Aufgaben bisher`));

  const grid = h('div', { class: 'cat-grid' });
  for (const c of activeCategories(settings.enabledCategories)) {
    const sc = stats[c.id] ? stats[c.id].score : null;
    grid.append(h('a', { class: 'cat-card', href: `#/train/${c.id}` },
      ring((sc || 0) / 100, { size: 'sm', text: sc === null ? '–' : String(sc) }),
      h('div', { class: 'cat-name' }, c.name),
      h('div', { class: 'cat-meta' }, `${counts[c.id] || 0} Aufg.`)));
  }

  const overallScore = overall(attempts).score;
  appendChildren(app, [
    h('div', { class: 'bento' }, heroTile, streakTile, scoreTile, goalTile, allTile),
    h('h2', { class: 'section-title' }, 'Kategorien'),
    grid,
    fresh ? null : h('p', { class: 'small muted' }, overallScore === null ? '' : `Gesamt-Skill ${overallScore}`),
  ]);
}
