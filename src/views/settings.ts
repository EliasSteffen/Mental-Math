// Profil (Ruhiger Fokus): Hauptseite mit Konto und Menü (je Bereich eine Zeile mit dem aktuellen Stand), die Bereiche als
// Unterseiten (#/profil/:bereich), ab 1024 px Liste und Bereich nebeneinander. Eingaben kommen aus dem Kit, aktualisieren
// sich lokal und speichern sofort: kein Toast (E21), kein rerender() (Fix A11). Konto-Verwaltung und Kategorien liegen in modalen Sheets.
import type { CategoryId, Level, Settings, ThemeSetting, TimerDisplay } from '../types.ts';
import { getSettings, setSettings, resetAll, exportJSON, getAttempts, getSessions, getProfile, onChange } from '../data/storage.ts';
import { importJSON } from '../data/transfer.ts';
import { applyTheme, THEMES, themeLabel } from '../ui/theme.ts';
import { toast } from '../ui/toast.ts';
import { confirmDialog, openModal } from '../ui/modal.ts';
import { openChangelog, fmtIsoDate } from '../features/whats-new.ts';
import { BUILD_INFO } from '../generated/build-info.ts';
import { detectLang, getLang, setLang, t, locale } from '../i18n/index.ts';
import { CATEGORIES } from '../core/catalog.ts';
import { fmt } from '../core/numbers.ts';
import { deviceKind, feedbackMailto, type FeedbackKind } from '../core/feedback.ts';
import { app, h, appendChildren, type Child } from '../ui/dom.ts';
import { rerender, addCleanup, go } from '../router.ts';
import { backLink, button, group, icon, largeTitle, list, row, segmented, setButtonLabel, stepper, switchRow, type IconName, type SwitchControl } from '../ui/kit.ts';
import { openSheet, type SheetHandle } from '../ui/sheet.ts';
import type { PasskeyInfo, RecoveryStatus } from '../vendor/auth.ts';
import * as acct from '../features/account.ts';
import { getSyncStatus, logoutAndForgetDevice, onSyncStatus, syncNow, syncStatusEntries, wipeCloudData } from '../features/sync.ts';
import { remindersGroup } from './settings-reminders.ts';
import { isPushEnabled, pushConfig } from '../platform/reminders.ts';
import { APP_STORE_URL, isNative, liveUpdateBeta, openMailto, openStorePage, publicUrl, saveFile, setLiveUpdateBeta } from '../platform/index.ts';
import { REPLAY_CHAPTERS } from '../features/tour-scripts.ts';
import { TAB_HREF } from '../ui/shell.ts';
import { isTablet, isWide } from '../ui/viewport.ts';

const NAME_MIN = 2;
/** Wartezeit nach dem Routenwechsel zum Profil, bis das Konto-Sheet aufgeht (Tab-Überblendung 200 ms). */
const ROUTE_SETTLE_MS = 240;
const NAME_MAX = 32;
const SOURCE_URL = 'https://github.com/EliasSteffen/Mental-Math';

let uid = 0;
const nextId = (prefix: string): string => `prof-${prefix}-${++uid}`;

/** Speichert sofort und still (E21). */
const save = (partial: Partial<Settings>): void => { setSettings(partial); };

/** v9 F: „1 Aufgabe“ / „11 Aufgaben“ (Einzahl nur bei genau 1) */
const countTasks = (n: number): string => (n === 1 ? t('settings.taskCountOne') : t('settings.taskCountMany', { n: fmt(n) }));
/** v9 F: „1 Runde“ / „11 Runden“ */
const countRounds = (n: number): string => (n === 1 ? t('settings.roundCountOne') : t('settings.roundCountMany', { n: fmt(n) }));
/** v9 F: „11 Aufgaben · 1 Runde“ für die Daten-Zusammenfassung */
const storedSummary = (): string =>
  t('settings.storedCount', { tasks: countTasks(getAttempts().length), rounds: countRounds(getSessions().length) });

/** Ungefähre Größe der gespeicherten Daten in KB – gemessen am Export (die Daten liegen in IndexedDB, nicht mehr in localStorage). */
function storageKB(): number {
  try {
    return Math.round(new Blob([exportJSON()]).size / 102.4) / 10;
  } catch {
    return 0;
  }
}

const short = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);
const acctDate = (iso: string): string => fmtIsoDate(iso.slice(0, 10));
/** Erstes Zeichen des Namens (auch Emoji) als Initiale. */
const initial = (name: string): string => (Array.from(name.trim())[0] ?? '?').toLocaleUpperCase();

/** Ersetzt ein Element an Ort und Stelle (Sync-Zeile bei Statuswechsel). */
function swap(old: HTMLElement, fresh: HTMLElement): HTMLElement {
  old.replaceWith(fresh);
  return fresh;
}

/** Inhalt eines Bereichs; die Überschrift steht als Seitentitel darüber. */
function profGroup(...children: Child[]): HTMLElement {
  return group(null, ...children);
}

/* ---------- Training: was und wie viel ---------- */

const TIMER_HELP: Record<TimerDisplay, `settings.${string}`> = {
  calm: 'settings.timerCalmHelp', precise: 'settings.timerPreciseHelp', off: 'settings.timerOffHelp',
};

type DiffValue = 'auto' | '1' | '2' | '3';

/** Zeile „Kategorien“ mit Sheet: ein Switch je Kategorie (gemischte Runden, Empfehlung); mindestens eine bleibt aktiv. */
function categoriesRow(s: Settings): HTMLElement {
  // Versteckte Kategorien (z. B. „Eigenes“) gehören nicht in die Auswahl (wie activeCategories)
  const visible = CATEGORIES.filter((c) => !c.hidden);
  const all: CategoryId[] = visible.map((c) => c.id);
  let enabled: CategoryId[] = Array.isArray(s.enabledCategories) ? all.filter((id) => s.enabledCategories?.includes(id)) : all;
  if (enabled.length === 0) enabled = all;

  const catValue = (): string => (enabled.length >= all.length
    ? t('settings.catsAll') : t('settings.catsSome', { n: enabled.length, total: all.length }));
  const cats = row({
    icon: 'grid', label: t('settings.categories'), sub: t('settings.categoriesHelp'), value: catValue(), chevron: true, onClick: () => openCategories(),
    attrs: { 'aria-haspopup': 'dialog' },
  });
  const setEnabled = (ids: CategoryId[]): void => {
    enabled = ids;
    save({ enabledCategories: ids.length >= all.length ? null : ids });
    const v = cats.querySelector('.row-value');
    if (v) v.textContent = catValue();
  };

  function openCategories(): void {
    const box = list([]);
    const lastHint = h('p', { class: 'prof-note', role: 'status' });
    const allBtn = button({ label: t('settings.enableAll'), full: true });
    let ctls: Array<readonly [CategoryId, SwitchControl]> = [];
    const paint = (): void => {
      const last = enabled.length === 1;
      lastHint.textContent = last ? t('settings.lastCategory') : '';
      lastHint.hidden = !last;
      allBtn.disabled = enabled.length >= all.length;
      for (const [id, ctl] of ctls) ctl.setDisabled(last && enabled.includes(id));
    };
    const draw = (): void => {
      ctls = visible.map((c) => [c.id, switchRow({
        label: c.name, help: c.description, checked: enabled.includes(c.id),
        onChange: (on) => {
          setEnabled(on ? all.filter((id) => id === c.id || enabled.includes(id)) : enabled.filter((id) => id !== c.id));
          paint();
        },
      })] as const);
      box.replaceChildren(...ctls.map(([, ctl]) => ctl.el));
      paint();
    };
    allBtn.addEventListener('click', () => {
      setEnabled(all);
      draw();
      box.querySelector<HTMLElement>('button[role="switch"]')?.focus();
    });
    draw();
    openSheet({
      title: t('settings.categories'),
      children: [h('p', { class: 'prof-sheet-text' }, t('settings.categoriesHint')), box, lastHint, allBtn],
    });
  }
  return cats;
}

/** Training: Schwierigkeit (mit Einstufungstest), Tagesziel, Rundenlänge, Kategorien. */
function trainingGroup(s: Settings): HTMLElement {
  const diff = segmented<DiffValue>({
    label: t('settings.difficulty'),
    options: [['auto', t('settings.diffAuto')], ['1', t('settings.diffEasy')], ['2', t('settings.diffMedium')], ['3', t('settings.diffHard')]],
    value: s.difficulty === 'auto' ? 'auto' : (String(s.difficulty) as DiffValue),
    help: t('settings.diffHelp'),
    onChange: (v) => save({ difficulty: v === 'auto' ? 'auto' : (Number(v) as Level) }),
  });

  // Einstufungstest: Startstufe neu bestimmen (stellt die Schwierigkeit auf „Auto“)
  const placed = s.placement;
  const placement = row({
    icon: 'target', label: t('settings.placement'), href: '#/einstufung',
    sub: placed
      ? t('settings.placementDone', { name: t(`placement.theta${placed.theta}`), date: new Date(placed.ts).toLocaleDateString(locale()) })
      : t('settings.placementNone'),
  });

  const goal = stepper({
    label: t('settings.dailyGoal'), value: s.dailyGoalRounds, min: 1, max: 10, step: 1, help: t('settings.dailyGoalHelp'),
    format: (n) => t(n === 1 ? 'settings.roundsNOne' : 'settings.roundsN', { n }), // v9 B: Runden statt Minuten
    onChange: (n) => save({ dailyGoalRounds: n }),
  });

  // Alte Werte (z. B. 30) bleiben wählbar, bis man umstellt
  const lengths = [5, 10, 15, 20];
  if (!lengths.includes(s.sessionLength)) lengths.push(s.sessionLength);
  lengths.sort((a, b) => a - b);
  const len = segmented<string>({
    label: t('settings.roundLength'), help: t('settings.roundLengthHelp'), inline: true, even: true, numeric: true,
    options: lengths.map((n) => [String(n), String(n)] as const),
    value: String(s.sessionLength),
    onChange: (v) => save({ sessionLength: Number(v) }),
  });

  return profGroup(list([diff.el, placement, goal, len.el, categoriesRow(s)]));
}

/* ---------- Während der Runde: Zeit, Abgabe, Hilfen ---------- */

function roundGroup(s: Settings): HTMLElement {
  const timer = segmented<TimerDisplay>({
    label: t('settings.timerDisplay'),
    options: [['calm', t('settings.timerCalm')], ['precise', t('settings.timerPrecise')], ['off', t('settings.timerOff')]],
    value: s.timerDisplay,
    help: t(TIMER_HELP[s.timerDisplay]),
    onChange: (v) => {
      save({ timerDisplay: v });
      timer.setHelp(t(TIMER_HELP[v]));
    },
  });

  // Auto-Fail ist nur mit Zeitwertung sinnvoll: gesperrt und als „aus“ gezeigt, solange `timer` aus ist
  const autoFailHelp = (on: boolean): string => t(on ? 'settings.autoFailOn' : 'settings.autoFailNeedsTimer');
  const autoFail = switchRow({
    label: t('settings.autoFail'), help: autoFailHelp(s.timer),
    checked: s.autoFail && s.timer, disabled: !s.timer, onChange: (v) => save({ autoFail: v }),
  });
  const onTimer = (v: boolean): void => {
    save({ timer: v });
    autoFail.set(getSettings().autoFail && v);
    autoFail.setDisabled(!v);
    autoFail.setHelp(autoFailHelp(v));
  };

  return profGroup(list([
    timer.el,
    switchRow({ label: t('settings.timer'), help: t('settings.timerHint'), checked: s.timer, onChange: onTimer }).el,
    autoFail.el,
    switchRow({ label: t('settings.autoSubmit'), help: t('settings.autoSubmitHint'), checked: s.autoSubmit, onChange: (v) => save({ autoSubmit: v }) }).el,
    switchRow({ label: t('settings.estimate'), help: t('settings.estimateHint'), checked: s.estimateMode, onChange: (v) => save({ estimateMode: v }) }).el,
    switchRow({ label: t('settings.ghost'), help: t('settings.ghostHint'), checked: s.ghost, onChange: (v) => save({ ghost: v }) }).el,
    switchRow({ label: t('settings.breathe'), help: t('settings.breatheHelp'), checked: s.breathe, onChange: (v) => save({ breathe: v }) }).el,
  ]));
}

/* ---------- Eingabe: Tastenfeld ---------- */

function inputGroup(s: Settings): HTMLElement {
  const keypad = segmented<Settings['keypad']>({
    label: t('settings.keypad'),
    options: [['auto', t('settings.keypadAuto')], ['on', t('settings.keypadOn')], ['off', t('settings.keypadOff')]],
    value: s.keypad || 'auto', help: t('settings.keypadHint'),
    onChange: (v) => save({ keypad: v }),
  });
  const pad = segmented<Settings['numpadLayout']>({
    label: t('settings.numpadLayout'), help: t('settings.numpadLayoutHelp'), inline: true, even: true,
    options: [['calculator', t('settings.numpadCalculator')], ['phone', t('settings.numpadPhone')]],
    value: s.numpadLayout,
    onChange: (v) => save({ numpadLayout: v }),
  });
  // Nur auf dem iPad: Auf dem Telefon sitzt das Tastenfeld immer unten
  const side = isTablet()
    ? segmented<Settings['keypadSide']>({
      label: t('settings.keypadSide'), help: t('settings.keypadSideHelp'),
      options: [['left', t('settings.keypadLeft')], ['center', t('settings.keypadCenter')], ['right', t('settings.keypadRight')]],
      value: s.keypadSide,
      onChange: (v) => save({ keypadSide: v }),
    }).el
    : null;
  side?.setAttribute('data-prof', 'keypad-side');
  return profGroup(list([keypad.el, pad.el, side]));
}

/* ---------- Darstellung & Feedback ---------- */

type ThemePick = Exclude<ThemeSetting, 'oled'>;

/** Segment ohne OLED (E2): OLED ist der Switch „Reines Schwarz“ unter dem Segment. */
const THEME_PICKS: readonly ThemePick[] = THEMES.map((x) => x.value).filter((v): v is ThemePick => v !== 'oled');

function appearanceGroup(s: Settings): HTMLElement {
  let theme: ThemeSetting = s.theme;
  const pick = (v: ThemeSetting): ThemePick => (v === 'oled' ? 'night' : v);
  // Sofort anwenden, nicht neu zeichnen
  const setTheme = (v: ThemeSetting): void => { theme = v; save({ theme: v }); applyTheme(v); };

  const themeSeg = segmented<ThemePick>({
    label: t('settings.theme'), help: t('settings.themeHelp'),
    options: THEME_PICKS.map((v) => [v, themeLabel(v)] as const),
    value: pick(theme),
    onChange: (v) => { setTheme(v); paintOled(); },
  });
  /** Nur bei Nacht/System sichtbar bzw. solange OLED aktiv ist; an → 'oled', aus → 'night'. */
  const oled = switchRow({
    label: t('settings.oled'), help: t('settings.oledHelp'), checked: theme === 'oled',
    onChange: (on) => {
      setTheme(on ? 'oled' : 'night');
      themeSeg.set(pick(theme)); // System + OLED → Segment zeigt Nacht
    },
  });
  const paintOled = (): void => {
    oled.set(theme === 'oled');
    oled.el.hidden = !(theme === 'night' || theme === 'system' || theme === 'oled');
  };
  paintOled();

  const lang = segmented<Settings['lang']>({
    label: t('settings.language'), help: t('settings.languageHelp'),
    options: [['auto', t('settings.langAuto')], ['de', t('settings.langDe')], ['en', t('settings.langEn')]],
    value: s.lang,
    onChange: (v) => {
      save({ lang: v });
      // Andere Sprache → der Router zeichnet mit keepScroll neu; danach den Fokus auf die Auswahl zurücklegen
      setLang(detectLang(v));
      document.querySelector<HTMLElement>('[data-prof="lang"] button[aria-pressed="true"]')?.focus({ preventScroll: true });
    },
  });
  lang.el.setAttribute('data-prof', 'lang');
  themeSeg.el.setAttribute('data-prof', 'theme');

  return profGroup(list([
    themeSeg.el, oled.el, lang.el,
    switchRow({ label: t('settings.haptics'), help: t(isNative() ? 'settings.hapticsHelpApp' : 'settings.hapticsHelp'), checked: s.haptics, onChange: (v) => save({ haptics: v }) }).el,
    switchRow({ label: t('settings.sound'), help: t('settings.soundHelp'), checked: s.sound, onChange: (v) => save({ sound: v }) }).el,
    switchRow({ label: t('settings.confetti'), help: t('settings.confettiHelp'), checked: s.confetti, onChange: (v) => save({ confetti: v }) }).el,
  ]));
}

/* ---------- Daten ---------- */

/** `live`: unsichtbare Statusmeldung der Seite (Export ohne Toast, nur gezeichneter Haken). */
function dataGroup(live: HTMLElement): HTMLElement {
  const done = h('span', { class: 'prof-done', 'aria-hidden': 'true' });
  const exportRow = row({
    icon: 'download', label: t('settings.exportBtn'), trailing: done,
    onClick: () => {
      const failed = (): void => { toast(t('settings.exportError'), { kind: 'error' }); };
      let text: string;
      try { text = exportJSON(); } catch { failed(); return; }
      // Browser: Download; iOS-App: Teilen-Menü (abgebrochen → kein Haken)
      void saveFile('mental-math-export.json', 'application/json', text).then((ok) => {
        if (!ok) return;
        done.replaceChildren(h('span', { class: 'draw' }, icon('check', 20))); // neues Element → Haken zeichnet sich erneut
        live.textContent = '';
        requestAnimationFrame(() => { live.textContent = t('settings.exported'); });
      }, failed);
    },
  });

  const fileInput: HTMLInputElement = h('input', {
    type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': t('settings.fileAria'),
    onchange: () => { void onFile(); },
  });
  async function onFile(): Promise<void> {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      toast(t('settings.readError'), { kind: 'error' });
      return;
    }
    const ok = await confirmDialog(t('settings.importConfirm'),
      { title: t('settings.importTitle'), confirmLabel: t('settings.importLabel'), danger: true });
    if (!ok) return;
    const res = importJSON(text);
    if (!res.ok) { toast(res.error, { kind: 'error' }); return; }
    applyTheme(getSettings().theme);
    setLang(detectLang(getSettings().lang));
    const counts = { tasks: countTasks(res.attempts), rounds: countRounds(res.sessions) };
    if (res.skipped > 0) {
      const skipped = res.skipped === 1 ? t('settings.skippedOne') : t('settings.skippedMany', { n: fmt(res.skipped) });
      toast(t('settings.importDoneSkipped', { ...counts, skipped }), { kind: 'info', durationMs: 6000 });
    } else toast(t('settings.importDone', counts), { kind: 'success' });
    rerender({ keepScroll: true }); // alle Einstellungen können sich geändert haben
  }

  const onReset = (): void => {
    // Auch 'offline' (A1) ist ein verknüpftes Konto: ohne Cloud-Löschung kämen die Daten beim nächsten Sync zurück
    const status = acct.getAccountState().status;
    const cloud = status === 'signed-in' || status === 'offline';
    void confirmDialog(t(cloud ? 'settings.resetConfirmCloud' : 'settings.resetConfirm'),
      { title: t('settings.resetTitle'), confirmLabel: t('settings.deleteLabel'), danger: true }).then(async (yes) => {
      if (!yes) return;
      if (cloud) {
        // erst Cloud löschen; bei Fehler lokal nichts löschen (sonst käme alles beim nächsten Sync zurück)
        try { await wipeCloudData(); } catch { toast(t('account.sync.wipeFailed'), { kind: 'error' }); return; }
      }
      resetAll();
      applyTheme('system');
      setLang(detectLang('auto'));
      toast(t('settings.resetDone'), { kind: 'info' });
      rerender({ keepScroll: true });
    });
  };

  const usage = `${storedSummary()} · ${t('settings.storageUsed', { kb: fmt(storageKB()) })}`;
  return profGroup(
    list([
      exportRow,
      row({ icon: 'upload', label: t('settings.importLabel'), onClick: () => fileInput.click() }),
      row({ icon: 'trash', label: t('settings.deleteAll'), tone: 'danger', onClick: onReset }),
    ]),
    h('p', { class: 'prof-note' }, usage),
    fileInput);
}

/* ---------- Über ---------- */

/** Rundgang ganz oder kapitelweise; startet erst nach dem Schließen des Sheets. */
function openTourList(): void {
  let chosen: { chapter?: string } | null = null;
  const pick = (choice: { chapter?: string }): void => { chosen = choice; sheet.close(); };
  const sheet = openSheet({
    title: t('tour.replay'),
    children: [
      list([row({ icon: 'play', label: t('tour.replayAll'), sub: t('tour.replaySub'), onClick: () => pick({}), chevron: true })]),
      h('h3', { class: 'prof-subhead' }, t('tour.replayChapters')),
      list(REPLAY_CHAPTERS.map((c) => row({ label: t(c.title), onClick: () => pick({ chapter: c.id }), chevron: true }))),
    ],
    onClose: () => {
      const choice = chosen;
      if (choice) void import('../features/tour.ts').then((m) => { m.startTour('intro', choice); });
    },
  });
}

function aboutGroup(): HTMLElement {
  const profile = getProfile();
  const news = row({
    icon: 'info', label: t('settings.news'), value: BUILD_INFO.version, chevron: true, onClick: () => openChangelog(),
  });
  const intro = row({
    icon: 'bulb', label: t('tour.replay'), sub: t('tour.replaySub'), chevron: true, onClick: openTourList,
    attrs: { 'aria-haspopup': 'dialog' },
  });
  // „Version 1.10.0“; das Wort entfällt unter 360 px (profile.css)
  const ver = news.querySelector('.row-value');
  ver?.classList.add('num');
  ver?.prepend(h('span', { class: 'prof-ver-word' }, `${t('settings.version')} `));
  const source = row({ icon: 'link', label: t('settings.sourceCode'), value: 'GitHub', href: SOURCE_URL, target: '_blank' });
  // Öffentliche Seiten (scripts/pages.ts); absolut, damit die iOS-App sie im In-App-Browser öffnet
  const help = row({ icon: 'chat', label: t('settings.help'), href: `${publicUrl()}hilfe`, target: '_blank' });
  // v9 F: Feedback-Mail mit App-Version, Build, Plattform, Sprache und Gerätetyp – keine Trainings- oder Kontodaten
  const mail = (kind: FeedbackKind): void => {
    openMailto(feedbackMailto(kind, {
      version: BUILD_INFO.version, build: BUILD_INFO.build, platform: isNative() ? 'iOS' : 'Web',
      lang: getLang(), device: deviceKind(window.innerWidth),
    }));
  };
  const feedback = row({ icon: 'chat', label: t('settings.feedbackSend'), chevron: true, onClick: () => mail('feedback') });
  const bug = row({ icon: 'info', label: t('settings.reportBug'), chevron: true, onClick: () => mail('bug') });
  const privacy = row({ icon: 'key', label: t('settings.privacy'), href: `${publicUrl()}datenschutz`, target: '_blank' });
  // App bewerten (App Store) bzw. auf der Website der Weg zur iOS-App
  const store = isNative()
    ? row({ icon: 'sparkles', label: t('settings.rateApp'), chevron: true, onClick: () => { void openStorePage(true); } })
    : row({ icon: 'download', label: t('settings.iosApp'), value: 'App Store', href: APP_STORE_URL, target: '_blank' });
  // Beta-Updates (docs/PLAN-live-updates.md): nur in TestFlight-Installationen, erst sichtbar, wenn die App es bestätigt
  const beta = switchRow({
    label: t('settings.betaUpdates'), help: t('settings.betaUpdatesHelp'), checked: false,
    onChange: (on) => { setLiveUpdateBeta(on); toast(t('settings.betaUpdatesNext')); },
  });
  beta.el.hidden = true;
  void liveUpdateBeta().then((on) => {
    if (on === null) return;
    beta.set(on);
    beta.el.hidden = false;
  });
  const meta = (label: string, value: string, title?: string): HTMLElement =>
    h('div', null, h('dt', null, label), h('dd', { class: 'num', title }, value));
  return profGroup(
    list([help, feedback, bug, intro, news, store, beta.el, privacy, source]),
    h('dl', { class: 'prof-meta' },
      meta(t('settings.build'), [BUILD_INFO.build, fmtIsoDate(BUILD_INFO.date), BUILD_INFO.channel === 'preview' ? t('settings.channelPreview') : '']
        .filter(Boolean).join(' · ')),
      meta(t('settings.deviceId'), short(profile.deviceId), profile.deviceId),
      meta(t('settings.profileId'), short(profile.id), profile.id)));
}

/* ---------- Konto (Passkey) ---------- */

/** Rückmeldung im Konto-Sheet: Toasts lägen unter dem modalen Dialog. */
interface SheetCtx {
  say(text: string, tone: 'good' | 'bad'): void;
  addCleanup(fn: () => void): void;
}

/** Führt eine Konto-Aktion aus; Button zeigt Busy-Zustand, Fehler (außer Abbruch) gehen an `onError`. */
async function runBusy(btn: HTMLButtonElement, fn: () => Promise<void>, onError: (text: string) => void): Promise<boolean> {
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await fn();
    return true;
  } catch (e) {
    const code = acct.errorCode(e);
    if (code !== 'cancelled') onError(t(`account.err.${code}`));
    return false;
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

/** Avatar-Kreis: Initiale bzw. Personen-Icon. */
const avatar = (content: Child): HTMLElement => h('span', { class: 'prof-avatar', 'aria-hidden': 'true' }, content);

/** „🔑 Mit Passkey angemeldet“ */
const passkeySub = (): HTMLElement => h('span', { class: 'prof-acct-sub' }, icon('key', 14), t('account.signedInWith'));

/** Inline-Formular zum Umbenennen (Anzeigename oder Passkey). Esc bricht ab, statt das Sheet zu schließen. */
function inlineEdit(o: {
  initial: string; label: string; validate: (v: string) => string | null;
  onSave: (v: string, btn: HTMLButtonElement) => void; onCancel: () => void;
}): HTMLFormElement {
  const input: HTMLInputElement = h('input', {
    class: 'prof-input', type: 'text', value: o.initial, maxlength: NAME_MAX, 'aria-label': o.label, autocomplete: 'off',
  });
  const err = h('p', { class: 'prof-err', role: 'alert' });
  const saveBtn = button({ label: t('account.save'), kind: 'soft', type: 'submit' });
  const form: HTMLFormElement = h('form', { class: 'prof-edit', novalidate: true },
    input, err, h('div', { class: 'prof-edit-actions' }, button({ label: t('account.cancel'), kind: 'quiet', onClick: o.onCancel }), saveBtn));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = input.value.trim();
    const bad = o.validate(v);
    err.textContent = bad ?? '';
    input.setAttribute('aria-invalid', String(bad !== null));
    if (bad) { input.focus(); return; }
    o.onSave(v, saveBtn);
  });
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    o.onCancel();
  });
  setTimeout(() => { input.focus(); input.select(); }, 0);
  return form;
}

/** Bestätigung an Ort und Stelle (confirmDialog läge unter dem modalen Sheet). */
function confirmStrip(text: string, confirmLabel: string, onConfirm: (btn: HTMLButtonElement) => void, onCancel: () => void): HTMLElement {
  const cancel = button({ label: t('account.cancel'), kind: 'quiet', onClick: onCancel });
  const ok = button({ label: confirmLabel, tone: 'danger', onClick: () => onConfirm(ok) });
  const textId = nextId('confirm');
  setTimeout(() => cancel.focus(), 0);
  return h('div', { class: 'prof-confirm', role: 'group', 'aria-labelledby': textId },
    h('p', { class: 'prof-confirm-text', id: textId }, text),
    h('div', { class: 'prof-confirm-actions' }, cancel, ok));
}

/** Abmelden an Ort und Stelle: Schalter „Daten von diesem Gerät entfernen“ (A5); aus = Verhalten wie bisher. */
function logoutStrip(onConfirm: (forget: boolean, btn: HTMLButtonElement) => void, onCancel: () => void): HTMLElement {
  let forget = false;
  const cancel = button({ label: t('account.cancel'), kind: 'quiet', onClick: onCancel });
  const ok = button({ label: t('account.logout'), onClick: () => onConfirm(forget, ok) });
  const sw = switchRow({
    label: t('account.forgetDevice'), help: t('account.forgetDeviceHelp'), checked: false,
    onChange: (v) => {
      forget = v;
      ok.classList.toggle('danger', v);
      strip.classList.toggle('is-neutral', !v); // rot erst, wenn Daten entfernt werden
      setButtonLabel(ok, t(v ? 'account.logoutForget' : 'account.logout'));
    },
  });
  const textId = nextId('confirm');
  setTimeout(() => cancel.focus(), 0);
  const strip = h('div', { class: 'prof-confirm is-neutral', role: 'group', 'aria-labelledby': textId },
    h('p', { class: 'prof-confirm-text', id: textId }, t('account.logoutConfirm')),
    sw.el,
    h('div', { class: 'prof-confirm-actions' }, cancel, ok));
  return strip;
}

const subhead = (text: string): HTMLElement => h('h3', { class: 'prof-subhead' }, text);

/** Zeigt einen neuen Wiederherstellungscode einmalig an: Kopieren + Bestätigen (Top-Layer, auch über dem Sheet). */
function showRecoveryCode(code: string, replaced = false): void {
  const copy = (): void => {
    void navigator.clipboard?.writeText(code).then(
      () => toast(t('account.recovery.copied'), { kind: 'success' }),
      () => { /* Zwischenablage gesperrt: der Code lässt sich markieren */ });
  };
  openModal({
    title: t('account.recovery.modalTitle'),
    body: h('div', { class: 'prof-recovery' },
      replaced ? h('p', { class: 'prof-sheet-text' }, t('account.recovery.modalUsed')) : null,
      h('code', { class: 'prof-code' }, code),
      h('p', { class: 'prof-sheet-text' }, t('account.recovery.modalText'))),
    actions: [
      { label: t('account.recovery.copy'), onClick: copy, closes: false },
      { label: t('account.recovery.done'), primary: true },
    ],
  });
}

/** „Passkey verloren?“: mit dem Wiederherstellungscode einen neuen Passkey anlegen (Format prüft der Client genauer). */
function recoverForm(busy: (btn: HTMLButtonElement, fn: () => Promise<void>) => Promise<void>, submit: HTMLButtonElement): HTMLElement {
  const inputId = nextId('recovery');
  const input: HTMLInputElement = h('input', {
    class: 'prof-input', id: inputId, type: 'text', maxlength: 40, placeholder: t('account.recovery.placeholder'),
    autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', enterkeyhint: 'go',
  });
  const err = h('p', { class: 'prof-err', role: 'alert' });
  const form: HTMLFormElement = h('form', { class: 'prof-form', novalidate: true },
    h('p', { class: 'prof-sheet-text' }, t('account.recovery.lostIntro')),
    h('label', { class: 'prof-field', for: inputId }, t('account.recovery.inputLabel')), input, err, submit);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const bad = input.value.replace(/[\s-]/g, '').length !== 20;
    err.textContent = bad ? t('account.recovery.invalidFormat') : '';
    input.setAttribute('aria-invalid', String(bad));
    if (bad) { input.focus(); return; }
    // Erfolg → angemeldet, das Sheet schließt sich; der neue Code erscheint danach im Dialog
    void busy(submit, async () => {
      const code = await acct.recover(input.value);
      toast(t('account.recovery.recovered'), { kind: 'success' });
      if (code) showRecoveryCode(code, true);
    });
  });
  return h('details', { class: 'prof-lost' }, h('summary', null, t('account.recovery.lost')), form);
}

/** Sheet-Inhalt abgemeldet: Konto erstellen oder mit Passkey anmelden (bisherige Logik). */
function signedOutContent(ctx: SheetCtx): Child[] {
  const inputId = nextId('name');
  const input: HTMLInputElement = h('input', {
    class: 'prof-input', id: inputId, type: 'text', maxlength: NAME_MAX, placeholder: t('account.namePlaceholder'),
    autocomplete: 'username', enterkeyhint: 'go',
  });
  const err = h('p', { class: 'prof-err', role: 'alert' });
  const create = button({ label: t('account.create'), kind: 'primary', full: true, cta: false, type: 'submit' });
  const login = button({ label: t('account.login'), icon: 'key', full: true });
  const recover = button({ label: t('account.recovery.submit'), full: true, type: 'submit' });
  const both = [create, login, recover];
  const busy = async (btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> => {
    for (const b of both) b.disabled = true;
    await runBusy(btn, fn, (m) => ctx.say(m, 'bad'));
    for (const b of both) b.disabled = false;
  };
  const form: HTMLFormElement = h('form', { class: 'prof-form', novalidate: true },
    h('label', { class: 'prof-field', for: inputId }, t('account.nameLabel')), input, err, create);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = input.value.trim();
    const bad = v.length < NAME_MIN || v.length > NAME_MAX;
    err.textContent = bad ? t('account.nameInvalid') : '';
    input.setAttribute('aria-invalid', String(bad));
    if (bad) { input.focus(); return; }
    // Erfolg → Kontozustand wechselt, das Sheet schließt sich; der Toast erscheint danach auf der Seite
    void busy(create, async () => {
      const code = await acct.register(v);
      toast(t('account.registered'), { kind: 'success', durationMs: 6000 });
      if (code) showRecoveryCode(code);
      else toast(t('account.recovery.missing'), { kind: 'error', durationMs: 8000 });
    });
  });
  login.addEventListener('click', () => {
    void busy(login, async () => { await acct.login(); toast(t('account.loggedIn'), { kind: 'success' }); });
  });

  const controls = h('div', { class: 'prof-signin' }, form, h('p', { class: 'prof-or' }, h('span', null, t('account.or'))), login,
    recoverForm(busy, recover));
  void acct.support().then((info) => {
    if (!info.webauthn && controls.isConnected) controls.replaceWith(h('p', { class: 'prof-sheet-text' }, t('account.unsupported')));
  }).catch(() => { /* Button-Aktionen melden Fehler selbst */ });
  return [h('p', { class: 'prof-sheet-text' }, t('account.intro')), controls];
}

/** Sheet-Inhalt angemeldet: Name, Sync, Passkeys, Abmelden, Konto löschen (bisherige Logik, neu dargestellt). */
function signedInContent(ctx: SheetCtx, username: string): { nodes: Child[]; onUser(name: string): void } {
  let name = username;
  let editingName = false;
  let editingId: string | null = null;
  let confirmId: string | null = null;
  let passkeys: PasskeyInfo[] | null = null;
  let recovery: RecoveryStatus | null = null;
  const onError = (m: string): void => ctx.say(m, 'bad');

  // Name
  const head = list([]);
  function drawHead(): void {
    if (editingName) {
      head.replaceChildren(h('div', { class: 'prof-pad' }, inlineEdit({
        initial: name, label: t('account.nameLabel'),
        validate: (v) => (v.length < NAME_MIN || v.length > NAME_MAX ? t('account.nameInvalid') : null),
        onSave: (v, btn) => {
          void runBusy(btn, async () => {
            await acct.renameUser(v);
            name = v;
            editingName = false;
            drawHead();
            // Fokus auf „Ändern“ – sonst fällt er mit dem entfernten Formular aus dem Sheet
            head.querySelector<HTMLElement>('button')?.focus();
            ctx.say(t('account.renamed'), 'good');
          }, onError);
        },
        onCancel: () => { editingName = false; drawHead(); head.querySelector<HTMLElement>('button')?.focus(); },
      })));
      return;
    }
    const change = button({ label: t('account.change'), kind: 'link', onClick: () => { editingName = true; drawHead(); } });
    change.setAttribute('aria-label', `${t('account.change')}: ${t('account.nameLabel')}`);
    head.replaceChildren(h('div', { class: 'prof-acct' },
      avatar(initial(name)),
      h('span', { class: 'prof-acct-text' }, h('span', { class: 'prof-acct-name' }, name), passkeySub()),
      change));
  }

  // Sync
  const syncText = h('p', { class: 'prof-sync-text', role: 'status' });
  const drawSync = (): void => {
    syncText.textContent = syncStatusEntries(getSyncStatus()).map((e) => t(e.key, e.params)).join(' · ');
  };
  ctx.addCleanup(onSyncStatus(drawSync));
  const syncBtn = button({ label: t('account.sync.syncNow'), icon: 'sync', full: true });
  syncBtn.addEventListener('click', () => {
    void runBusy(syncBtn, async () => {
      const res = await syncNow();
      if (res.phase === 'idle') ctx.say(t('account.sync.syncDone'), 'good');
      else ctx.say(t(syncStatusEntries(res)[0]?.key ?? 'account.sync.failed'), 'bad');
    }, onError);
  });

  // Passkeys
  const pkList = h('div', { class: 'list', role: 'list', 'aria-label': t('account.passkeys') });
  const reload = async (): Promise<void> => {
    const [pk, rs] = await Promise.allSettled([acct.listPasskeys(), acct.recoveryStatus()]);
    if (pk.status === 'fulfilled') passkeys = pk.value;
    else { onError(t(`account.err.${acct.errorCode(pk.reason)}`)); passkeys = passkeys ?? []; }
    // Status unbekannt (z. B. Migration fehlt): wie „kein Code“ behandeln, Erstellen meldet dann den Fehler
    recovery = rs.status === 'fulfilled' ? rs.value : recovery ?? { exists: false, createdAt: null };
    drawPasskeys();
    drawRecovery(false);
  };
  const focusPk = (id: string): void => { pkList.querySelector<HTMLElement>(`[data-pk="${CSS.escape(id)}"] button:not(:disabled)`)?.focus(); };

  function passkeyItem(p: PasskeyInfo, last: boolean): HTMLElement {
    const label = p.name ?? t('account.passkeyFallback', { date: acctDate(p.createdAt) });
    const item = (...kids: Child[]): HTMLElement => h('div', { class: 'prof-pk', role: 'listitem', 'data-pk': p.id }, ...kids);
    if (editingId === p.id) {
      return item(h('div', { class: 'prof-pk-wide' }, inlineEdit({
        initial: p.name ?? '', label: t('account.renameAria'),
        validate: (v) => (v.length < 1 || v.length > NAME_MAX ? t('account.nameInvalid') : null),
        onSave: (v, btn) => {
          void runBusy(btn, async () => { await acct.renamePasskey(p.id, v); editingId = null; await reload(); focusPk(p.id); }, onError);
        },
        onCancel: () => { editingId = null; drawPasskeys(); focusPk(p.id); },
      })));
    }
    if (confirmId === p.id) {
      return item(h('div', { class: 'prof-pk-wide' }, confirmStrip(t('account.deletePasskeyConfirm'), t('account.delete'),
        (btn) => {
          void runBusy(btn, async () => {
            await acct.deletePasskey(p.id);
            confirmId = null;
            ctx.say(t('account.passkeyDeleted'), 'good');
            await reload();
            pkList.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
          }, onError);
        },
        () => { confirmId = null; drawPasskeys(); focusPk(p.id); })));
    }
    const rename = button({ label: t('account.rename'), kind: 'link', onClick: () => { editingId = p.id; confirmId = null; drawPasskeys(); } });
    rename.setAttribute('aria-label', `${t('account.renameAria')}: ${label}`);
    const del = button({
      label: t('account.delete'), kind: 'link', tone: 'danger',
      onClick: () => { confirmId = p.id; editingId = null; drawPasskeys(); },
    });
    del.setAttribute('aria-label', `${t('account.deleteAria')}: ${label}`);
    if (last) { del.disabled = true; del.title = t('account.lastPasskeyHint'); }
    const meta = [t('account.created', { date: acctDate(p.createdAt) }),
      p.lastUsedAt ? t('account.lastUsed', { date: acctDate(p.lastUsedAt) }) : null].filter(Boolean).join(' · ');
    return item(
      h('span', { class: 'prof-pk-icon' }, icon('key', 22)),
      h('div', { class: 'prof-pk-text' },
        h('p', { class: 'prof-pk-name' }, h('span', null, label), p.backedUp ? h('span', { class: 'prof-badge' }, t('account.synced')) : null),
        h('p', { class: 'prof-pk-sub' }, meta),
        last ? h('p', { class: 'prof-pk-sub' }, t('account.lastPasskeyHint')) : null),
      h('div', { class: 'prof-pk-actions' }, rename, del));
  }

  function drawPasskeys(): void {
    if (!passkeys) {
      pkList.replaceChildren(h('p', { class: 'prof-pad prof-sheet-text', role: 'listitem' }, t('account.loading')));
      return;
    }
    const pks = passkeys;
    pkList.replaceChildren(...pks.map((p) => passkeyItem(p, pks.length <= 1)));
  }

  const add = button({ label: t('account.addPasskey'), icon: 'key', full: true });
  add.addEventListener('click', () => {
    void runBusy(add, async () => { await acct.addPasskey(); ctx.say(t('account.passkeyAdded'), 'good'); await reload(); }, onError);
  });

  // Wiederherstellungscode: Status, Erstellen bzw. Erneuern (Erneuern macht den alten Code ungültig → Bestätigung)
  const recBox = h('div', { class: 'prof-recovery' });
  function drawRecovery(confirming: boolean): void {
    const status = recovery === null ? t('account.loading')
      : recovery.exists && recovery.createdAt ? t('account.recovery.statusSet', { date: acctDate(recovery.createdAt) })
        : t('account.recovery.statusNone');
    const create = (btn: HTMLButtonElement): void => {
      void runBusy(btn, async () => { showRecoveryCode(await acct.createRecoveryCode()); await reload(); }, onError);
    };
    let action: HTMLElement;
    if (confirming) {
      action = confirmStrip(t('account.recovery.renewConfirm'), t('account.recovery.renew'), create,
        () => { drawRecovery(false); recBox.querySelector<HTMLElement>('button')?.focus(); });
    } else {
      const btn = button({ label: t(recovery?.exists ? 'account.recovery.renew' : 'account.recovery.create'), icon: 'key', full: true });
      btn.disabled = recovery === null;
      btn.addEventListener('click', () => { if (recovery?.exists) drawRecovery(true); else create(btn); });
      action = btn;
    }
    recBox.replaceChildren(
      h('p', { class: recovery && !recovery.exists ? 'prof-sheet-text prof-warn' : 'prof-sheet-text' }, status),
      h('p', { class: 'prof-sheet-text' }, t('account.recovery.hint')),
      action);
  }

  // Abmelden (optional mit Entfernen der lokalen Daten, A5) / Konto löschen
  // (Erfolg → Kontozustand wechselt, das Sheet schließt sich)
  const footer = h('div', { class: 'prof-sheet-actions' });
  const signOut = async (forget: boolean): Promise<void> => {
    if (!forget) { await acct.logout(); toast(t('account.loggedOut'), { kind: 'info' }); return; }
    // Bleibt nach dem Sync etwas offen: zweite, deutliche Nachfrage (Dialog liegt im Top-Layer über dem Sheet)
    const done = await logoutAndForgetDevice({
      confirmLoss: (n) => confirmDialog(t('account.forgetLossText', { n }), {
        title: t('account.forgetLossTitle'), confirmLabel: t('account.forgetLossConfirm'), danger: true,
      }),
    });
    if (done) toast(t('account.loggedOutForgot'), { kind: 'info' });
  };
  function drawFooter(mode: 'idle' | 'logout' | 'delete'): void {
    if (mode === 'delete') {
      footer.replaceChildren(confirmStrip(t('account.deleteAccountConfirm'), t('account.deleteAccount'),
        (btn) => { void runBusy(btn, async () => { await acct.deleteAccount(); toast(t('account.accountDeleted'), { kind: 'info' }); }, onError); },
        () => { drawFooter('idle'); footer.querySelector<HTMLElement>('.danger')?.focus(); }));
      return;
    }
    if (mode === 'logout') {
      footer.replaceChildren(logoutStrip(
        (forget, btn) => { void runBusy(btn, () => signOut(forget), onError); },
        () => { drawFooter('idle'); footer.querySelector<HTMLElement>('button')?.focus(); }));
      return;
    }
    const out = button({ label: t('account.logout'), full: true, onClick: () => drawFooter('logout') });
    const del = button({ label: t('account.deleteAccount'), kind: 'quiet', icon: 'trash', full: true, tone: 'danger', onClick: () => drawFooter('delete') });
    footer.replaceChildren(out, del);
  }

  drawHead();
  drawSync();
  drawPasskeys();
  drawRecovery(false);
  drawFooter('idle');
  void reload();

  return {
    nodes: [
      head,
      subhead(t('account.syncTitle')), h('div', { class: 'list' }, h('div', { class: 'prof-sync-line' }, h('span', { class: 'prof-pk-icon' }, icon('sync', 22)), syncText)), syncBtn,
      subhead(t('account.passkeys')), pkList, h('p', { class: 'prof-sheet-text' }, t('account.addPasskeyHint')), add,
      subhead(t('account.recovery.title')), recBox,
      footer,
    ],
    onUser: (next) => {
      if (next === name && !editingName) return;
      name = next;
      editingName = false;
      drawHead();
    },
  };
}

/** Modales Konto-Sheet; schließt sich, sobald sich der Anmeldezustand ändert (an-/abgemeldet, gelöscht). */
function openAccountSheet(): void {
  const st = acct.getAccountState();
  if (st.status !== 'signed-in' && st.status !== 'signed-out') return;
  const mode = st.status;
  const cleanups: Array<() => void> = [];
  const msg = h('p', { class: 'prof-msg', role: 'status', hidden: true });
  const ctx: SheetCtx = {
    say: (text, tone) => {
      msg.textContent = text;
      msg.className = `prof-msg is-${tone}`;
      msg.hidden = false;
    },
    addCleanup: (fn) => { cleanups.push(fn); },
  };
  let onUser: ((name: string) => void) | null = null;
  let nodes: Child[];
  if (st.status === 'signed-in') {
    const c = signedInContent(ctx, st.user.username);
    nodes = c.nodes;
    onUser = c.onUser;
  } else {
    nodes = signedOutContent(ctx);
  }
  let sheet: SheetHandle | null = null;
  ctx.addCleanup(acct.onAccountChange((s) => {
    if (s.status !== mode) { sheet?.close(); return; }
    if (s.status === 'signed-in') onUser?.(s.user.username);
  }));
  sheet = openSheet({
    title: t('account.title'),
    children: [msg, ...nodes],
    onClose: () => { for (const fn of cleanups.splice(0)) fn(); },
  });
}

/** Konto-Sheet von außerhalb (Einführung): erst zum Profil, dann öffnen – ein Routenwechsel schlösse das Sheet sofort. */
export function openAccountOnProfile(): void {
  if (location.hash.startsWith(TAB_HREF.profile)) { openAccountSheet(); return; }
  // Nach dem Zeichnen des Profils (inkl. Tab-Überblendung, --dur-state)
  window.addEventListener('hashchange', () => { setTimeout(openAccountSheet, ROUTE_SETTLE_MS); }, { once: true });
  location.hash = TAB_HREF.profile;
}

/** Zeile „Geräte-Sync“ mit Status; „bald verfügbar“ nur ohne Konto-Funktion. */
function syncRow(): HTMLElement {
  const st = acct.getAccountState();
  const label = t('account.syncTitle');
  let el: HTMLElement;
  if (!acct.accountEnabled() || st.status === 'disabled') el = row({ icon: 'sync', label, value: t('account.syncSoon') });
  else if (st.status === 'loading') el = row({ icon: 'sync', label });
  else if (st.status === 'offline') el = row({ icon: 'sync', label, sub: t('account.sync.offline') });
  else if (st.status === 'signed-out') el = row({ icon: 'sync', label, value: t('account.syncSignedOut') });
  else el = row({ icon: 'sync', label, sub: syncStatusEntries(getSyncStatus()).map((e) => t(e.key, e.params)).join(' · ') });
  el.classList.add('prof-sync');
  return el;
}

/** Kopfzeile der Konto-Karte je Zustand; null ohne Konto-Funktion. */
function accountHead(st: acct.AccountState): HTMLElement | null {
  if (st.status === 'disabled') return null;
  const chevron = h('span', { class: 'row-chevron' }, icon('chevron-right', 18));
  if (st.status === 'loading') {
    return h('div', { class: 'prof-acct' }, avatar(icon('person', 22)),
      h('span', { class: 'prof-acct-text' }, h('span', { class: 'prof-acct-sub' }, t('account.loading'))));
  }
  // Offline-Kaltstart (A1): Hinweis statt Anmelden – die Sitzung kommt automatisch zurück
  if (st.status === 'offline') {
    return h('div', { class: 'prof-acct', role: 'status' }, avatar(icon('person', 22)),
      h('span', { class: 'prof-acct-text' },
        h('span', { class: 'prof-acct-name' }, t('account.offlineTitle')),
        h('span', { class: 'prof-acct-sub' }, t('account.offlineHint'))));
  }
  const text = st.status === 'signed-in'
    ? h('span', { class: 'prof-acct-text' }, h('span', { class: 'prof-acct-name' }, st.user.username), passkeySub())
    : h('span', { class: 'prof-acct-text' },
      h('span', { class: 'prof-acct-name' }, t('account.signInRow')),
      h('span', { class: 'prof-acct-sub' }, t('account.signInSub')));
  return h('button', { type: 'button', class: 'prof-acct press', 'aria-haspopup': 'dialog', onclick: () => openAccountSheet() },
    avatar(st.status === 'signed-in' ? initial(st.user.username) : icon('person', 22)), text, chevron);
}

/** Konto-Karte: Konto-Zeile (→ Sheet) und Geräte-Sync; folgt Konto- und Sync-Status live. */
function accountCard(): HTMLElement {
  const box = list([]);
  let lastKey = '';
  let sync: HTMLElement | null = null;
  const draw = (): void => {
    const st = acct.getAccountState();
    const key = st.status === 'signed-in' ? `in:${st.user.id}:${st.user.username}` : st.status;
    if (key === lastKey) return;
    lastKey = key;
    sync = syncRow();
    box.replaceChildren(...[accountHead(st), sync].filter((x): x is HTMLElement => x !== null));
  };
  draw();
  addCleanup(acct.onAccountChange(draw));
  addCleanup(onSyncStatus(() => { if (sync) sync = swap(sync, syncRow()); }));
  return h('section', { 'aria-label': t('account.title') }, box);
}

/* ---------- Bereiche und Seite ---------- */

const DIFF_LABEL = { auto: 'settings.diffAuto', 1: 'settings.diffEasy', 2: 'settings.diffMedium', 3: 'settings.diffHard' } as const;
const TIMER_LABEL = { calm: 'settings.timerCalm', precise: 'settings.timerPrecise', off: 'settings.timerOff' } as const;
const KEYPAD_LABEL = { auto: 'settings.keypadAuto', on: 'settings.keypadOn', off: 'settings.keypadOff' } as const;
const LAYOUT_LABEL = { calculator: 'settings.numpadCalculator', phone: 'settings.numpadPhone' } as const;
const LANG_LABEL = { auto: 'settings.langAuto', de: 'settings.langDe', en: 'settings.langEn' } as const;

interface Section {
  id: string;
  icon: IconName;
  title: `settings.${string}`;
  intro: `settings.${string}`;
  /** Aktueller Stand in einer Zeile (Menü) */
  summary(s: Settings): string;
  /** `live`: unsichtbare Statusmeldung der Seite */
  body(s: Settings, live: HTMLElement): Child[];
}

/** Reihenfolge nach Häufigkeit; die Adressen `#/profil/:id` nutzen auch die alten `?tab=`-Links (router.ts). */
const SECTIONS: readonly Section[] = [
  {
    id: 'training', icon: 'target', title: 'settings.training', intro: 'settings.introTraining',
    summary: (s) => [t(DIFF_LABEL[s.difficulty]), t(s.dailyGoalRounds === 1 ? 'settings.roundsNOne' : 'settings.roundsN', { n: s.dailyGoalRounds }), t('settings.summaryTasks', { n: s.sessionLength })].join(' · '),
    body: (s) => [trainingGroup(s)],
  },
  {
    id: 'runde', icon: 'play', title: 'settings.inRound', intro: 'settings.introRound',
    summary: (s) => [t('settings.timerDisplay'), t(TIMER_LABEL[s.timerDisplay])].join(': '),
    body: (s) => [roundGroup(s)],
  },
  {
    id: 'eingabe', icon: 'grid', title: 'settings.input', intro: 'settings.introInput',
    summary: (s) => [t(KEYPAD_LABEL[s.keypad]), t(LAYOUT_LABEL[s.numpadLayout])].join(' · '),
    body: (s) => [inputGroup(s)],
  },
  {
    id: 'erinnerungen', icon: 'bell', title: 'settings.reminders', intro: 'settings.introReminders',
    summary: () => t(isPushEnabled() ? 'settings.summaryOn' : 'settings.summaryOff'),
    body: () => [remindersGroup()],
  },
  {
    id: 'darstellung', icon: 'sun', title: 'settings.appearanceFeedback', intro: 'settings.introAppearance',
    summary: (s) => [themeLabel(s.theme), t(LANG_LABEL[s.lang])].join(' · '),
    body: (s) => [appearanceGroup(s)],
  },
  {
    id: 'daten', icon: 'download', title: 'settings.data', intro: 'settings.introData',
    summary: storedSummary,
    body: (_s, live) => [dataGroup(live)],
  },
  {
    id: 'hilfe', icon: 'info', title: 'settings.aboutHelp', intro: 'settings.introHelp',
    summary: () => `${t('settings.version')} ${BUILD_INFO.version}`,
    body: () => [aboutGroup()],
  },
];

/** Menü der Bereiche; `paint` zieht den Stand nach, wenn nebeneinander im Bereich etwas geändert wird. */
function sectionMenu(s: Settings, active: Section | null): { el: HTMLElement; paint(): void } {
  const rows = SECTIONS.map((sec) => ({
    sec,
    el: row({
      icon: sec.icon, label: t(sec.title), sub: sec.summary(s), href: `#/profil/${sec.id}`,
      attrs: sec === active ? { 'aria-current': 'true' } : undefined,
    }),
  }));
  // Erinnerungen gibt es nur, wenn das Gerät bzw. der Server sie anbietet (Website ohne Push: keine Zeile)
  const reminders = rows.find((r) => r.sec.id === 'erinnerungen')?.el;
  if (reminders) {
    reminders.hidden = true;
    void pushConfig().then((cfg) => { reminders.hidden = !cfg.enabled; });
  }
  return {
    el: h('nav', { 'aria-label': t('settings.title') }, list(rows.map((r) => r.el))),
    paint: () => {
      const now = getSettings();
      for (const { sec, el } of rows) {
        const sub = el.querySelector('.row-sub');
        if (sub) sub.textContent = sec.summary(now);
      }
    },
  };
}

function sectionNodes(sec: Section, s: Settings, live: HTMLElement, back: boolean): Child[] {
  return [
    back ? backLink({ label: t('settings.title'), href: TAB_HREF.profile }) : null,
    h('div', { class: 'prof-head' }, largeTitle(t(sec.title)), h('p', { class: 'prof-intro' }, t(sec.intro))),
    sec.body(s, live),
    live,
  ];
}

/** Hauptseite, Bereich oder ab 1024 px beides nebeneinander. Kein Floating CTA (der Router setzt setPrimaryAction(null)). */
export function renderSettings(sectionId: string | null): void {
  const s = getSettings();
  const live = h('p', { class: 'sr-only', role: 'status' });
  const section = SECTIONS.find((x) => x.id === sectionId) ?? null;

  if (isWide()) {
    const shown = section ?? SECTIONS[0] ?? null;
    if (!shown) return;
    const menu = sectionMenu(s, shown);
    addCleanup(onChange(() => menu.paint()));
    appendChildren(app, [
      h('div', { class: 'split' },
        h('div', { class: 'split-master' }, largeTitle(t('settings.title')), accountCard(), menu.el),
        h('div', { class: 'split-detail' }, sectionNodes(shown, s, live, false))),
    ]);
    return;
  }
  if (section) {
    appendChildren(app, sectionNodes(section, s, live, true));
    return;
  }
  appendChildren(app, [largeTitle(t('settings.title')), accountCard(), sectionMenu(s, null).el]);
}
