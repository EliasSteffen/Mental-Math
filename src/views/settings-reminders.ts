// Profil → Erinnerungen: Push-Benachrichtigungen auf diesem Gerät (täglich zur Wunschzeit, Serie retten,
// Wiederholungen, Lern-Hinweis). Website: nur, wenn der Server Push anbietet (/api/push/config); iOS-App: lokal, immer.
import { formatTime, parseTime } from '../core/reminders.ts';
import type { ReminderPrefs } from '../core/reminders.ts';
import {
  disablePush, enablePush, getPushPrefs, isPushEnabled, notificationPermission, pushConfig, pushSupport, sendTestPush,
  setPushPrefs,
} from '../platform/reminders.ts';
import { isNative } from '../platform/index.ts';
import { getLang, locale, t } from '../i18n/index.ts';
import { h } from '../ui/dom.ts';
import { group, list, row, switchRow } from '../ui/kit.ts';

let uid = 0;

/** Kurze und lange Wochentagsnamen (Montag zuerst) in der UI-Sprache */
function weekdays(): Array<{ short: string; long: string }> {
  const loc = locale(getLang());
  const fmtShort = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' });
  const fmtLong = new Intl.DateTimeFormat(loc, { weekday: 'long', timeZone: 'UTC' });
  // 05.01.2026 ist ein Montag
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 5 + i, 12));
    return { short: fmtShort.format(d).replace(/\.$/, ''), long: fmtLong.format(d) };
  });
}

/** Mehrfachauswahl der Wochentage im Stil des Segment-Controls; mindestens ein Tag bleibt aktiv. */
function daysControl(days: number, onChange: (days: number) => void): HTMLElement {
  const labelId = `prof-days-${++uid}`;
  let mask = days;
  const buttons = weekdays().map((d, i) => h('button', {
    type: 'button', class: 'press', 'aria-pressed': String((mask & (1 << i)) !== 0), 'aria-label': d.long,
    onclick: () => {
      const next = mask ^ (1 << i);
      if (next === 0) return; // letzter Tag bleibt
      mask = next;
      for (const [j, b] of buttons.entries()) b.setAttribute('aria-pressed', String((mask & (1 << j)) !== 0));
      onChange(mask);
    },
  }, d.short));
  const seg = h('div', { class: 'segmented prof-days', role: 'group', 'aria-labelledby': labelId }, ...buttons);
  seg.style.setProperty('--n', '7');
  return h('div', { class: 'control' }, h('p', { class: 'control-label', id: labelId }, t('settings.remindDays')), seg);
}

function timeControl(minutes: number, onChange: (minutes: number) => void): HTMLElement {
  const id = `prof-time-${++uid}`;
  const input: HTMLInputElement = h('input', {
    type: 'time', id, class: 'prof-input prof-time num', value: formatTime(minutes), step: 300, required: true,
    onchange: () => {
      const v = parseTime(input.value);
      if (v === null) { input.value = formatTime(minutes); return; }
      minutes = v;
      onChange(v);
    },
  });
  return h('div', { class: 'control is-inline' }, h('label', { class: 'control-label', for: id }, t('settings.remindTime')), input);
}

export function remindersGroup(): HTMLElement {
  const body = h('div', { class: 'prof-remind' });
  const el = group(t('settings.reminders'), body);
  el.classList.add('prof-group');
  el.hidden = true; // erst sichtbar, wenn der Server Push anbietet
  const status = h('p', { class: 'prof-note', role: 'status' });

  const say = (text: string): void => {
    status.textContent = '';
    requestAnimationFrame(() => { status.textContent = text; });
  };

  let prefs: ReminderPrefs = getPushPrefs();
  const save = (patch: Partial<ReminderPrefs>): void => {
    prefs = { ...prefs, ...patch };
    setPushPrefs(prefs);
  };

  function details(): HTMLElement[] {
    const time = timeControl(prefs.dailyAt, (v) => save({ dailyAt: v }));
    const days = daysControl(prefs.days, (v) => save({ days: v }));
    const onlyOpen = switchRow({
      label: t('settings.remindOnlyOpen'), help: t('settings.remindOnlyOpenHelp'), checked: prefs.onlyIfOpen,
      onChange: (v) => save({ onlyIfOpen: v }),
    });
    const dailyParts = [time, days, onlyOpen.el];
    const paintDaily = (): void => { for (const p of dailyParts) p.hidden = !prefs.daily; };
    paintDaily();
    const daily = switchRow({
      label: t('settings.remindDaily'), checked: prefs.daily,
      onChange: (v) => { save({ daily: v }); paintDaily(); },
    });
    const test = row({
      icon: 'bell', label: t('settings.remindTest'),
      onClick: () => {
        void sendTestPush().then((r) => {
          if (r === 'gone') { draw(); return; }
          say(t(r === 'ok' ? 'settings.remindTestSent' : r === 'wait' ? 'settings.remindTestWait' : 'settings.remindError'));
        });
      },
    });
    return [
      list([
        daily.el, ...dailyParts,
        switchRow({ label: t('settings.remindStreak'), help: t('settings.remindStreakHelp'), checked: prefs.streak, onChange: (v) => save({ streak: v }) }).el,
        switchRow({ label: t('settings.remindReview'), help: t('settings.remindReviewHelp'), checked: prefs.review, onChange: (v) => save({ review: v }) }).el,
        switchRow({ label: t('settings.remindTip'), help: t('settings.remindTipHelp'), checked: prefs.tip, onChange: (v) => save({ tip: v }) }).el,
        test,
      ]),
    ];
  }

  function draw(): void {
    const support = pushSupport();
    if (support !== 'ok') {
      body.replaceChildren(h('p', { class: 'prof-note' }, t(support === 'ios-install' ? 'settings.remindIos' : 'settings.remindUnsupported')));
      return;
    }
    const enabled = isPushEnabled();
    const denied = notificationPermission() === 'denied';
    let busy = false;
    const master = switchRow({
      label: t('settings.remindOn'), help: t(isNative() ? 'settings.remindOnHelpApp' : 'settings.remindOnHelp'), checked: enabled, disabled: denied,
      onChange: (on) => {
        if (busy) { master.set(!on); return; }
        busy = true;
        master.setDisabled(true);
        const done = (): void => { busy = false; master.setDisabled(notificationPermission() === 'denied'); };
        if (!on) {
          void disablePush().finally(() => { done(); draw(); });
          return;
        }
        void enablePush().then((r) => {
          done();
          if (r === 'ok') { draw(); return; }
          master.set(false);
          if (r === 'denied') { draw(); return; }
          say(t(r === 'unsupported' ? 'settings.remindUnsupported' : 'settings.remindError'));
        });
      },
    });
    body.replaceChildren(
      list([master.el]),
      ...(denied ? [h('p', { class: 'prof-note' }, t(isNative() ? 'settings.remindDeniedApp' : 'settings.remindDenied'))] : []),
      ...(enabled ? details() : []),
      status,
      h('p', { class: 'prof-note' }, t(isNative() ? 'settings.remindPrivacyApp' : 'settings.remindPrivacy')),
    );
  }

  void pushConfig().then((cfg) => {
    if (!cfg.enabled || !el.isConnected) return; // Server ohne Push oder Seite schon verlassen
    el.hidden = false;
    draw();
  });
  return el;
}
