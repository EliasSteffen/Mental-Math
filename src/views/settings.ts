import type { CategoryId, Settings, ThemeSetting } from '../types.ts';
import { getSettings, setSettings, resetAll, exportJSON, getAttempts, getSessions, getProfile } from '../data/storage.ts';
import { importJSON } from '../data/transfer.ts';
import { applyTheme } from '../ui/theme.ts';
import { toast } from '../ui/toast.ts';
import { confirmDialog, openModal } from '../ui/modal.ts';
import { openChangelog, fmtIsoDate } from '../features/whats-new.ts';
import { BUILD_INFO } from '../generated/build-info.ts';
import { detectLang, setLang, t } from '../i18n/index.ts';
import { icon } from '../ui/charts.ts';
import { CATEGORIES } from '../core/catalog.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { rerender, addCleanup } from '../router.ts';
import type { PasskeyInfo, RecoveryStatus } from '../vendor/auth.ts';
import * as acct from '../features/account.ts';
import { getSyncStatus, onSyncStatus, syncNow, syncStatusEntries, wipeCloudData } from '../features/sync.ts';

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

// ---------- Konto (Passkey) ----------
const NAME_MIN = 2;
const NAME_MAX = 32;

/** Führt eine Konto-Aktion aus; Button zeigt Busy-Zustand, Fehler als Toast (außer Abbruch). */
async function runBusy(btn: HTMLButtonElement, fn: () => Promise<void>): Promise<boolean> {
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try {
    await fn();
    return true;
  } catch (e) {
    const code = acct.errorCode(e);
    if (code !== 'cancelled') toast(t(`account.err.${code}`), { kind: 'error' });
    return false;
  } finally {
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

const acctDate = (iso: string): string => fmtIsoDate(iso.slice(0, 10));

/** Zeigt einen neuen Wiederherstellungscode einmalig an: Kopieren + Bestätigen. */
function showRecoveryCode(code: string, replaced = false): void {
  const copy = (): void => {
    void navigator.clipboard?.writeText(code).then(
      () => toast(t('account.recovery.copied'), { kind: 'success' }),
      () => { /* Zwischenablage gesperrt: der Code lässt sich markieren */ });
  };
  openModal({
    title: t('account.recovery.modalTitle'),
    body: h('div', { class: 'acct-recovery' },
      replaced ? h('p', null, t('account.recovery.modalUsed')) : null,
      h('code', { class: 'acct-code' }, code),
      h('p', { class: 'small muted' }, t('account.recovery.modalText'))),
    actions: [
      { label: t('account.recovery.copy'), onClick: copy, closes: false },
      { label: t('account.recovery.done'), primary: true },
    ],
  });
}

/** Inline-Formular zum Umbenennen (Name oder Passkey). */
function inlineEdit(initial: string, label: string, validate: (v: string) => string | null, onSave: (v: string) => Promise<boolean>, onCancel: () => void): HTMLFormElement {
  const input: HTMLInputElement = h('input', { type: 'text', value: initial, maxlength: NAME_MAX, 'aria-label': label, autocomplete: 'off' });
  const err = h('div', { class: 'small acct-err', role: 'alert' });
  const save: HTMLButtonElement = h('button', { type: 'submit', class: 'btn primary' }, t('account.save'));
  const form: HTMLFormElement = h('form', { class: 'acct-edit' },
    h('div', { class: 'acct-edit-row' }, input, save,
      h('button', { type: 'button', class: 'btn', onclick: onCancel }, t('account.cancel'))),
    err);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = input.value.trim();
    const bad = validate(v);
    err.textContent = bad ?? '';
    if (bad) return;
    void runBusy(save, async () => { await onSave(v); });
  });
  setTimeout(() => input.focus(), 0);
  return form;
}

function accountSignedOut(box: HTMLElement): void {
  const input: HTMLInputElement = h('input', { type: 'text', maxlength: NAME_MAX, placeholder: t('account.namePlaceholder'), autocomplete: 'username', 'aria-label': t('account.nameLabel') });
  const err = h('div', { class: 'small acct-err', role: 'alert' });
  const create: HTMLButtonElement = h('button', { type: 'button', class: 'btn primary' }, t('account.create'));
  const login: HTMLButtonElement = h('button', { type: 'button', class: 'btn' }, t('account.login'));
  const recInput: HTMLInputElement = h('input', {
    type: 'text', maxlength: 40, placeholder: t('account.recovery.placeholder'), autocomplete: 'off',
    autocapitalize: 'characters', spellcheck: 'false', 'aria-label': t('account.recovery.inputLabel'),
  });
  const recErr = h('div', { class: 'small acct-err', role: 'alert' });
  const recBtn: HTMLButtonElement = h('button', { type: 'submit', class: 'btn' }, t('account.recovery.submit'));
  const both = [create, login, recBtn];
  const busy = async (btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> => {
    for (const b of both) b.disabled = true;
    await runBusy(btn, fn);
    for (const b of both) b.disabled = false;
  };
  create.addEventListener('click', () => {
    const v = input.value.trim();
    const bad = v.length < NAME_MIN || v.length > NAME_MAX;
    err.textContent = bad ? t('account.nameInvalid') : '';
    input.setAttribute('aria-invalid', String(bad));
    if (bad) { input.focus(); return; }
    void busy(create, async () => {
      const code = await acct.register(v);
      toast(t('account.registered'), { kind: 'success', durationMs: 6000 });
      if (code) showRecoveryCode(code);
      else toast(t('account.recovery.missing'), { kind: 'error', durationMs: 8000 });
    });
  });
  login.addEventListener('click', () => { void busy(login, async () => { await acct.login(); toast(t('account.loggedIn'), { kind: 'success' }); }); });

  // Passkey verloren: mit dem Wiederherstellungscode einen neuen anlegen (Format prüft der Client genauer)
  const recForm: HTMLFormElement = h('form', { class: 'acct-recover' },
    h('p', { class: 'small muted' }, t('account.recovery.lostIntro')),
    h('label', { class: 'field' }, h('span', null, t('account.recovery.inputLabel')), recInput), recErr, recBtn);
  recForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const bad = recInput.value.replace(/[\s-]/g, '').length !== 20;
    recErr.textContent = bad ? t('account.recovery.invalidFormat') : '';
    recInput.setAttribute('aria-invalid', String(bad));
    if (bad) { recInput.focus(); return; }
    void busy(recBtn, async () => {
      const code = await acct.recover(recInput.value);
      toast(t('account.recovery.recovered'), { kind: 'success' });
      if (code) showRecoveryCode(code, true);
    });
  });

  const controls = h('div', { class: 'acct-controls' },
    h('label', { class: 'field' }, h('span', null, t('account.nameLabel')), input), err, create,
    h('div', { class: 'acct-divider' }, h('span', null, t('account.or'))), login,
    h('details', { class: 'acct-lost' }, h('summary', null, t('account.recovery.lost')), recForm));
  const hint = h('p', { class: 'small muted' }, t('account.unsupported'));
  appendChildren(box, [h('p', { class: 'small muted' }, t('account.intro')), controls]);
  void acct.support().then((info) => { if (!info.webauthn && controls.isConnected) controls.replaceWith(hint); }).catch(() => { /* Button-Aktionen melden Fehler selbst */ });
}

/** Statuszeile der Synchronisierung; aktualisiert sich live (Aufräumen über den Router). */
function syncLine(): HTMLElement {
  const line = h('p', { class: 'small muted acct-sync', role: 'status' });
  const draw = (): void => {
    const parts = syncStatusEntries(getSyncStatus()).map((e) => t(e.key, e.params));
    line.textContent = parts.join(' · ');
  };
  draw();
  addCleanup(onSyncStatus(draw));
  return line;
}

function accountSignedIn(box: HTMLElement, username: string): void {
  let editingName = false;
  let editingId: string | null = null;
  let passkeys: PasskeyInfo[] | null = null;
  let recovery: RecoveryStatus | null = null;
  const body = h('div', { class: 'acct-body' });
  box.append(body);

  const reload = async (): Promise<void> => {
    const [pk, rs] = await Promise.allSettled([acct.listPasskeys(), acct.recoveryStatus()]);
    if (pk.status === 'fulfilled') passkeys = pk.value;
    else { toast(t(`account.err.${acct.errorCode(pk.reason)}`), { kind: 'error' }); passkeys = passkeys ?? []; }
    // Status unbekannt (z. B. Migration fehlt): wie „kein Code“ behandeln, Erstellen meldet dann den Fehler
    recovery = rs.status === 'fulfilled' ? rs.value : recovery ?? { exists: false, createdAt: null };
    draw();
  };

  function passkeyItem(p: PasskeyInfo, last: boolean): HTMLElement {
    const label = p.name ?? t('account.passkeyFallback', { date: acctDate(p.createdAt) });
    if (editingId === p.id) {
      return h('li', { class: 'acct-pk' }, inlineEdit(p.name ?? '', t('account.renameAria'),
        (v) => (v.length < 1 || v.length > NAME_MAX ? t('account.nameInvalid') : null),
        async (v) => { await acct.renamePasskey(p.id, v); editingId = null; await reload(); return true; },
        () => { editingId = null; draw(); }));
    }
    const del: HTMLButtonElement = h('button', {
      type: 'button', class: 'btn danger', disabled: last ? true : null, 'aria-label': `${t('account.deleteAria')}: ${label}`,
      title: last ? t('account.lastPasskeyHint') : null,
      onclick: () => {
        void confirmDialog(t('account.deletePasskeyConfirm'), { title: t('account.deletePasskeyTitle'), confirmLabel: t('account.delete'), danger: true }).then((yes) => {
          if (!yes) return;
          void runBusy(del, async () => { await acct.deletePasskey(p.id); toast(t('account.passkeyDeleted'), { kind: 'info' }); await reload(); });
        });
      },
    }, t('account.delete'));
    return h('li', { class: 'acct-pk' },
      h('div', { class: 'acct-pk-info' },
        h('div', { class: 'acct-pk-name' }, h('span', null, label), p.backedUp ? h('span', { class: 'badge good' }, t('account.synced')) : null),
        h('div', { class: 'small muted' }, t('account.created', { date: acctDate(p.createdAt) }),
          p.lastUsedAt ? ` · ${t('account.lastUsed', { date: acctDate(p.lastUsedAt) })}` : null),
        last ? h('div', { class: 'small muted' }, t('account.lastPasskeyHint')) : null),
      h('div', { class: 'acct-pk-actions' },
        h('button', { type: 'button', class: 'btn', 'aria-label': `${t('account.renameAria')}: ${label}`, onclick: () => { editingId = p.id; draw(); } }, t('account.rename')),
        del));
  }

  function draw(): void {
    body.replaceChildren();
    const nameRow = editingName
      ? inlineEdit(username, t('account.nameLabel'),
        (v) => (v.length < NAME_MIN || v.length > NAME_MAX ? t('account.nameInvalid') : null),
        async (v) => { await acct.renameUser(v); toast(t('account.renamed'), { kind: 'success' }); return true; },
        () => { editingName = false; draw(); })
      : h('div', { class: 'acct-name' },
        h('div', null, h('div', { class: 'small muted' }, t('account.signedInAs')), h('strong', null, username)),
        h('button', { type: 'button', class: 'btn', onclick: () => { editingName = true; draw(); } }, t('account.change')));
    const syncBtn: HTMLButtonElement = h('button', { type: 'button', class: 'btn', onclick: () => {
      void runBusy(syncBtn, async () => {
        const res = await syncNow();
        if (res.phase === 'idle') toast(t('account.sync.syncDone'), { kind: 'success' });
        else toast(t(syncStatusEntries(res)[0]?.key ?? 'account.sync.failed'), { kind: 'error' });
      });
    } }, t('account.sync.syncNow'));
    const list = passkeys
      ? h('ul', { class: 'acct-pks' }, passkeys.map((p) => passkeyItem(p, passkeys !== null && passkeys.length <= 1)))
      : h('p', { class: 'small muted' }, t('account.loading'));
    const add: HTMLButtonElement = h('button', { type: 'button', class: 'btn', onclick: () => {
      void runBusy(add, async () => { await acct.addPasskey(); toast(t('account.passkeyAdded'), { kind: 'success' }); await reload(); });
    } }, t('account.addPasskey'));
    const out: HTMLButtonElement = h('button', { type: 'button', class: 'btn', onclick: () => {
      void runBusy(out, async () => { await acct.logout(); toast(t('account.loggedOut'), { kind: 'info' }); });
    } }, t('account.logout'));
    const del: HTMLButtonElement = h('button', { type: 'button', class: 'btn danger', onclick: () => {
      void confirmDialog(t('account.deleteAccountConfirm'), { title: t('account.deleteAccountTitle'), confirmLabel: t('account.deleteAccount'), danger: true }).then((yes) => {
        if (!yes) return;
        void runBusy(del, async () => { await acct.deleteAccount(); toast(t('account.accountDeleted'), { kind: 'info' }); });
      });
    } }, t('account.deleteAccount'));
    const recBtn: HTMLButtonElement = h('button', { type: 'button', class: 'btn', onclick: () => {
      const run = (): void => {
        void runBusy(recBtn, async () => { showRecoveryCode(await acct.createRecoveryCode()); await reload(); });
      };
      if (!recovery?.exists) { run(); return; }
      void confirmDialog(t('account.recovery.renewConfirm'), { title: t('account.recovery.renewTitle'), confirmLabel: t('account.recovery.renew') })
        .then((yes) => { if (yes) run(); });
    } }, t(recovery?.exists ? 'account.recovery.renew' : 'account.recovery.create'));
    const recStatus = recovery === null ? t('account.loading')
      : recovery.exists && recovery.createdAt ? t('account.recovery.statusSet', { date: acctDate(recovery.createdAt) })
        : t('account.recovery.statusNone');
    appendChildren(body, [nameRow, syncLine(), syncBtn, h('h3', { class: 'acct-sub' }, t('account.passkeys')), list,
      h('p', { class: 'small muted' }, t('account.addPasskeyHint')),
      h('div', { class: 'btn-row' }, add, out),
      h('h3', { class: 'acct-sub' }, t('account.recovery.title')),
      h('p', { class: recovery && !recovery.exists ? 'small acct-warn' : 'small muted' }, recStatus),
      h('p', { class: 'small muted' }, t('account.recovery.hint')),
      h('div', { class: 'btn-row' }, recBtn),
      h('div', { class: 'btn-row' }, del)]);
  }
  draw();
  void reload();
}

/** Konto-Karte: rendert nach Zustand neu; blendet sich aus, wenn das Feature deaktiviert ist. */
function accountCard(): HTMLElement {
  const box = h('section', { class: 'settings-section acct' });
  let lastKey = '';
  const render = (): void => {
    const st = acct.getAccountState();
    const key = st.status === 'signed-in' ? `in:${st.user.id}:${st.user.username}` : st.status;
    if (key === lastKey) return;
    lastKey = key;
    box.replaceChildren();
    box.hidden = st.status === 'disabled';
    if (st.status === 'disabled') return;
    box.append(h('h2', { class: 'section-title' }, t('account.title')));
    if (st.status === 'loading') box.append(h('p', { class: 'small muted' }, t('account.loading')));
    else if (st.status === 'signed-out') accountSignedOut(box);
    else accountSignedIn(box, st.user.username);
  };
  render();
  addCleanup(acct.onAccountChange(render));
  return box;
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
      const cloud = acct.getAccountState().status === 'signed-in';
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
    accountCard(),
    section(t('settings.account'),
      row(t('settings.deviceId'), h('code', { class: 'id-chip', title: profile.deviceId }, short(profile.deviceId))),
      row(t('settings.profileId'), h('code', { class: 'id-chip', title: profile.id }, short(profile.id)))),
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
