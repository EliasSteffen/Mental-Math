// Geister-Rennen in Gruppen (v12 R2): Sheet „Raketen-Rennen“ im Gruppen-Sheet (Anlegen, Liste), Block „Rennen deiner Gruppen“
// im Wettkampf-Tab und die Seite #/rennen/<id>: Vorschau → Spielen gegen die Geister-Raketen der anderen → Abgabe → Rangliste.
// Spielen und Ergebnis nutzen die Bausteine aus R1 (play, result, setup); ein Lauf je Person: wer gespielt hat, sieht die Rangliste.
import { CATEGORIES } from '../../core/catalog.ts';
import { RACE_OPEN_CHOICES, RACE_OPEN_DEFAULT, raceIsOpen, stepsOfRow, timeLeft } from '../../core/race-api.ts';
import type { RaceAnswerIn, RaceBoardRow, RaceInfo, RaceListItem, RaceOpen, RunStatus } from '../../core/race-api.ts';
import { opponentsFromRuns, raceDurationMs, raceTasks, type RaceConfig, type RaceRun } from '../../core/race.ts';
import { addSession } from '../../data/storage.ts';
import { challengeErrorCode } from '../../features/challenge.ts';
import type { GroupInfo } from '../../core/challenge.ts';
import { abandonRun, createRace, finishRun, getRace, listRaces, startRun } from '../../features/race-sync.ts';
import type { RaceDetail } from '../../features/race-sync.ts';
import { updateProgressRewards } from '../../features/rewards.ts';
import { t } from '../../i18n/index.ts';
import { publicUrl, shareText } from '../../platform/index.ts';
import { go, setCleanup } from '../../router.ts';
import { app, h } from '../../ui/dom.ts';
import { dock } from '../../ui/dock.ts';
import { button, focusHead, group, list, row, segmented } from '../../ui/kit.ts';
import { rewardBlock } from '../../ui/rewards.ts';
import { openSheet } from '../../ui/sheet.ts';
import type { SheetHandle } from '../../ui/sheet.ts';
import { setTitle } from '../../ui/title.ts';
import { toast } from '../../ui/toast.ts';
import { notice } from '../compete-ui.ts';
import { playRace } from './play.ts';
import type { RaceOutcome } from './play.ts';
import { showRaceResult } from './result.ts';
import { configForm, configLine, loadConfig, saveConfig } from './setup.ts';

const COMPETE_HREF = '#/wettbewerbe';
export const raceHref = (id: string): string => `#/rennen/${id}`;
/** Live-Rennen baut R3 (`src/views/race/live.ts`); Einträge verlinken schon hierher. */
export const raceLiveHref = (id: string): string => `#/rennen/${id}/live`;

/** Fehlermeldung zu einem Fehlercode der Rennen-Routen */
export function raceErrorText(e: unknown): string {
  const code = challengeErrorCode(e);
  const known = ['invalid', 'unauthorized', 'not_found', 'not_member', 'closed', 'already', 'too_many', 'rate_limited', 'network', 'unavailable', 'no_run', 'not_started'];
  return t(`race.err.${known.includes(code) ? code : 'server_error'}`);
}

/** „60 s Gemischt“ – kurz für Überschriften */
function whatText(cfg: RaceConfig): string {
  const cat = cfg.cat === 'all' ? t('race.catAll') : (CATEGORIES.find((c) => c.id === cfg.cat)?.name ?? cfg.cat);
  return `${t('race.seconds', { n: cfg.durationS })} ${cat}`;
}

const nameOrSomeone = (name: string): string => name.trim() || t('race.anonymous');

function leftText(endsAt: string, now: number): string {
  const l = timeLeft(Date.parse(endsAt), now);
  return t(`race.left.${l.unit}`, { n: l.n });
}

function statusText(s: RunStatus): string {
  return t(`race.state.${s}`);
}

/* ---------- Liste ---------- */

function raceRow(r: RaceListItem, now: number, extra?: string): HTMLElement {
  const open = raceIsOpen(r, now);
  const live = r.kind === 'live';
  const sub = [t('race.by', { name: nameOrSomeone(r.createdByName) }), open ? leftText(r.endsAt, now) : t('race.ended'), t('race.nPlayed', { n: r.runs })];
  if (extra) sub.unshift(extra);
  const toPlay = open && r.myStatus === 'none';
  return row({
    icon: 'rocket', label: `${live ? `${t('race.liveTag')} · ` : ''}${configLine(r.config)}`, sub: sub.join(' · '),
    value: toPlay ? (live ? t('race.liveJoin') : statusText('none')) : r.myStatus === 'none' ? '' : statusText(r.myStatus),
    valueTone: toPlay ? 'accent' : 'muted', href: live ? raceLiveHref(r.id) : raceHref(r.id),
  });
}

/* ---------- Sheet im Gruppen-Sheet ---------- */

let sheet: SheetHandle | null = null;
const closeSheet = (): void => { sheet?.close(); };

/** Zeile „Raketen-Rennen“ für das Gruppen-Sheet (`compete.ts`): öffnet das Sheet dieser Gruppe. */
export function raceSheetRow(g: GroupInfo, closeParent: () => void): HTMLElement {
  return row({
    icon: 'rocket', label: t('race.sheetRow'), sub: t('race.sheetRowSub'), chevron: true,
    onClick: () => { closeParent(); openRaceSheet(g); },
  });
}

/** Sheet „Raketen-Rennen“ einer Gruppe: neues Geister-Rennen anlegen und die Liste offener und letzter Rennen. */
export function openRaceSheet(g: GroupInfo): void {
  sheet?.close();
  let open: RaceOpen = RACE_OPEN_DEFAULT;
  const cfgForm = configForm(loadConfig());
  const openSeg = segmented<RaceOpen>({
    label: t('race.openFor'), inline: true, even: true,
    options: RACE_OPEN_CHOICES.map((o) => [o, t(`race.open.${o}`)] as const), value: open, onChange: (v) => { open = v; },
  });
  const err = h('p', { class: 'prof-err', role: 'alert' });
  const create = button({
    label: t('race.createRace'), kind: 'primary', full: true, cta: false, icon: 'play',
    onClick: () => {
      const config = cfgForm.get();
      saveConfig(config);
      create.disabled = true;
      err.textContent = '';
      createRace({ groupId: g.id, kind: 'ghost', config, open }).then((race) => {
        closeSheet();
        toast(t('race.raceCreated'), { kind: 'success' });
        go(raceHref(race.id));
      }, (e: unknown) => { err.textContent = raceErrorText(e); }).finally(() => { create.disabled = false; });
    },
  });
  const listHolder = h('div', { class: 'race-sheet-list' }, notice(t('race.loading')));
  const load = (): void => {
    listRaces(g.id).then((races) => {
      if (sheet?.el.isConnected !== true) return;
      const now = Date.now();
      const openOnes = races.filter((r) => raceIsOpen(r, now));
      const ended = races.filter((r) => !raceIsOpen(r, now));
      const parts: Node[] = [];
      if (openOnes.length) parts.push(group(t('race.openRaces'), list(openOnes.map((r) => raceRow(r, now)))));
      if (ended.length) parts.push(group(t('race.recentRaces'), list(ended.map((r) => raceRow(r, now)))));
      if (!races.length) parts.push(h('p', { class: 'prof-sheet-text' }, t('race.noRaces')));
      listHolder.replaceChildren(...parts);
    }, (e: unknown) => {
      if (sheet?.el.isConnected !== true) return;
      listHolder.replaceChildren(notice(raceErrorText(e), challengeErrorCode(e) === 'unavailable' ? undefined : { label: t('race.retry'), onClick: load }));
    });
  };
  const handle = openSheet({
    title: `${t('race.sheetRow')} · ${g.name}`,
    children: [
      h('p', { class: 'prof-sheet-text' }, t('race.sheetIntro')),
      group(t('race.newRace'), h('div', { class: 'race-sheet-form' }, cfgForm.el, openSeg.el, err, create)),
      listHolder,
    ],
    onClose: () => { if (sheet === handle) sheet = null; },
  });
  sheet = handle;
  load();
}

/** Eine Gruppe wählen (bei mehreren), dann ihr Rennen-Sheet öffnen – für die Karte im Wettkampf-Tab. */
export function openGroupPicker(groups: readonly GroupInfo[]): void {
  const only = groups[0];
  if (groups.length === 1 && only) { openRaceSheet(only); return; }
  sheet?.close();
  const handle = openSheet({
    title: t('race.groupPick'),
    children: [list(groups.map((g) => row({ icon: 'person', label: g.name, chevron: true, onClick: () => { handle.close(); openRaceSheet(g); } })))],
    onClose: () => { if (sheet === handle) sheet = null; },
  });
  sheet = handle;
}

/* ---------- Wettkampf: offene Rennen aller Gruppen ---------- */

/**
 * Block „Rennen deiner Gruppen“: höchstens vier offene Rennen (zuerst die, die du noch nicht gespielt hast) – „Ben fordert euch:
 * 60 s Gemischt · noch 20 h“. Leer oder ohne SQL 008 (`unavailable`) bleibt der Block unsichtbar.
 */
export function groupRacesBlock(groups: readonly GroupInfo[], isAlive: () => boolean): HTMLElement {
  const holder = h('div', { class: 'race-groups-block' });
  if (groups.length === 0) return holder;
  void Promise.allSettled(groups.map((g) => listRaces(g.id))).then((results) => {
    if (!isAlive()) return;
    const now = Date.now();
    const items: Array<{ r: RaceListItem; group: string }> = [];
    results.forEach((res, i) => {
      if (res.status !== 'fulfilled') return;
      for (const r of res.value) if (raceIsOpen(r, now)) items.push({ r, group: groups[i]?.name ?? '' });
    });
    items.sort((a, b) => Number(a.r.myStatus !== 'none') - Number(b.r.myStatus !== 'none') || Date.parse(a.r.endsAt) - Date.parse(b.r.endsAt));
    const rows = items.slice(0, 4).map(({ r, group: gname }) => {
      const live = r.kind === 'live';
      const toPlay = r.myStatus === 'none';
      return row({
        icon: 'rocket', label: t('race.challenges', { name: nameOrSomeone(r.createdByName), what: whatText(r.config) }),
        sub: t('race.challengeSub', { group: gname, left: leftText(r.endsAt, now) }),
        value: toPlay ? (live ? t('race.liveJoin') : statusText('none')) : statusText(r.myStatus), valueTone: toPlay ? 'accent' : 'muted',
        href: live ? raceLiveHref(r.id) : raceHref(r.id),
      });
    });
    if (rows.length) holder.replaceChildren(group(t('race.challengesTitle'), list(rows)));
  });
  return holder;
}

/* ---------- Seite #/rennen/<id> ---------- */

const MISSING_SHOWN = 5;

function namesLine(names: readonly string[]): string {
  if (names.length <= MISSING_SHOWN) return names.join(', ');
  return t('race.andMore', { names: names.slice(0, MISSING_SHOWN).join(', '), n: names.length - MISSING_SHOWN });
}

export function renderRaceGroup(id: string): void {
  const root = app;
  let alive = true;
  let playing = false;
  let handle: { stop(): void } | null = null;
  setCleanup(() => {
    alive = false;
    handle?.stop();
    if (playing) abandonRun(id); // Seite verlassen mitten im Lauf: zählt als leere Abgabe
  });

  const head = (): HTMLElement => focusHead({ closeLabel: t('race.close'), href: COMPETE_HREF, title: t('race.title') });
  const stage = (...children: Array<Node | null>): HTMLElement => h('div', { class: 'stage is-start race-preview' }, ...children);

  function paintLoading(text: string): void {
    handle = null;
    root.replaceChildren(head(), stage(notice(text)));
    setTitle(t('race.title'));
  }

  function showError(e: unknown): void {
    const code = challengeErrorCode(e);
    const retry = code === 'network' || code === 'server_error' || code === 'rate_limited';
    root.replaceChildren(head(), stage(
      notice(raceErrorText(e), retry ? { label: t('race.retry'), onClick: load } : undefined),
      button({ label: t('race.toGroups'), kind: 'soft', full: true, href: COMPETE_HREF })));
    setTitle(t('race.title'));
  }

  function load(): void {
    paintLoading(t('race.loading'));
    getRace(id).then((d) => { if (alive) show(d); }, (e: unknown) => { if (alive) showError(e); });
  }

  function share(race: RaceInfo): void {
    const text = t('race.shareText', { name: nameOrSomeone(race.createdByName), what: whatText(race.config), url: `${publicUrl()}${raceHref(race.id)}` });
    void shareText(text).then((r) => { if (r === 'copied') toast(t('race.copied'), { kind: 'success' }); });
  }

  function shareButton(race: RaceInfo): HTMLElement {
    return button({ label: t('race.shareLink'), kind: 'soft', icon: 'link', full: true, onClick: () => share(race) });
  }

  function show(d: RaceDetail): void {
    const open = raceIsOpen(d.race, Date.now());
    if (d.me === null && open) showPreview(d);
    else showRanking(d, {});
  }

  /* ----- Vorschau ----- */
  function showPreview(d: RaceDetail): void {
    handle = null;
    const { race, board } = d;
    const live = race.kind === 'live';
    const names = board.filter((r) => !r.me).map((r) => nameOrSomeone(r.name));
    const busy = (on: boolean): void => { if (startBtn instanceof HTMLButtonElement) startBtn.disabled = on; };
    const startBtn = live
      ? button({ label: t('race.liveOpen'), kind: 'primary', full: true, icon: 'play', href: raceLiveHref(race.id) })
      : button({
        label: t('race.runStart'), kind: 'primary', full: true, icon: 'play',
        onClick: () => {
          busy(true);
          startRun(id).then(() => { if (alive) play(d); }, (e: unknown) => {
            if (!alive) return;
            if (challengeErrorCode(e) === 'already') { load(); return; }
            busy(false);
            toast(raceErrorText(e), { kind: 'error' });
          });
        },
      });
    root.replaceChildren(
      head(),
      stage(
        h('p', { class: 'race-hand-label' }, t('race.fromName', { name: nameOrSomeone(race.createdByName) })),
        h('h1', { class: 'race-preview-title', tabindex: '-1' }, configLine(race.config)),
        h('p', { class: 'race-hand-meta' }, leftText(race.endsAt, Date.now())),
        h('p', { class: 'race-preview-note' }, live ? t('race.previewLive') : names.length ? t('race.previewGhosts', { names: namesLine(names) }) : t('race.previewNone')),
        live ? null : h('p', { class: 'race-preview-note' }, t('race.previewOnce'))),
      dock(h('div', { class: 'train-result-actions' }, shareButton(race)), startBtn));
    setTitle(t('race.title'));
    window.scrollTo(0, 0);
  }

  /* ----- Spielen ----- */
  function play(d: RaceDetail): void {
    const { race, board } = d;
    const tasks = raceTasks(race.seed, race.config);
    const ghosts: RaceRun[] = board.filter((r) => !r.me).map((r) => ({ name: nameOrSomeone(r.name), steps: stepsOfRow(r.steps) }));
    playing = true;
    handle = playRace({
      root, cfg: race.config, tasks, name: t('race.you'), opponents: opponentsFromRuns(ghosts),
      onDone: (out) => { playing = false; submit(d, out); },
      onExit: () => { playing = false; abandonRun(id); go(COMPETE_HREF); },
    });
  }

  /** Eine Runde zählt wie jedes Ergebnis für Tagesziel, Serie und Quests – nie als Attempt (Skills und Liga bleiben unberührt). */
  function countRound(cfg: RaceConfig, out: RaceOutcome): Node | null {
    const okN = out.answers.filter((a) => a.ok).length;
    addSession({
      id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(),
      mode: 'race', n: out.answers.length, correct: okN, points: 0,
      avgTimeMs: out.answers.length ? Math.round(raceDurationMs(cfg) / out.answers.length) : 0,
    });
    return out.answers.length ? rewardBlock(updateProgressRewards()) : null;
  }

  function submit(d: RaceDetail, out: RaceOutcome): void {
    const rewards = countRound(d.race.config, out);
    paintLoading(t('race.sending'));
    const answers: RaceAnswerIn[] = out.answers.map((a) => ({ i: a.i, input: a.given, ms: a.ms }));
    void finishRun(id, answers).then(async (fin) => {
      if (!alive) return;
      if (fin) {
        try {
          const fresh = await getRace(id);
          if (alive) showRanking(fresh, { out, rewards, replay: true });
          return;
        } catch { /* Rangliste nicht ladbar: lokales Ergebnis zeigen */ }
      }
      if (alive) showRanking(d, { out, rewards, replay: true, pending: fin === null });
    });
  }

  /* ----- Rangliste ----- */
  function showRanking(d: RaceDetail, o: { out?: RaceOutcome; rewards?: Node | null; replay?: boolean; pending?: boolean }): void {
    handle = null;
    const { race, board } = d;
    const now = Date.now();
    const open = raceIsOpen(race, now);
    const out = o.out;
    // Ohne eigene Zeile in der Rangliste (Abgabe wartet noch): die eigene Zeitleiste aus dem Lauf einfügen
    const mine = board.find((r) => r.me);
    const runs: RaceRun[] = board.map((r: RaceBoardRow) => ({ name: nameOrSomeone(r.name), steps: stepsOfRow(r.steps), ...(r.me ? { me: true } : {}) }));
    if (!mine && out) runs.push({ name: t('race.you'), steps: out.steps, me: true });
    const myName = nameOrSomeone(mine?.name ?? t('race.you'));

    const notes: Array<Node | null> = [];
    const status = d.me?.status ?? 'none';
    if (o.pending) notes.push(h('p', { class: 'race-extra-note', role: 'status' }, t('race.pending')));
    else if (status === 'flagged') notes.push(h('p', { class: 'race-extra-note is-warn' }, t('race.flagged')));
    else if (status === 'expired') notes.push(h('p', { class: 'race-extra-note is-warn' }, t('race.expired')));
    else if (status === 'running') notes.push(h('p', { class: 'race-extra-note is-warn' }, t('race.runningElse')));
    const missing = (d.missing ?? []).filter((n) => n !== '');
    if (missing.length) notes.push(h('p', { class: 'race-extra-note' }, t(open ? 'race.missing' : 'race.notPlayed', { names: namesLine(missing) })));
    else if (runs.length > 1 && race.kind === 'ghost') notes.push(h('p', { class: 'race-extra-note' }, t('race.allPlayed')));
    if (open) notes.push(h('p', { class: 'race-extra-note' }, t('race.stillOpen', { left: leftText(race.endsAt, now) })));
    else notes.push(h('p', { class: 'race-extra-note' }, t('race.closedNote')));
    const extra = h('div', { class: 'race-extra' }, ...notes, o.rewards ?? null);

    if (runs.length === 0) {
      root.replaceChildren(head(), stage(h('p', { class: 'race-hand-label' }, configLine(race.config)), notice(t('race.closedNobody')), extra),
        dock(h('div', { class: 'train-result-actions' }, shareButton(race)), button({ label: t('race.done'), kind: 'primary', full: true, href: COMPETE_HREF })));
      setTitle(t('race.title'));
      return;
    }
    handle = showRaceResult({
      root, cfg: race.config, runs,
      ...(out ? { tasks: [{ name: myName, answers: out.answers }] } : {}),
      replay: o.replay === true && runs.some((r) => r.me), summary: configLine(race.config), rewards: extra, closeHref: COMPETE_HREF,
      primary: { label: t('race.done'), href: COMPETE_HREF },
      secondary: [{ label: t('race.shareLink'), kind: 'soft', icon: 'link', onClick: () => share(race) }],
    });
  }

  load();
}
