import type { Attempt, Reviews, Settings } from '../types.ts';
import { fmtSeconds, fmt } from '../core/numbers.ts';
import { SUBTYPES, LEVEL_NAMES, activeCategories } from '../core/catalog.ts';
import { categoryStats, subtypeStats, overall, weaknesses, errorPatterns, levelFor } from '../core/scoring.ts';
import { getAttempts, getSettings, getReviews, getActivity, getDailyResults } from '../data/storage.ts';
import { streakInfo, heatmap, dailySeries, apmSeries, dayKey } from '../core/progress.ts';
import { dueReviews, nextDue } from '../core/review.ts';
import { icon, ring, sparkline, heatmapGrid } from '../ui/charts.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { badge, tile, pct, safeSteps, stepsList, fold } from '../ui/widgets.ts';

const fmtDate = (ts: number): string => new Date(ts).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
const mins = (ms: number): number => Math.round((ms || 0) / 60000);

function headerBento(attempts: Attempt[], settings: Settings, now: number): HTMLDivElement {
  const goalMs = settings.dailyGoalMin * 60000;
  const st = streakInfo(getActivity(), goalMs, now);
  const sk = overall(attempts).score;
  const correct = attempts.filter((a) => a.correct).length;
  return h('div', { class: 'bento' },
    h('div', { class: 'tile tile-score' },
      h('span', { class: 'label' }, 'Skill'),
      ring(sk === null || sk === undefined ? 0 : sk / 100, { size: 'lg', text: sk === null || sk === undefined ? '–' : String(sk) }),
      h('span', { class: 'sub' }, `${attempts.length} Aufgaben`)),
    h('div', { class: `tile tile-streak${st.current > 0 ? ' is-hot' : ''}` },
      icon('flame', { size: 28 }),
      h('span', { class: 'big-num' }, String(st.current)),
      h('span', { class: 'label' }, st.current === 1 ? 'Tag Serie' : 'Tage Serie'),
      h('span', { class: 'sub' }, `Rekord ${st.best}`)),
    h('div', { class: 'tile tile-goal' },
      ring(goalMs ? st.todayMs / goalMs : 0, { size: 'md', text: st.todayDone ? '✓' : '' }),
      h('div', null,
        h('span', { class: 'label' }, 'Heute'),
        h('div', { class: 'big-num' }, `${mins(st.todayMs)} min`),
        h('span', { class: 'sub' }, `Ziel ${settings.dailyGoalMin} min`))),
    h('div', { class: 'tile' },
      h('span', { class: 'label' }, 'Genauigkeit'),
      h('span', { class: 'big-num' }, pct(correct / attempts.length)),
      h('span', { class: 'sub' }, 'alle Aufgaben')));
}

function heatmapSection(goalMs: number, now: number): HTMLElement {
  return h('section', null,
    h('h2', { class: 'section-title' }, 'Aktivität'),
    h('div', { class: 'card' },
      heatmapGrid(heatmap(getActivity(), goalMs, now, 16)),
      h('div', { class: 'card-foot' },
        h('span', null, 'Aktivität der letzten 16 Wochen'),
        h('span', { class: 'hm-legend' }, 'weniger ',
          ...[0, 1, 2, 3, 4].map((l) => h('span', { class: 'hm-cell', 'data-level': String(l) })),
          ' mehr'))));
}

function learnCurveSection(attempts: Attempt[], now: number): HTMLElement {
  const series = apmSeries(attempts, getActivity(), { days: 30, now });
  const apm = series.map((p) => p.perMinute);
  const acc = series.map((p) => p.accuracy);
  const sec = h('section', null, h('h2', { class: 'section-title' }, 'Lernkurve'));
  if (!apm.some((v) => v !== null)) {
    sec.append(h('p', { class: 'muted' }, 'Noch zu wenig Daten für eine Kurve.'));
    return sec;
  }
  sec.append(h('div', { class: 'card stack' },
    h('div', null,
      h('div', { class: 'label' }, 'Aufgaben pro Minute'),
      h('div', { class: 'spark-tall' }, sparkline(apm, { area: true, gaps: true }))),
    h('div', { class: 'alt' },
      h('div', { class: 'label' }, 'Genauigkeit'),
      h('div', { class: 'spark-tall' }, sparkline(acc, { area: false, max: 1, gaps: true }))),
    h('div', { class: 'card-foot' },
      h('span', { class: 'legend' },
        h('span', null, h('i'), 'Aufgaben/Min.'),
        h('span', null, h('i', { class: 'alt' }), 'Genauigkeit')),
      h('span', null, 'letzte 30 Tage'))));
  return sec;
}

function dailySection(now: number): HTMLElement {
  const results = getDailyResults();
  const sec = h('section', null, h('h2', { class: 'section-title' }, 'Daily'));
  const list = h('ul', { class: 'list' });
  let any = false;
  for (let i = 0; i < 7; i++) {
    const key = dayKey(now - i * 86400000);
    const r = results[key];
    if (r) any = true;
    const label = new Date(now - i * 86400000).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
    list.append(h('li', null,
      h('span', { class: `mark ${r ? 'good' : ''}` }, r ? '✓' : '–'),
      h('span', { class: 'item-main' }, label),
      h('span', { class: 'item-meta' }, r ? `${r.correct}/${r.n} · ${fmt(r.points)} Pkt` : 'offen')));
  }
  if (!any) sec.append(h('p', { class: 'muted' }, 'Noch keine Daily Challenge gelöst.'));
  sec.append(list);
  return sec;
}

function reviewSection(now: number): HTMLElement {
  const reviews: Reviews = getReviews();
  const due = dueReviews(reviews, now);
  const next = nextDue(reviews);
  const entries = Object.entries(reviews || {}).filter(([id]) => SUBTYPES[id]);
  const sec = h('section', null, h('h2', { class: 'section-title' }, 'Wiederholungen'));
  if (!entries.length) {
    sec.append(h('p', { class: 'muted' }, 'Falsch gelöste Aufgabentypen kommen hier zur Wiederholung zurück.'));
    return sec;
  }
  const headline = due.length
    ? `${due.length} ${due.length === 1 ? 'Wiederholung' : 'Wiederholungen'} fällig`
    : 'Nichts fällig';
  const card = h('div', { class: 'card' },
    h('div', { class: 'card-head' },
      h('div', null,
        h('div', { class: 'card-title' }, headline),
        h('div', { class: 'card-sub' }, next ? `Nächste am ${fmtDate(next)}` : '')),
      icon('repeat', { size: 24 })));
  if (due.length) {
    card.append(h('div', { class: 'card-actions' }, h('a', { class: 'btn primary', href: '#/train/review' }, 'Jetzt wiederholen')));
  }
  const list = h('ul', { class: 'list' });
  for (const [id, r] of entries.sort((a, b) => a[1].dueAt - b[1].dueAt)) {
    list.append(h('li', null,
      h('span', { class: `mark ${r.dueAt <= now ? 'bad' : 'good'}` }, r.dueAt <= now ? '!' : '✓'),
      h('span', { class: 'item-main' }, SUBTYPES[id]?.name),
      h('span', { class: 'item-meta' }, `Stufe ${Math.min(r.box + 1, 5)}/5`),
      h('span', { class: 'item-sub' }, r.dueAt <= now ? 'fällig' : `fällig am ${fmtDate(r.dueAt)}`)));
  }
  sec.append(card, list);
  return sec;
}

function weakSection(attempts: Attempt[], settings: Settings): HTMLElement {
  const weak = weaknesses(attempts, undefined, { enabledCategories: settings.enabledCategories });
  const sec = h('section', null, h('h2', { class: 'section-title' }, 'Deine Schwächen'));
  if (!weak.length) {
    sec.append(h('p', { class: 'muted' }, 'Keine Schwächen erkannt – weiter so.'));
    return sec;
  }
  const stack = h('div', { class: 'stack' });
  for (const w of weak) {
    stack.append(h('div', { class: 'card' },
      h('div', { class: 'card-head' },
        h('div', null,
          h('div', { class: 'card-title' }, w.name),
          h('div', { class: 'card-sub' }, `${w.categoryName} · ${w.label}`)),
        badge(w.score)),
      h('p', { class: 'small muted' }, `${pct(w.accuracy)} richtig · Ø ${fmtSeconds(w.avgTimeMs)} (Ziel ${fmtSeconds(w.targetMs)})`),
      w.tip ? h('p', { class: 'small' }, `Tipp: ${w.tip}`) : null,
      h('div', { class: 'card-actions' },
        h('a', { class: 'btn small', href: `#/lernen/${w.subtype}` }, 'Lernen'),
        h('a', { class: 'btn small', href: `#/train/${w.subtype}` }, 'Üben'))));
  }
  sec.append(stack, h('div', { class: 'btn-row section-actions' }, h('a', { class: 'btn primary', href: '#/train/weak' }, 'Schwächen trainieren')));
  return sec;
}

function categorySection(attempts: Attempt[], settings: Settings, now: number): HTMLElement {
  const cats = categoryStats(attempts);
  const subs = subtypeStats(attempts);
  const stack = h('div', { class: 'stack' });
  for (const c of activeCategories(settings.enabledCategories)) {
    const s = cats[c.id];
    const values = dailySeries(attempts, { category: c.id, days: 14, now }).map((d) => d.accuracy);
    const meta = s && s.n
      ? `Ø ${fmtSeconds(s.avgTimeMs)} · ${attempts.filter((a) => a.category === c.id).length} Aufgaben`
      : 'Noch keine Aufgaben';
    const body = h('div', { class: 'stack' });
    for (const sub of Object.values(SUBTYPES).filter((x) => x.category === c.id)) {
      const ss = subs[sub.id];
      const lv = levelFor(sub.id, attempts, settings.difficulty);
      body.append(h('div', { class: 'card' },
        h('div', { class: 'card-head' },
          h('div', null,
            h('div', { class: 'card-title' }, sub.name),
            h('div', { class: 'card-sub' }, ss && ss.n ? `${pct(ss.accuracy)} · Ø ${fmtSeconds(ss.avgTimeMs)}` : 'Noch nicht geübt')),
          h('div', null, badge(ss ? ss.score : null), ' ', h('span', { class: 'chip' }, LEVEL_NAMES[lv]))),
        h('div', { class: 'card-actions' },
          h('a', { class: 'btn small', href: `#/lernen/${sub.id}` }, 'Lernen'),
          h('a', { class: 'btn small', href: `#/train/${sub.id}` }, 'Üben'))));
    }
    stack.append(h('details', { class: 'cat-history' },
      h('summary', null,
        h('span', null,
          h('span', { class: 'card-title' }, c.name),
          h('span', { class: 'sub' }, ` · ${meta}`)),
        badge(s ? s.score : null),
        sparkline(values, { area: true, max: 1 })),
      h('div', { class: 'fold-body' }, body)));
  }
  return h('section', null, h('h2', { class: 'section-title' }, 'Kategorien'), stack);
}

function errorsSection(attempts: Attempt[]): HTMLElement | null {
  const errors = attempts.filter((a) => !a.correct).slice(-10).reverse();
  if (!errors.length) return null;
  const list = h('ul', { class: 'list' });
  for (const a of errors) {
    const unit = a.unit ? ` ${a.unit}` : '';
    const choices = a.kind === 'choice' && Array.isArray(a.choices) ? a.choices : null;
    const steps = a.params
      ? safeSteps({ subtype: a.subtype, params: a.params, expected: a.expected, unit: a.unit, prompt: a.prompt })
      : [];
    const givenText = a.given === null || a.given === undefined ? 'übersprungen'
      : choices ? String(choices[a.given]) : fmt(a.given);
    const expectedText = choices ? String(choices[a.expected]) : `${fmt(a.expected)}${unit}`;
    list.append(h('li', null,
      h('span', { class: 'mark bad' }, '✗'),
      h('span', { class: 'item-main' }, a.prompt),
      h('span', { class: 'item-meta' }, fmtSeconds(a.timeMs)),
      h('span', { class: 'item-sub' }, `deine: ${givenText} · richtig: ${expectedText}`),
      steps.length ? h('div', { class: 'item-steps' }, fold('Lösungsweg', stepsList(steps))) : null));
  }
  return h('section', null, h('h2', { class: 'section-title' }, 'Letzte Fehler'), list);
}

export function renderAnalyse(): void {
  const attempts = getAttempts();

  if (attempts.length === 0) {
    app.append(
      h('h1', { class: 'page-title' }, 'Analyse'),
      h('div', { class: 'card empty' },
        icon('chart', { size: 40 }),
        h('div', { class: 'card-title' }, 'Noch keine Daten'),
        h('p', { class: 'muted' }, 'Löse ein paar Aufgaben, dann siehst du hier deine Stärken, Schwächen und deinen Verlauf.'),
        h('a', { class: 'btn primary', href: '#/' }, 'Training starten')));
    return;
  }

  const now = Date.now();
  const settings = getSettings();
  const patterns = errorPatterns(attempts);
  const patternTiles = h('div', { class: 'stats' },
    tile(String(patterns.nullen || 0), 'Nullen-Fehler'),
    tile(String(patterns.knapp || 0), 'Knapp daneben'),
    tile(String(patterns.falsch || 0), 'Falsch'),
    tile(String(patterns.skip || 0), 'Übersprungen'));

  appendChildren(app, [
    h('h1', { class: 'page-title' }, 'Analyse'),
    headerBento(attempts, settings, now),
    heatmapSection(settings.dailyGoalMin * 60000, now),
    learnCurveSection(attempts, now),
    dailySection(now),
    reviewSection(now),
    weakSection(attempts, settings),
    categorySection(attempts, settings, now),
    h('section', null, h('h2', { class: 'section-title' }, 'Fehlermuster'), patternTiles),
    errorsSection(attempts),
    h('p', { class: 'small' }, h('a', { class: 'linkbtn', href: '#/settings' }, 'Daten & Einstellungen →')),
  ]);
}
