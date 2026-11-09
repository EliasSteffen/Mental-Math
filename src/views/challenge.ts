// Seite einer gewerteten Challenge (#/challenge/<id>): Regeln, öffentlicher Name, Start des einen Versuchs,
// danach Ergebnis mit Platz, Rangliste und ungewertetes Nachspielen. Die Runde selbst ist die Trainings-Ansicht.
import type { ChallengeInfo, PublicProfile } from '../core/challenge.ts';
import { dayOfDailyId } from '../core/challenge.ts';
import { LEVEL_NAMES } from '../core/catalog.ts';
import { CATEGORIES } from '../core/catalog.ts';
import { accountEnabled, getAccountState, onAccountChange } from '../features/account.ts';
import {
  challengeErrorCode, finishAttempt, loadChallenge, loadProfile, loadReview, pendingAttempt, startAttempt, submitEmpty,
} from '../features/challenge.ts';
import { t } from '../i18n/index.ts';
import { addCleanup, go, rerender } from '../router.ts';
import { app, h } from '../ui/dom.ts';
import { button, card, group, insight, largeTitle, list, row, steps } from '../ui/kit.ts';
import { setPrimaryAction, setShell } from '../ui/shell.ts';
import { toast } from '../ui/toast.ts';
import { setTitle } from '../ui/title.ts';
import { openAccountOnProfile } from './settings.ts';
import { renderTrain } from './train/index.ts';
import { challengeTitle, errorText, notice, participantsText, profileForm, resultInsight, whenLine } from './compete-ui.ts';

function usernameOf(): string {
  const st = getAccountState();
  return st.status === 'signed-in' ? st.user.username : '';
}

function back(): HTMLElement {
  return button({ label: t('compete.backToHub'), kind: 'link', icon: 'chevron-left', href: '#/wettbewerbe' });
}

function meta(c: ChallengeInfo): string {
  const cats = c.categories
    ? c.categories.map((id) => CATEGORIES.find((x) => x.id === id)?.name ?? id).join(', ')
    : t('compete.allCategories');
  return [t('compete.tasksCount', { n: c.count }), LEVEL_NAMES[c.level], cats].join(' · ');
}

/** Ungewertet mit denselben Aufgaben üben (nach dem eigenen Versuch bzw. nach dem Ende). */
async function practiceSame(id: string, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true;
  try {
    const { tasks } = await loadReview(id);
    if (!tasks.length) throw new Error('empty');
    sessionStorage.setItem('mm.retry', JSON.stringify(tasks));
    go('#/train/retry');
  } catch (e) {
    toast(e instanceof Error && e.message === 'empty' ? t('train.notPossible') : errorText(e), { kind: 'error' });
  } finally {
    btn.disabled = false;
  }
}

export function renderChallenge(id: string): void {
  const disposers: Array<() => void> = [];
  const dispose = (): void => { for (const d of disposers.splice(0)) d(); };
  addCleanup(dispose);
  let alive = true;
  disposers.push(() => { alive = false; });
  const isDaily = dayOfDailyId(id) !== null;

  const paint = (...children: Array<Node | null>): void => {
    app.replaceChildren(back(), ...children.filter((c): c is Node => c !== null));
  };
  const loading = (): void => paint(largeTitle(t('compete.title')), notice(t('compete.loading')));

  // Ohne Konto: erklären, anmelden oder ungewertet üben
  const st = getAccountState();
  if (!accountEnabled() || st.status === 'disabled') {
    paint(largeTitle(t('compete.title')), notice(t('compete.noAccountBuild')),
      isDaily ? button({ label: t('compete.practiceUnranked'), kind: 'soft', href: '#/train/daily' }) : null);
    return;
  }
  if (st.status === 'loading') {
    loading();
    disposers.push(onAccountChange(() => { if (alive) rerender(); }));
    return;
  }
  if (st.status !== 'signed-in') {
    paint(
      largeTitle(t('compete.title'), st.status === 'offline' ? t('compete.offline') : undefined),
      card([
        h('p', { class: 'compete-text' }, t('compete.needAccount')),
        button({ label: t('compete.createAccount'), kind: 'primary', full: true, cta: false, onClick: openAccountOnProfile }),
      ]),
      isDaily ? button({ label: t('compete.practiceUnranked'), kind: 'soft', href: '#/train/daily' }) : null,
    );
    disposers.push(onAccountChange(() => { if (alive) rerender(); }));
    return;
  }

  loading();
  void Promise.all([loadChallenge(id), loadProfile()]).then(([c, profile]) => {
    if (alive) draw(c, profile);
  }, (e: unknown) => {
    if (!alive) return;
    const code = challengeErrorCode(e);
    paint(largeTitle(t('compete.title')), notice(errorText(e), code === 'not_found' ? undefined : { label: t('compete.retry'), onClick: () => rerender() }),
      isDaily ? button({ label: t('compete.practiceUnranked'), kind: 'soft', href: '#/train/daily' }) : null);
  });

  function draw(c: ChallengeInfo, profile: PublicProfile | null): void {
    const title = challengeTitle(c);
    setTitle(title);
    const head = largeTitle(title, [c.groupName, whenLine(c)].filter(Boolean).join(' · '));
    const facts = list([
      row({ icon: 'target', label: meta(c) }),
      row({ icon: 'person', label: participantsText(c.participants) }),
    ]);
    const boardBtn = button({ label: t('compete.toBoard'), kind: 'soft', icon: 'trophy', href: `#/rangliste?id=${encodeURIComponent(c.id)}` });

    if (c.state === 'done' && c.result) {
      const practice = button({ label: t('compete.practiceAgain'), kind: 'outline', icon: 'refresh' });
      practice.addEventListener('click', () => { void practiceSame(c.id, practice); });
      paint(head, resultInsight(c.result), facts, h('div', { class: 'compete-actions' }, boardBtn, practice));
      return;
    }
    if (c.state === 'running') {
      const local = pendingAttempt();
      if (local?.id === c.id) {
        // Abgabe hängt (kein Netz): erneut versuchen
        const retry = button({ label: t('compete.submitNow'), kind: 'primary', full: true, cta: false });
        retry.addEventListener('click', () => {
          retry.disabled = true;
          void finishAttempt(c.id).then((r) => { if (r) rerender(); else { retry.disabled = false; toast(t('compete.pendingText')); } });
        });
        paint(head, insight({ icon: 'sync', tone: 'warn', title: t('compete.pendingTitle'), text: t('compete.pendingText') }), retry);
      } else {
        const end = button({ label: t('compete.endAttempt'), kind: 'primary', full: true, cta: false });
        end.addEventListener('click', () => {
          end.disabled = true;
          void submitEmpty(c.id).then(() => rerender(), (e: unknown) => { end.disabled = false; toast(errorText(e), { kind: 'error' }); });
        });
        paint(head, insight({ icon: 'info', tone: 'warn', title: t('compete.runningElsewhere'), text: t('compete.runningElsewhereText') }), end);
      }
      return;
    }
    if (c.state === 'upcoming') {
      paint(head, notice(t('compete.notYet', { when: whenLine(c) })), facts);
      return;
    }
    if (c.state === 'closed') {
      const practice = button({ label: t('compete.practiceAgain'), kind: 'outline', icon: 'refresh' });
      practice.addEventListener('click', () => { void practiceSame(c.id, practice); });
      paint(head, notice(t('compete.closedText')), facts, h('div', { class: 'compete-actions' }, boardBtn, practice));
      return;
    }

    // Offen: Regeln, Name (beim ersten Mal) und Start
    const rules = group(t('compete.rulesTitle'), card([steps([
      t('compete.rule1'), t('compete.rule2'), t('compete.rule3'), t('compete.rule4'),
    ])]));
    const nameBox = profile
      ? row({ icon: 'person', label: profile.displayName, sub: profile.listed ? t('compete.listedOn') : t('compete.listedOff'), href: '#/wettbewerbe?name=1' })
      : group(t('compete.nameTitle'), card([
        h('p', { class: 'compete-text' }, t('compete.nameIntro')),
        profileForm({
          profile: null, suggestion: usernameOf(),
          submitLabel: t('compete.saveName'),
          onSaved: () => { toast(t('compete.nameSaved'), { kind: 'success' }); rerender({ keepScroll: true }); },
        }),
      ]));
    paint(head, facts, rules, nameBox, profile ? boardBtn : null);

    let starting = false;
    const start = async (): Promise<void> => {
      if (starting) return;
      starting = true;
      try {
        const s = await startAttempt(c.id);
        if (!alive) return;
        dispose();
        setPrimaryAction(null);
        setShell(null);
        renderTrain(isDaily ? 'daily' : 'challenge', {
          ranked: {
            id: c.id, mode: isDaily ? 'daily' : 'challenge', title, tasks: s.tasks,
            onAbort: () => { void finishAttempt(c.id).finally(() => go(`#/challenge/${c.id}`)); },
          },
        });
      } catch (e) {
        starting = false;
        const code = challengeErrorCode(e);
        if (code === 'already_played' || code === 'closed' || code === 'upcoming') rerender();
        else toast(errorText(e), { kind: 'error' });
      }
    };
    if (profile) setPrimaryAction({ label: t('compete.start'), meta: t('compete.oneAttempt'), icon: 'play', onClick: () => { void start(); } });
  }
}
