// Raketen-Rennen (v12 R1): Übersicht (#/rennen), Karte für den Wettkampf-Tab und die Spielweise „Reihum“ (#/rennen/reihum):
// ein Gerät, 2–6 Spieler nacheinander (gleiche Aufgaben aus einem Seed), danach Zeitraffer und Podest. Alles lokal, ohne Konto.
// Die Spielweisen der Gruppen (R2 Geister, R3 live) hängen sich an `waysGroup` und an dieselben Bausteine (play, result, setup).
import { newRaceSeed, raceDurationMs, raceTasks, type RaceConfig, type RaceRun } from '../../core/race.ts';
import { addSession } from '../../data/storage.ts';
import { updateProgressRewards } from '../../features/rewards.ts';
import { t } from '../../i18n/index.ts';
import { go, setCleanup } from '../../router.ts';
import { app, h } from '../../ui/dom.ts';
import { button, card, backLink, focusHead, group, icon, largeTitle } from '../../ui/kit.ts';
import { confirmDialog } from '../../ui/modal.ts';
import { dock } from '../../ui/dock.ts';
import { rewardBlock } from '../../ui/rewards.ts';
import { setTitle } from '../../ui/title.ts';
import { playRace, type RaceAnswer } from './play.ts';
import { showRaceResult } from './result.ts';
import { configForm, configLine, finalizeNames, loadConfig, loadNames, playersForm, saveConfig, saveNames } from './setup.ts';

export const RACE_HREF = '#/rennen';
export const REIHUM_HREF = '#/rennen/reihum';

/* ---------- Übersicht und Karte ---------- */

/** Karte „Raketen-Rennen“ im Wettkampf-Tab (auch ohne Konto): Reihum jetzt, Gruppen-Rennen folgen mit R2/R3. */
export function raceCard(): HTMLElement {
  return card([
    h('p', { class: 'race-card-title' }, icon('rocket', 20), h('span', null, t('race.title'))),
    h('p', { class: 'race-card-text' }, t('race.cardText')),
    button({ label: t('race.reihum'), kind: 'primary', full: true, icon: 'play', href: REIHUM_HREF }),
    h('p', { class: 'race-card-note' }, t('race.reihumSub')),
    h('p', { class: 'race-card-note' }, `${t('race.group')}: ${t('race.groupSoon')}`),
  ], { class: 'race-card' });
}

/**
 * Spielweisen mit Gruppe (nur mit Konto). R1: Hinweis „kommt mit Gruppen-Rennen“; R2/R3 ersetzen diesen Block
 * durch das Anlegen und die Liste offener Rennen.
 */
export function waysGroup(): HTMLElement {
  return group(t('race.group'), h('p', { class: 'race-note-line' }, t('race.groupSoon')));
}

export function renderRace(): void {
  app.replaceChildren(
    backLink({ label: t('race.toCompete'), href: '#/wettbewerbe' }),
    largeTitle(t('race.title'), t('race.subtitle')),
    card([
      h('p', { class: 'race-card-title' }, icon('rocket', 20), h('span', null, t('race.reihum'))),
      h('p', { class: 'race-card-text' }, t('race.reihumText')),
      button({ label: t('race.reihumStart'), kind: 'primary', full: true, icon: 'play', href: REIHUM_HREF }),
    ], { hero: true, class: 'race-card' }),
    waysGroup(),
    group(t('race.rulesTitle'), h('ul', { class: 'race-rules' },
      ...(['rules1', 'rules2', 'rules3', 'rules4'] as const).map((k) => h('li', null, t(`race.${k}`))))));
}

/* ---------- Reihum ---------- */

export function renderRaceReihum(): void {
  const root = app;
  let handle: { stop(): void } | null = null;
  let counted = false;
  setCleanup(() => handle?.stop());

  const leave = (): void => go(RACE_HREF);
  const confirmLeave = (): void => {
    void confirmDialog(t('race.abortText'), { title: t('race.abortTitle'), confirmLabel: t('race.abortConfirm'), danger: true })
      .then((yes) => { if (yes) { handle?.stop(); leave(); } });
  };

  function showSetup(): void {
    handle = null;
    const names = loadNames();
    const players = playersForm(names);
    const cfgForm = configForm(loadConfig());
    const start = button({
      label: t('common.letsGo'), kind: 'primary', full: true, icon: 'play',
      onClick: () => {
        const cfg = cfgForm.get();
        const chosen = players.get();
        saveConfig(cfg);
        saveNames(chosen.filter((n, i) => n !== t('race.playerN', { n: i + 1 })));
        startRound(chosen, cfg);
      },
    });
    root.replaceChildren(
      focusHead({ closeLabel: t('race.close'), href: RACE_HREF, title: t('race.reihum') }),
      h('div', { class: 'stage is-start race-setup' },
        h('p', { class: 'race-intro' }, t('race.setupIntro')),
        group(t('race.players'), players.el),
        group(t('race.settings'), cfgForm.el)),
      dock(start));
    setTitle(t('race.reihum'));
    window.scrollTo(0, 0);
  }

  /** Eine Runde mit festen Spielern: derselbe Aufgabenstrom für alle, nacheinander. */
  function startRound(rawPlayers: readonly string[], cfg: RaceConfig): void {
    const players = finalizeNames(rawPlayers);
    const tasks = raceTasks(newRaceSeed(), cfg);
    const runs: RaceRun[] = [];
    const lists: Array<{ name: string; answers: RaceAnswer[] }> = [];
    counted = false;

    const handover = (i: number): void => {
      handle = null;
      const name = players[i] ?? '';
      const prev = runs[i - 1];
      const prevScore = prev ? prev.steps.filter((s) => s.ok).length : 0;
      const ready = button({ label: t('race.ready'), kind: 'primary', full: true, icon: 'play', onClick: () => play(i) });
      root.replaceChildren(
        focusHead({
          closeLabel: t('race.abort'), onClose: i > 0 ? confirmLeave : leave, title: t('race.reihum'),
          children: [h('span', { class: 'race-head-gap' }), h('span', { class: 'race-head-count num' }, t('race.playerOf', { n: i + 1, total: players.length }))],
        }),
        h('div', { class: 'stage race-handover' },
          h('p', { class: 'race-hand-label' }, t('race.handTo')),
          h('h1', { class: 'race-hand-name', tabindex: '-1' }, name),
          h('p', { class: 'race-hand-meta' }, configLine(cfg)),
          prev ? h('p', { class: 'race-hand-prev' }, t('race.prevScore', { name: prev.name, n: prevScore })) : null),
        dock(ready));
      setTitle(t('race.reihum'));
      window.scrollTo(0, 0);
      ready.focus({ preventScroll: true });
    };

    const play = (i: number): void => {
      const name = players[i] ?? '';
      handle = playRace({
        root, cfg, tasks, name, title: name,
        onDone: (out) => {
          runs.push({ name, steps: out.steps, ...(i === 0 ? { me: true } : {}) });
          lists.push({ name, answers: out.answers });
          if (i + 1 < players.length) handover(i + 1);
          else finishRound();
        },
        onExit: leave,
      });
    };

    const finishRound = (): void => {
      // Nur eine Runde dieses Geräts (nicht je Spieler): die des ersten Spielers; keine Attempts (Skills und Liga bleiben unberührt)
      const first = lists[0]?.answers ?? [];
      const okN = first.filter((a) => a.ok).length;
      if (!counted) {
        counted = true;
        addSession({
          id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(),
          mode: 'race', n: first.length, correct: okN, points: 0,
          avgTimeMs: first.length ? Math.round(raceDurationMs(cfg) / first.length) : 0,
        });
      }
      const rewards = first.length ? rewardBlock(updateProgressRewards()) : null;
      handle = showRaceResult({
        root, cfg, runs, tasks: lists, replay: true, summary: configLine(cfg), rewards, closeHref: RACE_HREF,
        primary: { label: t('race.rematch'), icon: 'refresh', onClick: () => startRound(players, cfg) },
        secondary: [
          { label: t('race.done'), href: RACE_HREF },
          { label: t('race.newRace'), kind: 'soft', onClick: () => showSetup() },
        ],
      });
    };

    handover(0);
  }

  showSetup();
}
