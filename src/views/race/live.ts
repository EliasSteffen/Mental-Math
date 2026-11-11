// Live-Rennen in Gruppen (v12 R3): Lobby (#/rennen/<id>/live), gemeinsamer Countdown nach Serverzeit, Live-Raketen der anderen,
// danach Abgabe und Podest. Der Rennraum (Durable Object) ist nur Treffpunkt und Taktgeber; gewertet wird über den Server
// (POST /race/:id/finish). Zustandsautomat und Nachrichten: src/core/race-room.ts, Verbindung: src/features/race-live.ts.
import type { Task } from '../../types.ts';
import {
  raceDurationMs, raceTasks, type RaceConfig, type RaceRun,
} from '../../core/race.ts';
import { perfAt, type ClientMsg, type LobbyPlayer, type RaceBoardRow, type RaceInfo, type RoomPhase, type ServerMsg } from '../../core/race-room.ts';
import { addSession } from '../../data/storage.ts';
import { rankedAvailable, ChallengeError, challengeErrorCode } from '../../features/challenge.ts';
import {
  createLiveRace, getRaceInfo, goLive, liveAvailable, liveOpponents, openLive, runsFromBoard, submitAnswers, submittedCount, toSubmitted,
  type LiveHandle, type LiveOpponents, type LiveStatus,
} from '../../features/race-live.ts';
import { updateProgressRewards } from '../../features/rewards.ts';
import { t } from '../../i18n/index.ts';
import { publicUrl, shareText } from '../../platform/index.ts';
import { go, setCleanup } from '../../router.ts';
import { app, h } from '../../ui/dom.ts';
import { button, focusHead, group, list, row } from '../../ui/kit.ts';
import { dock } from '../../ui/dock.ts';
import { openSheet, type SheetHandle } from '../../ui/sheet.ts';
import { rewardBlock } from '../../ui/rewards.ts';
import { setTitle } from '../../ui/title.ts';
import { toast } from '../../ui/toast.ts';
import { errorText } from '../compete-ui.ts';
import { playRace, type RaceOutcome } from './play.ts';
import { showRaceResult } from './result.ts';
import { configForm, configLine, loadConfig, saveConfig } from './setup.ts';
import { createTrack } from './track.ts';

export const liveHref = (id: string): string => `#/rennen/${id}/live`;
const BACK_HREF = '#/wettbewerbe';
/** So viel nach der Startzeit darf man noch einsteigen (Netz, Uhr); später gilt: verpasst, nur zuschauen */
const LATE_START_MS = 1500;
/** So lange wartet das Ergebnis auf die Abgaben der anderen */
const WAIT_OTHERS_MS = 10_000;
const POLL_MS = 1500;

/* ---------- Knopf im Gruppen-Sheet ---------- */

/**
 * Knopf „Live-Rennen starten“ für das Gruppen-Sheet (Einrichten wie bei jedem Rennen, dann Lobby). Bleibt ausgeblendet,
 * bis der Server meldet, dass Live-Rennen eingerichtet sind (Worker-Binding vorhanden).
 * `close` schließt das Gruppen-Sheet.
 */
export function liveRaceButton(g: { id: string; name: string }, close: () => void): HTMLElement {
  const wrap = h('div', { class: 'race-live-entry' });
  wrap.hidden = true;
  let sheet: SheetHandle | null = null;
  const open = (): void => {
    close();
    const form = configForm(loadConfig());
    const err = h('p', { class: 'race-live-error', role: 'alert' });
    const create = button({
      label: t('race.liveLobbyOpen'), kind: 'primary', full: true, icon: 'play',
      onClick: () => {
        const cfg: RaceConfig = form.get();
        saveConfig(cfg);
        create.disabled = true;
        err.textContent = '';
        createLiveRace(g.id, cfg).then((race) => { sheet?.close(); go(liveHref(race.id)); }, (e: unknown) => {
          err.textContent = errorText(e);
          create.disabled = false;
        });
      },
    });
    sheet = openSheet({
      title: t('race.liveSheetTitle', { name: g.name }),
      children: [h('p', { class: 'prof-sheet-text' }, t('race.liveIntro')), form.el, err, create],
      onClose: () => { sheet = null; },
    });
  };
  wrap.append(button({ label: t('race.liveButton'), kind: 'soft', icon: 'play', full: true, onClick: open }));
  void liveAvailable().then((ok) => { wrap.hidden = !ok; });
  return wrap;
}

/* ---------- Seite ---------- */

type Mode = 'loading' | 'lobby' | 'play' | 'wait' | 'spectate' | 'result' | 'gone';

export function renderRaceLive(raceId: string): void {
  const root = app;
  let dead = false;
  let mode: Mode = 'loading';
  let race: RaceInfo | null = null;
  let tasks: Task[] = [];
  let live: LiveHandle | null = null;
  let playing: { stop(): void } | null = null;
  let result: { stop(): void } | null = null;
  let conn: LiveStatus = 'connecting';
  let you = '';
  let hostId: string | null = null;
  let phase: RoomPhase = 'lobby';
  let startsAt: number | null = null;
  let roster: LobbyPlayer[] = [];
  let startedRoster: LobbyPlayer[] = [];
  let opponents: LiveOpponents | null = null;
  let starting = false;
  let pendingStart = false;
  let spectateTrack: ReturnType<typeof createTrack> | null = null;
  let waitText: HTMLElement | null = null;
  let counted = false;
  const unsent: ClientMsg[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const banner = h('p', { class: 'race-live-banner', role: 'status' });
  banner.hidden = true;

  setCleanup(() => {
    dead = true;
    live?.stop();
    playing?.stop();
    result?.stop();
    for (const id of timers) clearTimeout(id);
    timers.clear();
  });

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
    const id = setTimeout(() => { timers.delete(id); resolve(); }, ms);
    timers.add(id);
  });

  const me = (): LobbyPlayer | undefined => roster.find((p) => p.id === you);
  const cfg = (): RaceConfig => race?.config ?? loadConfig();

  function updateBanner(): void {
    let text = '';
    if (conn === 'lost' || (conn === 'connecting' && mode !== 'loading' && mode !== 'gone' && roster.length > 0)) text = t('race.liveLost');
    else if (mode === 'play' || mode === 'spectate') {
      const away = roster.filter((p) => !p.connected && p.id !== you).map((p) => p.name);
      if (away.length) text = t('race.livePeerLost', { name: away.join(', ') });
    }
    banner.textContent = text;
    banner.hidden = text === '';
  }

  // Im Rennen direkt unter der Rennbahn (verdeckt so keine Rakete), sonst oben über der Seite
  const attach = (): void => {
    const track = root.querySelector('.race-stage > .race-track');
    if (track) track.after(banner); else root.append(banner);
    updateBanner();
  };

  /* ---------- einfache Bildschirme ---------- */

  function showGone(text: string, title: string = t('race.liveTitle')): void {
    mode = 'gone';
    live?.stop();
    playing?.stop();
    root.replaceChildren(
      focusHead({ closeLabel: t('race.close'), href: BACK_HREF, title }),
      h('div', { class: 'stage is-start race-live-gone' }, h('p', { class: 'race-live-gone-text', role: 'status' }, text)),
      dock(button({ label: t('race.liveBack'), kind: 'primary', full: true, href: BACK_HREF })));
    setTitle(t('race.liveTitle'));
    window.scrollTo(0, 0);
  }

  function showLoading(text: string): void {
    mode = 'loading';
    root.replaceChildren(
      focusHead({ closeLabel: t('race.close'), href: BACK_HREF, title: t('race.liveTitle') }),
      h('div', { class: 'stage is-start race-live-gone' }, h('p', { class: 'race-live-gone-text', role: 'status' }, text)));
    setTitle(t('race.liveTitle'));
  }

  const goneText = (e: unknown): string => {
    const code = challengeErrorCode(e);
    if (code === 'unavailable') return t('race.liveUnavailable');
    if (code === 'not_member') return t('race.liveNotMember');
    if (code === 'not_found') return t('race.liveNotFound');
    if (code === 'closed') return t('race.liveClosed');
    return errorText(e);
  };

  /* ---------- Lobby ---------- */

  function renderLobby(): void {
    if (dead || mode === 'play' || mode === 'wait' || mode === 'result' || mode === 'gone' || mode === 'spectate') return;
    mode = 'lobby';
    const isHost = hostId !== null && hostId === you;
    const connected = roster.filter((p) => p.connected).length;
    const host = roster.find((p) => p.id === hostId);
    const rows = roster.map((p) => row({
      icon: 'person', label: p.id === you ? `${p.name} (${t('race.liveYou')})` : p.name,
      value: p.host ? t('race.liveHost') : undefined, valueTone: 'accent', class: p.connected ? undefined : 'is-away',
    }));
    const share = button({
      label: t('race.liveShare'), kind: 'soft', icon: 'link', full: true,
      onClick: () => { void shareText(t('race.liveShareText', { url: `${publicUrl()}${liveHref(raceId)}` })).then((r) => { if (r === 'copied') toast(t('compete.copied'), { kind: 'success' }); }); },
    });
    let action: HTMLElement;
    if (isHost) {
      const start = button({
        label: t('race.liveStart'), kind: 'primary', full: true, icon: 'play', disabled: connected < 2 || starting || conn !== 'open',
        onClick: () => { void startRace(); },
      });
      action = dock(connected < 2 ? h('p', { class: 'race-live-hint' }, t('race.liveNeedTwo')) : null, start);
    } else {
      action = dock(h('p', { class: 'race-live-hint', role: 'status' }, host ? t('race.liveWaitHost', { name: host.name }) : t('race.liveWaiting')));
    }
    root.replaceChildren(
      focusHead({ closeLabel: t('race.close'), href: BACK_HREF, title: t('race.liveTitle') }),
      h('div', { class: 'stage is-start race-live-lobby' },
        h('p', { class: 'race-intro' }, `${t('race.liveLobbyTitle')} · ${configLine(cfg())}`),
        group(t('race.liveConnected', { n: connected }), roster.length ? list(rows) : h('p', { class: 'race-note-line' }, t('race.liveConnecting'))),
        share),
      action);
    setTitle(t('race.liveTitle'));
    attach();
  }

  async function startRace(): Promise<void> {
    starting = true;
    renderLobby();
    try {
      const at = await goLive(raceId);
      if (!live?.send({ t: 'start', startsAt: at })) throw new ChallengeError('network');
      // Der Raum antwortet mit einem Schnappschuss (Countdown) – dort geht es los
    } catch (e) {
      starting = false;
      toast(errorText(e), { kind: 'error' });
      renderLobby();
    }
  }

  /* ---------- Rennen ---------- */

  function beginRace(): void {
    if (dead || !race || startsAt === null || (mode !== 'lobby' && mode !== 'loading')) return;
    const offset = live?.offset() ?? null;
    if (offset === null) { pendingStart = true; return; } // Uhrabgleich fehlt noch: nächste Nachricht probiert es erneut
    pendingStart = false;
    const lateBy = Date.now() + offset - startsAt;
    const self = me();
    if (!self || lateBy > LATE_START_MS) { spectate(); return; }
    startedRoster = roster.slice();
    opponents = liveOpponents(roster.filter((p) => p.id !== you));
    mode = 'play';
    const startPerf = perfAt(startsAt, offset, Date.now(), performance.now());
    playing = playRace({
      root, cfg: race.config, tasks, name: self.name, title: t('race.liveShort'), opponents, startPerf,
      onAnswer: (a) => {
        const msg: ClientMsg = { t: 'pos', i: a.i, ok: a.ok, ms: a.ms };
        if (!live?.send(msg)) unsent.push(msg);
      },
      onDone: (out) => { playing = null; void finished(out); },
      onExit: () => { live?.send({ t: 'leave' }); go(BACK_HREF); },
    });
    attach();
  }

  /** Verpasster Start oder Wiedereinstieg mitten im Rennen: zuschauen, am Ende das Ergebnis */
  function spectate(): void {
    mode = 'spectate';
    startedRoster = roster.slice();
    opponents = liveOpponents(roster);
    spectateTrack = createTrack(roster.map((p) => ({ name: p.name, ...(p.id === you ? { me: true } : {}) })));
    spectateTrack.el.classList.add('is-big');
    spectateTrack.set(roster.map(() => 0), { instant: true });
    root.replaceChildren(
      focusHead({ closeLabel: t('race.close'), href: BACK_HREF, title: t('race.liveTitle') }),
      h('div', { class: 'stage race-stage race-replay' },
        h('p', { class: 'race-live-gone-text', role: 'status' }, t('race.liveMissed')),
        spectateTrack.el));
    setTitle(t('race.liveTitle'));
    window.scrollTo(0, 0);
    attach();
  }

  function paintSpectate(): void {
    if (mode === 'spectate' && spectateTrack && opponents) spectateTrack.set(roster.map((p) => opponents?.altitudeOf(p.id) ?? 0));
  }

  function renderWait(text: string): void {
    mode = 'wait';
    waitText = h('p', { class: 'race-live-gone-text', role: 'status' }, text);
    root.replaceChildren(
      focusHead({ closeLabel: t('race.close'), href: BACK_HREF, title: t('race.liveTitle') }),
      h('div', { class: 'stage is-start race-live-gone' }, waitText));
    setTitle(t('race.liveTitle'));
    window.scrollTo(0, 0);
    attach();
  }

  /** Abgabe, auf die anderen warten (höchstens 10 s), Podest. `out` fehlt bei Zuschauern. */
  async function finished(out: RaceOutcome | null): Promise<void> {
    if (!race) return;
    const c = race.config;
    let rewards: Node | null = null;
    if (out) {
      renderWait(t('race.liveSubmitting'));
      if (!counted) {
        counted = true;
        const okN = out.answers.filter((a) => a.ok).length;
        addSession({
          id: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now(),
          mode: 'race', n: out.answers.length, correct: okN, points: 0,
          avgTimeMs: out.answers.length ? Math.round(raceDurationMs(c) / out.answers.length) : 0,
        });
        if (out.answers.length) rewards = rewardBlock(updateProgressRewards());
      }
      let submitted = false;
      for (let attempt = 0; attempt < 3 && !submitted && !dead; attempt++) {
        try {
          await submitAnswers(raceId, toSubmitted(out.answers));
          submitted = true;
        } catch (e) {
          // „schon abgegeben“ o. Ä. zählt als erledigt; Netzfehler: noch zweimal versuchen
          if (challengeErrorCode(e) !== 'network' && challengeErrorCode(e) !== 'server_error') submitted = true;
          else await sleep(1000 * (attempt + 1));
        }
      }
      if (!submitted && !dead) toast(t('race.liveSubmitFailed'), { kind: 'error' });
    } else renderWait(t('race.liveWaitOthers', { done: 0, total: startedRoster.length }));
    if (dead) return;

    const total = Math.max(startedRoster.length, 1);
    const deadline = Date.now() + WAIT_OTHERS_MS;
    let rows: RaceBoardRow[] = [];
    for (;;) {
      try { rows = (await getRaceInfo(raceId)).board; } catch { /* Netz: nächster Versuch */ }
      if (dead) return;
      const done = submittedCount(rows);
      if (waitText) waitText.textContent = t('race.liveWaitOthers', { done, total });
      if (done >= total || Date.now() >= deadline) break;
      await sleep(POLL_MS);
      if (dead) return;
    }
    showResult(rows, out, rewards);
  }

  function showResult(rows: RaceBoardRow[], out: RaceOutcome | null, rewards: Node | null): void {
    if (dead || !race) return;
    mode = 'result';
    const runs: RaceRun[] = runsFromBoard(rows);
    const self = me();
    // Abgabe nicht durchgekommen: die eigene Zeitleiste trotzdem zeigen
    if (out && self && !runs.some((r) => r.me)) runs.push({ name: self.name, steps: out.steps, me: true });
    result = showRaceResult({
      root, cfg: race.config, runs, ...(out && self ? { tasks: [{ name: self.name, answers: out.answers }] } : {}),
      summary: configLine(race.config), rewards, closeHref: BACK_HREF,
      primary: { label: t('race.done'), icon: 'check', href: BACK_HREF }, secondary: [],
    });
  }

  /* ---------- Nachrichten des Raums ---------- */

  function onMessage(m: ServerMsg): void {
    if (dead) return;
    if (pendingStart) beginRace();
    switch (m.t) {
      case 'lobby':
        you = m.you;
        hostId = m.hostId;
        phase = m.phase;
        startsAt = m.startsAt;
        roster = m.players;
        if (phase === 'countdown' || phase === 'running') {
          if (mode === 'lobby' || mode === 'loading') beginRace();
          else { updateBanner(); paintSpectate(); }
        } else if (phase === 'lobby') {
          if (starting && m.startsAt === null) starting = false;
          renderLobby();
        }
        break;
      case 'positions':
        opponents?.update(m.p);
        paintSpectate();
        break;
      case 'end':
        opponents?.update(m.p);
        if (mode === 'lobby' || mode === 'loading') showGone(m.reason === 'expired' ? t('race.liveExpired') : t('race.liveClosed'));
        else if (mode === 'spectate') void finished(null);
        break;
      case 'error':
        if (m.code === 'started') showGone(t('race.liveStartedGone'));
        else if (m.code === 'full') showGone(t('race.liveFull'));
        else if (m.code === 'not_host' || m.code === 'too_few' || m.code === 'bad_start') {
          starting = false;
          toast(t('race.liveStartFailed'), { kind: 'error' });
          renderLobby();
        }
        break;
      default: break;
    }
  }

  function onStatus(s: LiveStatus, code?: ReturnType<typeof challengeErrorCode>): void {
    if (dead) return;
    conn = s;
    if (s === 'open') {
      // Nach einem Verbindungsabbruch: verpasste Antworten nachreichen (der Raum nimmt sie in Reihenfolge an)
      while (unsent.length && live?.send(unsent[0] as ClientMsg)) unsent.shift();
    }
    if (s === 'fatal' && (mode === 'lobby' || mode === 'loading')) showGone(goneText(new ChallengeError(code ?? 'network')));
    else if (mode === 'lobby') renderLobby();
    else updateBanner();
  }

  /* ---------- Start ---------- */

  if (!rankedAvailable()) { showGone(t('race.liveNeedAccount')); return; }
  showLoading(t('race.liveConnecting'));
  void getRaceInfo(raceId).then((d) => {
    if (dead) return;
    if (d.race.kind !== 'live') { showGone(t('race.liveNotLive')); return; }
    race = d.race;
    tasks = raceTasks(d.race.seed, d.race.config);
    live = openLive({ raceId, onMessage, onStatus });
  }, (e: unknown) => { if (!dead) showGone(goneText(e)); });
}
