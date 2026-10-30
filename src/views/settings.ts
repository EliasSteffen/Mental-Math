import type { CategoryId, Settings, ThemeSetting } from '../types.ts';
import { getSettings, setSettings, resetAll, exportJSON, getAttempts, getSessions, getProfile } from '../data/storage.ts';
import { importJSON } from '../data/transfer.ts';
import { applyTheme } from '../ui/theme.ts';
import { toast } from '../ui/toast.ts';
import { confirmDialog } from '../ui/modal.ts';
import { openChangelog, fmtIsoDate } from '../features/whats-new.ts';
import { BUILD_INFO } from '../generated/build-info.ts';
import { detectLang, setLang, t } from '../i18n/index.ts';
import { icon } from '../ui/charts.ts';
import { CATEGORIES } from '../core/catalog.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { rerender } from '../router.ts';

type TabId = 'general' | 'gameplay' | 'data' | 'about';
const TABS: ReadonlyArray<readonly [TabId, 'settings.tabGeneral' | 'settings.tabGameplay' | 'settings.tabData' | 'settings.tabAbout', string]> = [
  ['general', 'settings.tabGeneral', 'gear'], ['gameplay', 'settings.tabGameplay', 'target'],
  ['data', 'settings.tabData', 'chart'], ['about', 'settings.tabAbout', 'sparkles'],
];

function currentTab(): TabId {
  const q = location.hash.split('?')[1] ?? '';
  const v = new URLSearchParams(q).get('tab');
  return TABS.find(([id]) => id === v)?.[0] ?? 'general';
}

let lastSavedToast = 0;
/** Speichert Einstellungen; Hinweis-Toast höchstens alle 1,5 s. */
function update(partial: Partial<Settings>): void {
  setSettings(partial);
  const now = Date.now();
  if (now - lastSavedToast >= 1500) {
    lastSavedToast = now;
    toast(t('settings.saved'), { kind: 'success' });
  }
}

function segmented<V extends string | number>(
  label: string,
  options: ReadonlyArray<readonly [V, string]>,
  current: V,
  onPick: (value: V) => void,
): HTMLDivElement {
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    const active = value === current;
    seg.append(h('button', {
      type: 'button', class: active ? 'active' : null, 'aria-pressed': String(active),
      onclick: () => { onPick(value); rerender(); },
    }, text));
  }
  return seg;
}

type BooleanSettingKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function toggle(label: string, key: BooleanSettingKey, settings: Settings, after?: () => void): HTMLLabelElement {
  const input: HTMLInputElement = h('input', {
    type: 'checkbox', 'aria-label': label, checked: settings[key] ? true : null,
    onchange: () => { update({ [key]: input.checked }); if (after) after(); },
  });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }));
}

function autoFailToggle(s: Settings): HTMLLabelElement {
  const input: HTMLInputElement = h('input', {
    type: 'checkbox', 'aria-label': t('settings.autoFail'), checked: s.autoFail && s.timer ? true : null,
    disabled: s.timer ? null : true,
    onchange: () => update({ autoFail: input.checked }),
  });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }));
}

function row(label: string, control: Node, sub?: string): HTMLDivElement {
  const inline = control instanceof HTMLElement && (control.classList.contains('switch') || control.tagName === 'BUTTON' || control.tagName === 'A');
  return h('div', { class: `setting-row${inline ? ' inline' : ''}` },
    h('div', null, label, sub ? h('div', { class: 'small muted' }, sub) : null),
    control);
}

function section(title: string, ...children: Array<Node | null>): HTMLElement {
  return h('section', { class: 'settings-section' }, h('h2', { class: 'section-title' }, title), ...children);
}

function download(): void {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'mental-math-export.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ungefähre Größe aller `mm:v3:*`-Schlüssel in KB (UTF-16 → 2 Byte je Zeichen). */
function storageKB(): number {
  let chars = 0;
  try {
    const ls = globalThis.localStorage;
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k && k.startsWith('mm:v3:')) chars += k.length + (ls.getItem(k)?.length ?? 0);
    }
  } catch {
    /* Speicher nicht verfügbar */
  }
  return Math.round((chars * 2) / 102.4) / 10;
}

const short = (id: string): string => (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

// ---------- Tab: Allgemein ----------
function generalTab(s: Settings): HTMLElement[] {
  const swatches = h('div', { class: 'theme-swatches', role: 'group', 'aria-label': t('settings.theme') });
  const themes: ReadonlyArray<readonly [ThemeSetting, string]> = [['system', t('settings.themeSystem')], ['neon', t('settings.themeNeon')], ['oled', t('settings.themeOled')], ['pastel', t('settings.themePastel')]];
  for (const [v, name] of themes) {
    const active = s.theme === v;
    swatches.append(h('button', {
      type: 'button', class: `swatch${active ? ' active' : ''}`, 'data-theme-value': v, 'aria-pressed': String(active),
      onclick: () => { update({ theme: v }); applyTheme(v); rerender(); },
    }, h('span', { class: 'swatch-dot' }), name));
  }
  return [
    section(t('settings.appearance'),
      row(t('settings.language'), segmented<Settings['lang']>(t('settings.language'),
        [['auto', t('settings.langAuto')], ['de', t('settings.langDe')], ['en', t('settings.langEn')]], s.lang,
        (v) => { setLang(detectLang(v)); update({ lang: v }); })),
      h('div', { class: 'setting-row' }, h('div', null, t('settings.theme')), swatches)),
    section(t('settings.feedback'),
      row(t('settings.haptics'), toggle(t('settings.haptics'), 'haptics', s)),
      row(t('settings.sound'), toggle(t('settings.sound'), 'sound', s))),
  ];
}

// ---------- Tab: Gameplay ----------
function categoriesSection(s: Settings): HTMLElement {
  const all: CategoryId[] = CATEGORIES.map((c) => c.id);
  const enabled: CategoryId[] = Array.isArray(s.enabledCategories)
    ? all.filter((id) => s.enabledCategories?.includes(id)) : all;
  const save = (ids: CategoryId[]): void => {
    update({ enabledCategories: ids.length >= all.length ? null : ids });
    rerender();
  };
  const rows = CATEGORIES.map((c) => {
    const on = enabled.includes(c.id);
    const last = on && enabled.length === 1;
    const input: HTMLInputElement = h('input', {
      type: 'checkbox', 'aria-label': c.name, checked: on ? true : null, disabled: last ? true : null,
      onchange: () => save(input.checked ? all.filter((id) => id === c.id || enabled.includes(id)) : enabled.filter((id) => id !== c.id)),
    });
    return h('div', { class: 'setting-row cat-row' },
      h('div', null, c.name, h('div', { class: 'small muted' }, c.description)),
      h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' })));
  });
  return section(t('settings.categories'),
    h('p', { class: 'small muted' }, t('settings.categoriesHint')),
    ...rows,
    enabled.length === 1 ? h('p', { class: 'small muted' }, t('settings.lastCategory')) : null,
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button', class: 'btn', disabled: enabled.length === all.length ? true : null,
        onclick: () => save(all),
      }, t('settings.enableAll'))));
}

function gameplayTab(s: Settings): HTMLElement[] {
  const goal: HTMLSelectElement = h('select', {
    class: 'select', 'aria-label': t('settings.dailyGoal'),
    onchange: () => update({ dailyGoalMin: Number(goal.value) }),
  }, [5, 10, 15, 20, 30, 45, 60].map((m) => h('option', { value: m, selected: m === s.dailyGoalMin ? true : null }, t('settings.minutes', { n: m }))));
  const diffCur: 'auto' | 1 | 2 | 3 = s.difficulty === 'auto' ? 'auto' : s.difficulty;
  return [
    section(t('settings.training'),
      row(t('settings.dailyGoal'), goal),
      row(t('settings.difficulty'), segmented<'auto' | 1 | 2 | 3>(t('settings.difficulty'),
        [['auto', t('settings.diffAuto')], [1, t('settings.diffEasy')], [2, t('settings.diffMedium')], [3, t('settings.diffHard')]], diffCur, (v) => update({ difficulty: v }))),
      row(t('settings.roundLength'), segmented<number>(t('settings.roundLength'),
        [[5, '5'], [10, '10'], [20, '20'], [30, '30']], s.sessionLength, (v) => update({ sessionLength: v }))),
      row(t('settings.timer'), toggle(t('settings.timer'), 'timer', s, rerender), t('settings.timerHint')),
      row(t('settings.autoFail'), autoFailToggle(s),
        s.timer ? t('settings.autoFailOn') : t('settings.autoFailNeedsTimer')),
      row(t('settings.autoSubmit'), toggle(t('settings.autoSubmit'), 'autoSubmit', s), t('settings.autoSubmitHint')),
      row(t('settings.estimate'), toggle(t('settings.estimate'), 'estimateMode', s), t('settings.estimateHint')),
      row(t('settings.ghost'), toggle(t('settings.ghost'), 'ghost', s), t('settings.ghostHint'))),
    section(t('settings.input'),
      row(t('settings.keypad'), segmented<'auto' | 'on' | 'off'>(t('settings.keypad'),
        [['auto', t('settings.langAuto')], ['on', t('settings.keypadOn')], ['off', t('settings.keypadOff')]], s.keypad || 'auto', (v) => update({ keypad: v })),
      t('settings.keypadHint')),
      row(t('settings.numpadLayout'), segmented<'calculator' | 'phone'>(t('settings.numpadLayout'),
        [['calculator', t('settings.numpadCalculator')], ['phone', t('settings.numpadPhone')]], s.numpadLayout, (v) => update({ numpadLayout: v })))),
    categoriesSection(s),
  ];
}

// ---------- Tab: Daten & Account ----------
function dataTab(): HTMLElement[] {
  const attempts = getAttempts().length;
  const sessions = getSessions().length;
  const profile = getProfile();

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
    toast(t('settings.importDone', { attempts: res.attempts, sessions: res.sessions }), { kind: 'success' });
    rerender();
  }

  const resetBtn = h('button', {
    type: 'button', class: 'btn danger',
    onclick: () => {
      void confirmDialog(t('settings.resetConfirm'),
        { title: t('settings.resetTitle'), confirmLabel: t('settings.deleteLabel'), danger: true }).then((yes) => {
        if (!yes) return;
        resetAll();
        applyTheme('system');
        setLang(detectLang('auto'));
        toast(t('settings.resetDone'), { kind: 'info' });
        rerender();
      });
    },
  }, t('settings.resetAll'));

  return [
    section(t('settings.storage'),
      row(t('settings.storedData'), h('span', { class: 'muted' }, t('settings.storedCount', { attempts, sessions })),
        t('settings.storageUsed', { kb: storageKB() }))),
    section(t('settings.backup'),
      row(t('settings.exportJson'), h('button', { type: 'button', class: 'btn', onclick: download }, t('settings.exportBtn')), t('settings.exportHint')),
      row(t('settings.importJson'), h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, t('settings.importLabel')),
        t('settings.importHint')),
      fileInput,
      row(t('settings.deleteAll'), resetBtn)),
    section(t('settings.account'),
      h('p', { class: 'small muted' }, t('settings.accountSoon')),
      row(t('settings.deviceId'), h('code', { class: 'id-chip', title: profile.deviceId }, short(profile.deviceId))),
      row(t('settings.profileId'), h('code', { class: 'id-chip', title: profile.id }, short(profile.id))),
      h('div', { class: 'btn-row' }, h('button', { type: 'button', class: 'btn', disabled: true }, t('settings.comingSoon')))),
  ];
}

// ---------- Tab: Über ----------
function aboutTab(): HTMLElement[] {
  return [
    section('Mental Math',
      row(t('settings.version'), h('span', { class: 'muted' }, BUILD_INFO.version)),
      row(t('settings.build'), h('span', { class: 'muted' }, BUILD_INFO.build)),
      row(t('settings.buildDate'), h('span', { class: 'muted' }, fmtIsoDate(BUILD_INFO.date))),
      row(t('settings.whatsNew'), h('button', { type: 'button', class: 'btn', onclick: () => openChangelog() }, t('settings.viewChanges'))),
      row(t('settings.sourceCode'), h('a', { class: 'linkbtn', href: 'https://github.com/EliasSteffen/Mental-Math', target: '_blank', rel: 'noopener' }, 'GitHub'))),
  ];
}

function tabBar(active: TabId): HTMLElement {
  const bar = h('div', { class: 'settings-tabs', role: 'tablist', 'aria-label': t('settings.title') });
  for (const [id, label, ic] of TABS) {
    const on = id === active;
    bar.append(h('button', {
      type: 'button', role: 'tab', class: `settings-tab${on ? ' active' : ''}`, 'aria-selected': String(on), 'data-tab': id,
      onclick: () => {
        if (on) return;
        history.replaceState(null, '', `#/settings?tab=${id}`);
        rerender();
      },
    }, icon(ic, { size: 18 }), h('span', null, t(label))));
  }
  return bar;
}

export function renderSettings(): void {
  const s = getSettings();
  const tab = currentTab();
  const content = tab === 'general' ? generalTab(s) : tab === 'gameplay' ? gameplayTab(s) : tab === 'data' ? dataTab() : aboutTab();
  appendChildren(app, [
    h('h1', { class: 'page-title' }, t('settings.title')),
    tabBar(tab),
    h('div', { class: 'settings-panel', role: 'tabpanel' }, content),
  ]);
}
