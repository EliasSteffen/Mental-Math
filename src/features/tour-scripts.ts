// Inhalte der Rundgänge: Kapitel als Schrittlisten. Texte in i18n/locales/{de,en}/tour.ts, Ablauf in features/tour.ts.
// Ein neuer Update-Rundgang = ein paar Kapitel hier, ein Eintrag in TOURS und `tour` beim Release (src/releases.ts).
import type { Tour, TourChapter, TourId, TourLayout, TourStep, TourText } from '../core/tour.ts';

const go = (hash: string): TourStep => ({ kind: 'go', hash });
const say = (text: TourText, target?: string, ms?: number, only?: TourLayout): TourStep => ({ kind: 'say', text, target, ms, only });
const tap = (target: string, only?: TourLayout): TourStep => ({ kind: 'tap', target, only });
const answer = (wrong = false): TourStep => ({ kind: 'answer', wrong });
const ask = (text: TourText): TourStep => ({ kind: 'ask', text });
const wait = (ms: number): TourStep => ({ kind: 'wait', ms });

const TRAIN = '#/train/retry';
const NEXT = '.sheet .btn.primary';
const BACK = '.back-link';
const sectionRow = (id: string): string => `a[href="#/profil/${id}"]`;
const SECTION_BODY = '.prof-head + .group';

const START: TourChapter = {
  id: 'start', title: 'tour.chStart',
  steps: [go('#/'), say('tour.start', undefined, 3400)],
};

const TODAY: TourChapter = {
  id: 'today', title: 'tour.chToday',
  steps: [
    go('#/'),
    say('tour.todayHero', '.today-hero', 3200),
    say('tour.todayStatus', '.status-line', 2400),
    say('tour.todayTiles', '.today-tiles', 2600),
    say('tour.todayMore', '.today-more', 2800, 'tablet'),
  ],
};

const TASK: TourChapter = {
  id: 'task', title: 'tour.chTask', tasks: ['mult.2x1', 'mult.2x1'],
  steps: [
    go(TRAIN),
    say('tour.taskQuestion', '.train-q', 2400),
    answer(),
    say('tour.taskRight', '.sheet', 2400),
    tap(NEXT),
    ask('tour.taskYou'),
    say('tour.taskDone', '.sheet', 2200),
  ],
};

const MISTAKE: TourChapter = {
  id: 'mistake', title: 'tour.chMistake', tasks: ['mult.square'],
  steps: [
    go(TRAIN),
    say('tour.mistakeIntro', '.train-q', 2200),
    answer(true),
    say('tour.mistakeSheet', '.sheet', 3800),
  ],
};

const LEARN: TourChapter = {
  id: 'learn', title: 'tour.chLearn',
  steps: [
    tap('[data-tab="learn"]'),
    say('tour.learnList', '.learn-groups', 2600, 'narrow'),
    go('#/lernen/mult.2x1'),
    say('tour.learnMethod', '.learn-head', 3000),
    say('tour.learnGuide', '.guide-entry', 3000),
  ],
};

const COMPETE: TourChapter = {
  id: 'compete', title: 'tour.chCompete',
  steps: [
    tap('[data-tab="compete"]'),
    wait(300),
    say('tour.competeDaily', '.compete-hero', 3200),
    say('tour.competeBoard', '.col:first-child > .group', 2800),
    say('tour.competeGroups', '.col:last-child > .group:nth-child(2)', 3000),
  ],
};

/** Profil: auf dem Telefon das Emblem oben rechts, auf dem iPad der Eintrag unten in der Seitenleiste */
const EMBLEM = '.account-button';
const SIDE_PROFILE = '.tabbar-profile';

const ACHIEVEMENTS: TourChapter = {
  id: 'achievements', title: 'tour.chAchievements',
  steps: [
    go('#/'),
    tap('[data-tab="achievements"]'),
    wait(300),
    say('tour.achOverview', '.pcard', 3000),
    say('tour.achQuests', '.ach-quests', 3000),
    say('tour.achShop', 'a[href="#/erfolge/shop"]', 2800),
  ],
};

const STATS: TourChapter = {
  id: 'stats', title: 'tour.chStats',
  steps: [
    go('#/erfolge'),
    say('tour.statsRow', '.ach-stats-row', 2600),
    tap('.ach-stats-row'),
    wait(300),
    say('tour.progressFocus', '.prog-focus', 3200),
    tap('.prog-switch button:nth-child(3)', 'phone'),
    say('tour.progressHistory', '.heatmap', 3000),
  ],
};

const SETTINGS: TourChapter = {
  id: 'settings', title: 'tour.chSettings',
  steps: [
    go('#/'),
    say('tour.settingsEmblem', EMBLEM, 2800, 'phone'),
    say('tour.settingsSide', SIDE_PROFILE, 2800, 'tablet'),
    tap(EMBLEM, 'phone'),
    tap(SIDE_PROFILE, 'tablet'),
    wait(400),
    say('tour.settingsMenu', 'nav .list', 2800),
    tap(sectionRow('training')),
    say('tour.settingsTraining', SECTION_BODY, 2800),
    tap(BACK, 'narrow'),
    tap(sectionRow('runde')),
    say('tour.settingsRound', SECTION_BODY, 2800),
    tap(BACK, 'narrow'),
    tap(sectionRow('eingabe')),
    say('tour.settingsInput', SECTION_BODY, 2600),
    tap(BACK, 'narrow'),
    tap(sectionRow('darstellung')),
    say('tour.settingsLook', '[data-prof="theme"]', 2200),
    tap('[data-prof="theme"] button[aria-pressed="false"]:is(:nth-child(2), :nth-child(3))'),
    say('tour.settingsThemeDone', '[data-prof="theme"]', 2400),
  ],
};

/* ---------- Update 2.0.0 ---------- */

const V2_TABS: TourChapter = {
  id: 'v2-tabs', title: 'tour.chTabs',
  steps: [
    go('#/'),
    say('tour.v2Tabs', '.tabbar', 3000),
    tap('[data-tab="achievements"]'),
    wait(300),
    say('tour.achOverview', '.pcard', 2800),
    say('tour.achQuests', '.ach-quests', 2600),
    say('tour.achShop', 'a[href="#/erfolge/shop"]', 2400),
  ],
};

const V2_SETTINGS: TourChapter = {
  id: 'v2-settings', title: 'tour.chSettings',
  steps: [
    go('#/'),
    say('tour.settingsEmblem', EMBLEM, 2800, 'phone'),
    say('tour.settingsSide', SIDE_PROFILE, 2800, 'tablet'),
    tap(EMBLEM, 'phone'),
    tap(SIDE_PROFILE, 'tablet'),
    wait(400),
    say('tour.v2Menus', 'nav .list', 3000),
  ],
};

const V2_IPAD: TourChapter = {
  id: 'v2-ipad', title: 'tour.chIpad',
  steps: [
    say('tour.v2Sidebar', '.tabbar', 2800, 'tablet'),
    go('#/profil/eingabe'),
    say('tour.v2Keypad', '[data-prof="keypad-side"]', 3200, 'tablet'),
  ],
};

/* ---------- App-Store-Video: Vorgabe 15–30 Sekunden ---------- */

const STORE: TourChapter = {
  id: 'store', title: 'tour.chStart', tasks: ['mult.2x1', 'mult.square'],
  steps: [
    go('#/'),
    say('tour.store1', '.today-hero', 2800),
    go(TRAIN),
    say('tour.store2', '.train-q', 1800),
    answer(),
    wait(900),
    tap(NEXT),
    answer(true),
    say('tour.store3', '.sheet', 2800),
    go('#/lernen/mult.2x1'),
    say('tour.store4', '.learn-head', 2800),
    go('#/wettbewerbe'),
    wait(500),
    say('tour.store5', '.compete-hero', 2800),
    go('#/erfolge'),
    wait(300),
    say('tour.store6', '.pcard', 2600),
    go('#/'),
    say('tour.store7', undefined, 2000),
  ],
};

export const TOURS: Readonly<Record<TourId, Tour>> = {
  intro: { id: 'intro', chapters: [START, TODAY, TASK, MISTAKE, LEARN, COMPETE, ACHIEVEMENTS, STATS, SETTINGS] },
  v2: { id: 'v2', chapters: [V2_TABS, V2_SETTINGS, V2_IPAD] },
  store: { id: 'store', chapters: [STORE] },
};

/** Einzeln abspielbar (Profil → Hilfe & Info) */
export const REPLAY_CHAPTERS: readonly TourChapter[] = [TODAY, TASK, MISTAKE, LEARN, COMPETE, ACHIEVEMENTS, STATS, SETTINGS];
