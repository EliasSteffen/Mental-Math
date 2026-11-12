// Seite „Quests“ (#/quests, v10 Q): die drei Tagesquests mit Fortschritt, Countdown bis zu den neuen, Wochenleiste mit drei Truhen.
// Ruhig: Zeilen und Balken, die Truhe öffnet sich mit einem sanften Einblenden (Reduced Motion: sofort).
import { CHEST_FRAME_SWAP_XP, CHEST_FREEZE_SWAP_XP, CHEST_STARS, CHEST_XP, msUntilNextDay, type ChestContents, type ChestTier } from '../core/quests.ts';
import { fmt } from '../core/numbers.ts';
import { currentHabit } from '../features/habit.ts';
import { openChest, questsView, type QuestItem, type QuestsView } from '../features/quests.ts';
import { getSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import { addCleanup, rerender } from '../router.ts';
import { MAX_FREEZES } from '../core/habit.ts';
import { app, h } from '../ui/dom.ts';
import { backLink, button, card, group, icon, largeTitle } from '../ui/kit.ts';
import { progressBar } from '../ui/charts.ts';
import { openSheet } from '../ui/sheet.ts';

const LEVEL_KEY = { 1: 'quests.levelEasy', 2: 'quests.levelMedium', 3: 'quests.levelHard' } as const;
const TIER_KEY = { 1: 'quests.tier1', 2: 'quests.tier2', 3: 'quests.tier3' } as const;

/** „Neue Quests in 5 h 12 min“ */
export function countdownText(now: number): string {
  const min = Math.max(1, Math.ceil(msUntilNextDay(now) / 60_000));
  return min >= 60 ? t('quests.countdown', { h: Math.floor(min / 60), m: min % 60 }) : t('quests.countdownShort', { m: min });
}

function questRow(q: QuestItem): HTMLElement {
  const pct = q.target ? (q.value / q.target) * 100 : 0;
  const finished = q.credited || q.complete;
  return h('li', { class: `quest${finished ? ' is-done' : ''}` },
    h('span', { class: 'quest-mark', 'aria-hidden': 'true' }, finished ? icon('check', 18) : h('span', { class: `quest-level is-${q.level}` })),
    h('div', { class: 'quest-body' },
      h('p', { class: 'quest-title' }, q.title),
      progressBar(pct, { label: q.title }),
      h('p', { class: 'quest-meta' },
        h('span', null, finished ? t('quests.done') : t('quests.progress', { value: q.value, target: q.target })),
        h('span', null, t(LEVEL_KEY[q.level])))),
    h('span', { class: 'quest-xp num' }, t('quests.xp', { xp: fmt(q.xp) })));
}

function chestSub(tier: ChestTier): string {
  const [lo, hi] = CHEST_XP[tier];
  const range = t('quests.chestRange', { lo: fmt(lo), hi: fmt(hi) });
  return tier === 2 ? `${range} ${t('quests.chestFreeze')}` : tier === 3 ? `${range} ${t('quests.chestFrame')}` : range;
}

function chestCard(v: QuestsView, tier: ChestTier, onOpen: () => void): HTMLElement {
  const need = CHEST_STARS[tier - 1] ?? 0;
  const prev = tier > 1 ? (CHEST_STARS[tier - 2] ?? 0) : 0;
  const isOpen = v.opened >= tier;
  const isReady = v.ready === tier;
  const state = isOpen ? 'opened' : isReady ? 'ready' : 'locked';
  const filled = Math.max(0, Math.min(need - prev, v.stars - prev));
  const stars = h('span', { class: 'quest-chest-stars', 'aria-hidden': 'true' },
    ...Array.from({ length: need - prev }, (_, i) => h('span', { class: `quest-star${i < filled ? ' is-on' : ''}` }, icon('star', 14))));
  return h('li', { class: `quest-chest is-${state}` },
    h('span', { class: 'quest-chest-icon', 'aria-hidden': 'true' }, icon(isOpen ? 'check' : 'gift', 26)),
    h('p', { class: 'quest-chest-name' }, t('quests.chestName', { tier: t(TIER_KEY[tier]) })),
    h('p', { class: 'quest-chest-sub' }, chestSub(tier)),
    stars,
    isReady
      ? button({ label: t('quests.chestOpen'), kind: 'primary', icon: 'gift', onClick: onOpen, full: true })
      : h('p', { class: 'quest-chest-state' }, isOpen ? t('quests.chestOpened') : t('quests.chestLocked', { n: need - v.stars })));
}

/** Enthüllung: Inhalt der Truhe, ruhig eingeblendet. */
function reveal(c: ChestContents, hadFreezeRoom: boolean, hadFrame: boolean, onClose: () => void): void {
  const lines: HTMLElement[] = [h('p', { class: 'quest-reveal-xp num' }, t('quests.revealXp', { xp: fmt(c.xp) }))];
  if (c.freeze) lines.push(h('p', { class: 'quest-reveal-item' }, icon('snowflake', 18), h('span', null, t('quests.revealFreeze'))));
  else if (c.tier === 2 && !hadFreezeRoom) lines.push(h('p', { class: 'quest-reveal-note' }, t('quests.revealFreezeFull', { xp: fmt(CHEST_FREEZE_SWAP_XP) })));
  if (c.frame) lines.push(h('p', { class: 'quest-reveal-item' }, icon('trophy', 18), h('span', null, t('quests.revealFrame'))));
  else if (c.tier === 3 && hadFrame) lines.push(h('p', { class: 'quest-reveal-note' }, t('quests.revealFrameOwned', { xp: fmt(CHEST_FRAME_SWAP_XP) })));
  const sheet = openSheet({
    title: t('quests.revealTitle', { tier: t(TIER_KEY[c.tier]) }),
    onClose,
    children: [h('div', { class: 'quest-reveal' },
      h('span', { class: 'quest-reveal-gift', 'aria-hidden': 'true' }, icon('gift', 40)),
      h('div', { class: 'quest-reveal-lines', 'aria-live': 'polite' }, ...lines),
      button({ label: t('quests.revealOk'), kind: 'primary', full: true, onClick: () => sheet.close() }))],
  });
}

export function renderQuests(): void {
  const root = h('div', { class: 'quests' });
  const sub = h('p', { class: 'large-title-sub' });
  const titleEl = largeTitle(t('quests.title'));
  titleEl.prepend(sub);
  let day = '';

  const paint = (): void => {
    const now = Date.now();
    const v = questsView(now);
    day = v.day;
    sub.textContent = countdownText(now);
    const onOpen = (): void => {
      const before = getSettings();
      const room = currentHabit(now).freezes < MAX_FREEZES;
      const hadFrame = before.purchases['frame:chest'] !== undefined;
      const contents = openChest(now);
      paint();
      if (contents) reveal(contents, room, hadFrame, () => undefined);
    };
    root.replaceChildren(
      group({ title: t('quests.todayTitle'), meta: t('quests.todayMeta', { done: v.doneToday }) },
        card([h('ul', { class: 'quest-list' }, ...v.quests.map(questRow))])),
      group({ title: t('quests.weekTitle'), meta: t('quests.weekMeta', { n: v.stars }) },
        card([
          h('p', { class: 'quest-hint' }, t('quests.weekHint')),
          h('ul', { class: 'quest-chests' }, ...([1, 2, 3] as const).map((tier) => chestCard(v, tier, onOpen))),
        ])));
  };

  app.append(backLink({ label: t('quests.back'), href: '#/' }), titleEl, root);
  paint();
  // Countdown nachführen; um Mitternacht neue Quests zeichnen
  const timer = window.setInterval(() => {
    const now = Date.now();
    if (new Date(now).getDate() !== Number(day.slice(8))) { rerender({ keepScroll: true }); return; }
    sub.textContent = countdownText(now);
  }, 30_000);
  addCleanup(() => window.clearInterval(timer));
}
