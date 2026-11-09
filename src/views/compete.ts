// Tab „Wettkampf“ (#/wettbewerbe): gewertete Daily als große Karte, Ranglisten, laufende Wettbewerbe, Gruppen und der
// eigene Name. Ab 720 px zweispaltig mit den Top-Plätzen von heute direkt auf der Seite.
// ?join=CODE öffnet „Gruppe beitreten“ mit dem Code (Einladungslink), ?name=1 die Namens-Einstellung.
import { COUNT_CHOICES, DURATION_DAYS, GROUP_NAME_MAX, normalizeGroupCode, normalizeGroupName } from '../core/challenge.ts';
import type { ChallengeInfo, GroupInfo, PublicProfile } from '../core/challenge.ts';
import { LEVEL_NAMES, mixCategories } from '../core/catalog.ts';
import type { Level } from '../types.ts';
import { accountEnabled, getAccountState, onAccountChange } from '../features/account.ts';
import {
  createCompetition, createGroup, joinGroup, leaveGroup, loadBoard, loadOverview,
} from '../features/challenge.ts';
import type { Overview } from '../features/challenge.ts';
import { fmt, fmtSeconds } from '../core/numbers.ts';
import { t } from '../i18n/index.ts';
import { addCleanup, go, rerender } from '../router.ts';
import { app, h } from '../ui/dom.ts';
import { button, card, columns, group, icon, largeTitle, list, row, segmented } from '../ui/kit.ts';
import { confirmDialog } from '../ui/modal.ts';
import { openSheet } from '../ui/sheet.ts';
import type { SheetHandle } from '../ui/sheet.ts';
import { toast } from '../ui/toast.ts';
import { isTablet } from '../ui/viewport.ts';
import { publicUrl, shareText } from '../platform/index.ts';
import { openAccountOnProfile } from './settings.ts';
import { boardList } from './leaderboard.ts';
import { challengeTitle, errorText, notice, participantsText, profileForm, stateValue, whenLine } from './compete-ui.ts';

/** So viele Plätze zeigt die Vorschau der Tagesrangliste ab 720 px. */
const PREVIEW_ROWS = 8;

function challengeRow(c: ChallengeInfo): HTMLElement {
  const v = stateValue(c);
  return row({
    icon: 'trophy', label: challengeTitle(c), sub: [c.groupName, whenLine(c), participantsText(c.participants)].filter(Boolean).join(' · '),
    value: v.text, valueTone: v.accent ? 'accent' : 'muted', href: `#/challenge/${c.id}`,
  });
}

/** Die Daily als große, antippbare Karte: offen mit „Jetzt antreten“, danach Platz und Ergebnis. Nur <span> im Link. */
function dailyHero(c: ChallengeInfo): HTMLAnchorElement {
  const done = c.state === 'done' ? c.result : null;
  const title = done && done.rank !== null ? t('compete.rankOf', { rank: done.rank, total: done.total }) : challengeTitle(c);
  const facts = done
    ? [t('compete.correctOf', { correct: done.correct, n: done.n }), t('compete.pointsTime', { points: fmt(done.points), time: fmtSeconds(done.timeMs) })]
    : [whenLine(c), t('compete.tasksCount', { n: c.count }), participantsText(c.participants)];
  const open = c.state === 'open';
  return h('a', { class: 'card hero compete-hero press', href: `#/challenge/${c.id}` },
    h('span', { class: 'compete-hero-head' },
      h('span', { class: 'compete-hero-label' }, done ? challengeTitle(c) : t('home.dailyChallenge')),
      h('span', { class: 'compete-hero-title' }, title),
      h('span', { class: 'compete-hero-sub' }, facts.join(' · '))),
    h('span', { class: `btn ${open ? 'primary cta' : 'soft'} is-full compete-hero-go` },
      open ? icon('play', 20) : null,
      h('span', { class: 'btn-label' }, t(open ? 'compete.heroCompete' : done ? 'compete.heroResult' : 'compete.heroDetails')),
      open ? h('span', { class: 'btn-meta' }, `· ${t('compete.oneAttempt')}`) : null));
}

/** Ranglisten-Einstiege; mit `previewId` (nur angemeldet) ab 720 px zusätzlich die Top-Plätze dieser Challenge. */
function boardsGroup(previewId: string | null): HTMLElement {
  const preview = previewId !== null && isTablet() ? h('div', { class: 'compete-preview' }, notice(t('compete.loading'))) : null;
  if (preview && previewId !== null) {
    void loadBoard(previewId, null).then((b) => preview.replaceChildren(boardList(b, false, PREVIEW_ROWS)), () => preview.remove());
  }
  return group(t('compete.boards'), preview, list([
    row({ icon: 'trophy', label: t('compete.boardToday'), value: preview ? t('compete.boardAll') : undefined, href: '#/rangliste' }),
    row({ icon: 'bars', label: t('compete.boardWeek'), href: '#/rangliste?tab=week' }),
  ]));
}

let sheet: SheetHandle | null = null;
function openOne(title: string, children: Array<Node | null>): void {
  sheet?.close();
  sheet = openSheet({ title, children, onClose: () => { sheet = null; } });
}
const closeSheet = (): void => { sheet?.close(); };

function inviteText(g: GroupInfo): string {
  return t('compete.inviteText', { name: g.name, code: g.code, url: `${publicUrl()}#/wettbewerbe?join=${g.code}` });
}

/** Nach einer Änderung neu zeichnen; Einladungs- bzw. Namens-Links (?join=, ?name=) dabei verlassen. */
function refresh(): void {
  if (location.hash !== '#/wettbewerbe') go('#/wettbewerbe');
  else rerender({ keepScroll: true });
}

function errorLine(): HTMLParagraphElement {
  return h('p', { class: 'prof-err', role: 'alert' });
}

/* ---------- Sheets ---------- */

/** Name festlegen; mit `then` geht es danach direkt weiter (z. B. Beitreten per Einladungslink). */
function nameSheet(profile: PublicProfile | null, suggestion: string, then?: () => void): void {
  openOne(t('compete.nameTitle'), [
    h('p', { class: 'prof-sheet-text' }, t('compete.nameIntro')),
    profileForm({
      profile, suggestion,
      onSaved: () => {
        closeSheet();
        toast(t('compete.nameSaved'), { kind: 'success' });
        if (then) then();
        else refresh();
      },
    }),
  ]);
}

function createGroupSheet(): void {
  const inputId = 'cg-name';
  const input = h('input', { class: 'prof-input', id: inputId, type: 'text', maxlength: GROUP_NAME_MAX, placeholder: t('compete.groupNamePlaceholder') });
  const err = errorLine();
  const save = button({ label: t('compete.createGroup'), kind: 'primary', full: true, cta: false, type: 'submit' });
  const form = h('form', { class: 'prof-form', novalidate: true },
    h('label', { class: 'prof-field', for: inputId }, t('compete.groupName')), input, err, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = normalizeGroupName(input.value);
    if (!name) { err.textContent = t('compete.err.name_invalid'); input.focus(); return; }
    save.disabled = true;
    createGroup(name).then((g) => {
      closeSheet();
      toast(t('compete.groupCreated', { code: g.code }), { kind: 'success', durationMs: 6000 });
      refresh();
    }, (ex: unknown) => { err.textContent = errorText(ex); }).finally(() => { save.disabled = false; });
  });
  openOne(t('compete.createGroup'), [h('p', { class: 'prof-sheet-text' }, t('compete.createGroupIntro')), form]);
  input.focus();
}

function joinSheet(code: string): void {
  const inputId = 'cj-code';
  const input = h('input', {
    class: 'prof-input compete-code', id: inputId, type: 'text', maxlength: 8, autocapitalize: 'characters', autocomplete: 'off',
    placeholder: 'ABC234', value: code,
  });
  const err = errorLine();
  const save = button({ label: t('compete.join'), kind: 'primary', full: true, cta: false, type: 'submit' });
  const form = h('form', { class: 'prof-form', novalidate: true },
    h('label', { class: 'prof-field', for: inputId }, t('compete.codeLabel')), input, err, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const c = normalizeGroupCode(input.value);
    if (!c) { err.textContent = t('compete.err.invalid_code'); input.focus(); return; }
    save.disabled = true;
    joinGroup(c).then((r) => {
      closeSheet();
      toast(r.joined ? t('compete.joined', { name: r.group.name }) : t('compete.alreadyMember', { name: r.group.name }), { kind: 'success' });
      refresh();
    }, (ex: unknown) => { err.textContent = errorText(ex); }).finally(() => { save.disabled = false; });
  });
  openOne(t('compete.joinGroup'), [h('p', { class: 'prof-sheet-text' }, t('compete.joinIntro')), form]);
  if (!code) input.focus();
}

function competeSheet(g: GroupInfo): void {
  const inputId = 'cc-title';
  const titleInput = h('input', { class: 'prof-input', id: inputId, type: 'text', maxlength: GROUP_NAME_MAX, placeholder: t('compete.compTitlePlaceholder') });
  let category = 'all';
  let count = 15;
  let level: Level = 2;
  let days = 3;
  const catSelectId = 'cc-cat';
  const catSelect = h('select', { class: 'prof-input', id: catSelectId },
    h('option', { value: 'all' }, t('compete.allCategories')),
    ...mixCategories(null).map((c) => h('option', { value: c.id }, c.name)));
  catSelect.addEventListener('change', () => { category = catSelect.value; });
  const countSeg = segmented({
    label: t('compete.compCount'), inline: true, even: true, numeric: true, options: COUNT_CHOICES.map((n) => [String(n), String(n)] as const),
    value: String(count), onChange: (v) => { count = Number(v); },
  });
  const levelSeg = segmented<'1' | '2' | '3'>({
    label: t('compete.compLevel'), options: [['1', LEVEL_NAMES[1]], ['2', LEVEL_NAMES[2]], ['3', LEVEL_NAMES[3]]],
    value: '2', onChange: (v) => { level = Number(v) as Level; },
  });
  const daysSeg = segmented({
    label: t('compete.compDays'), inline: true, even: true,
    options: DURATION_DAYS.map((d) => [String(d), t(d === 1 ? 'compete.oneDay' : 'compete.nDays', { n: d })] as const),
    value: String(days), onChange: (v) => { days = Number(v); },
  });
  const err = errorLine();
  const save = button({ label: t('compete.compStart'), kind: 'primary', full: true, cta: false, type: 'submit' });
  const form = h('form', { class: 'prof-form', novalidate: true },
    h('label', { class: 'prof-field', for: inputId }, t('compete.compTitle')), titleInput,
    h('label', { class: 'prof-field', for: catSelectId }, t('compete.compCategory')), catSelect,
    countSeg.el, levelSeg.el, daysSeg.el, err, save);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = normalizeGroupName(titleInput.value);
    if (!title) { err.textContent = t('compete.err.title_invalid'); titleInput.focus(); return; }
    save.disabled = true;
    createCompetition({ groupId: g.id, title, count, level, days, categories: category === 'all' ? null : [category] }).then((c) => {
      closeSheet();
      toast(t('compete.compCreated'), { kind: 'success' });
      go(`#/challenge/${c.id}`);
    }, (ex: unknown) => { err.textContent = errorText(ex); }).finally(() => { save.disabled = false; });
  });
  openOne(t('compete.compSheetTitle', { name: g.name }), [h('p', { class: 'prof-sheet-text' }, t('compete.compIntro')), form]);
}

function groupSheet(g: GroupInfo): void {
  const invite = button({
    label: t('compete.invite'), kind: 'soft', icon: 'link', full: true,
    onClick: () => { void shareText(inviteText(g)).then((r) => { if (r === 'copied') toast(t('compete.copied'), { kind: 'success' }); }); },
  });
  const leave = button({
    label: g.owner ? t('compete.deleteGroup') : t('compete.leaveGroup'), kind: 'quiet', tone: 'danger',
    onClick: () => {
      void confirmDialog(g.owner ? t('compete.deleteGroupText', { name: g.name }) : t('compete.leaveGroupText', { name: g.name }), {
        confirmLabel: g.owner ? t('compete.deleteGroup') : t('compete.leaveGroup'), danger: true,
      }).then((yes) => {
        if (!yes) return;
        leaveGroup(g.id).then(() => { closeSheet(); refresh(); }, (e: unknown) => toast(errorText(e), { kind: 'error' }));
      });
    },
  });
  openOne(g.name, [
    h('div', { class: 'compete-code-box' },
      h('p', { class: 'compete-code-label' }, t('compete.codeLabel')),
      h('p', { class: 'compete-code-value num' }, g.code),
      h('p', { class: 'prof-sheet-text' }, g.members === 1 ? t('compete.groupMembersOne') : t('compete.groupMembers', { n: g.members }))),
    invite,
    list([
      row({ icon: 'trophy', label: t('compete.groupBoard'), href: `#/rangliste?group=${g.id}`, onClick: closeSheet }),
      row({ icon: 'bars', label: t('compete.groupWeek'), href: `#/rangliste?tab=week&group=${g.id}`, onClick: closeSheet }),
      g.owner ? row({ icon: 'play', label: t('compete.compSheetTitle', { name: g.name }), onClick: () => competeSheet(g), chevron: true }) : null,
    ]),
    leave,
  ]);
}

/* ---------- Seite ---------- */

export function renderCompete(query: URLSearchParams): void {
  let alive = true;
  addCleanup(() => { alive = false; closeSheet(); });
  const head = largeTitle(t('compete.title'), t('compete.subtitle'));
  const st = getAccountState();

  if (!accountEnabled() || st.status === 'disabled') {
    app.replaceChildren(head, notice(t('compete.noAccountBuild')),
      group(t('compete.unrankedTitle'), list([row({ icon: 'calendar', label: t('compete.practiceUnranked'), href: '#/train/daily' })])));
    return;
  }
  if (st.status !== 'signed-in') {
    const unsub = onAccountChange(() => { if (alive) rerender(); });
    addCleanup(unsub);
    app.replaceChildren(head, columns(
      [st.status === 'loading'
        ? notice(t('compete.loading'))
        : card([
          h('p', { class: 'compete-text' }, t('compete.needAccount')),
          button({ label: t('compete.createAccount'), kind: 'primary', full: true, cta: false, onClick: openAccountOnProfile }),
        ], { hero: true })],
      [boardsGroup(null),
        group(t('compete.unrankedTitle'), list([row({ icon: 'calendar', label: t('compete.practiceUnranked'), href: '#/train/daily' })]))],
    ));
    return;
  }

  app.replaceChildren(head, notice(t('compete.loading')));
  void loadOverview().then((o) => { if (alive) draw(o); }, (e: unknown) => {
    if (alive) app.replaceChildren(head, notice(errorText(e), { label: t('compete.retry'), onClick: () => rerender() }));
  });

  function draw(o: Overview): void {
    const username = st.status === 'signed-in' ? st.user.username : '';
    const comps = o.competitions;
    const groupsList = o.groups.map((g) => row({
      icon: 'person', label: g.name, sub: g.members === 1 ? t('compete.groupSubOne', { code: g.code }) : t('compete.groupSub', { n: g.members, code: g.code }), onClick: () => groupSheet(g), chevron: true,
    }));
    const needName = (fn: () => void) => (): void => { if (o.profile) fn(); else nameSheet(null, username, fn); };
    app.replaceChildren(head, columns(
      [dailyHero(o.daily), boardsGroup(o.daily.id)],
      [
        group(t('compete.competitions'), comps.length
          ? list(comps.map((c) => challengeRow(c)))
          : notice(o.groups.some((g) => g.owner) ? t('compete.noCompetitionsOwner') : t('compete.noCompetitions'))),
        group({ title: t('compete.groups'), meta: o.groups.length ? undefined : t('compete.groupsHint') }, list([
          ...groupsList,
          row({ icon: 'person', label: t('compete.createGroup'), onClick: needName(createGroupSheet), chevron: true }),
          row({ icon: 'key', label: t('compete.joinGroup'), onClick: needName(() => joinSheet('')), chevron: true }),
        ])),
        group(t('compete.nameTitle'), list([
          row({
            icon: 'person', label: o.profile?.displayName ?? t('compete.noName'),
            sub: o.profile ? (o.profile.listed ? t('compete.listedOn') : t('compete.listedOff')) : t('compete.noNameSub'),
            onClick: () => nameSheet(o.profile, username), chevron: true,
          }),
        ])),
        h('p', { class: 'compete-foot' }, t('compete.privacyFoot')),
      ],
    ));

    const join = normalizeGroupCode(query.get('join') ?? '');
    if (join) needName(() => joinSheet(join))();
    else if (query.get('name') === '1') nameSheet(o.profile, username);
  }
}
