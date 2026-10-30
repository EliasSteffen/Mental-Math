import type { ParallelChain, ParallelConfig, ParallelState } from '../../types.ts';
import { createParallelState, tick } from '../../core/parallel.ts';
import { getSettings } from '../../data/storage.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { setTitle } from '../../ui/title.ts';
import { t } from '../../i18n/index.ts';

const PULSE_MS = 900;
const BADGE_MS = 3500;
const RECENT_COUNT = 3;

interface CardRefs {
  root: HTMLElement;
  main: HTMLElement;
  recent: HTMLElement;
  pulseTimer: number | null;
}

function startValue(chain: ParallelChain): string {
  return (chain.history[0] ?? '').replace(/^Start\s*/, '');
}

function recentChips(chain: ParallelChain): HTMLElement[] {
  const labels = chain.history.slice(-RECENT_COUNT);
  return labels.map((label, i) => h('span', { class: i === labels.length - 1 ? 'pl-chip is-last' : 'pl-chip' }, label));
}

export function renderStream(config: ParallelConfig, onDone: (state: ParallelState) => void): () => void {
  let state = createParallelState(config);
  const cards = new Map<string, CardRefs>();
  const timers = new Set<number>();
  let raf: number | null = null;
  let finished = false;
  let hiddenAt: number | null = null;
  let pausedTotal = 0;
  let startTs = performance.now();
  let lastSecond = -1;

  const grid = h('div', { class: 'pl-grid' });
  const fill = h('div', { class: 'pl-time-fill' });
  const secs = h('span', { class: 'pl-secs' });
  const status = h('div', { class: 'pl-sr', 'aria-live': 'polite' });
  const paused = h('div', { class: 'pl-paused', hidden: true }, t('parallel.paused'));

  const later = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };

  const buzz = (): void => {
    if (!getSettings().haptics || typeof navigator === 'undefined' || !navigator.vibrate) return;
    try { navigator.vibrate(10); } catch { /* ignore */ }
  };

  const addCard = (chain: ParallelChain, isNew: boolean): void => {
    const main = h('div', { class: 'pl-main is-start' }, startValue(chain));
    const recent = h('div', { class: 'pl-recent', 'aria-hidden': 'true' });
    const badge = isNew ? h('span', { class: 'pl-badge' }, t('parallel.badgeNew')) : null;
    const root = h('article', { class: 'pl-card', 'aria-label': t('parallel.chain', { id: chain.id }) },
      h('div', { class: 'pl-card-head' }, h('span', { class: 'pl-id' }, t('parallel.chain', { id: chain.id })), badge),
      main, recent);
    grid.append(root);
    cards.set(chain.id, { root, main, recent, pulseTimer: null });
    if (badge) later(() => badge.remove(), BADGE_MS);
  };

  const pulse = (chain: ParallelChain, label: string): void => {
    const refs = cards.get(chain.id);
    if (!refs) return;
    if (refs.pulseTimer !== null) { clearTimeout(refs.pulseTimer); timers.delete(refs.pulseTimer); }
    refs.main.textContent = label;
    refs.main.className = 'pl-main is-op';
    refs.root.classList.remove('is-pulse');
    void refs.root.offsetWidth; // Animation neu starten
    refs.root.classList.add('is-pulse');
    refs.recent.replaceChildren(...recentChips(chain));
    refs.pulseTimer = later(() => {
      refs.pulseTimer = null;
      refs.root.classList.remove('is-pulse');
      refs.main.textContent = '·';
      refs.main.className = 'pl-main is-idle';
    }, PULSE_MS);
  };

  const updateTime = (): void => {
    const ratio = Math.max(0, Math.min(1, state.remainingMs / config.durationMs));
    fill.style.setProperty('--pl-ratio', String(ratio));
    const s = Math.max(0, Math.ceil(state.remainingMs / 1000));
    if (s !== lastSecond) { lastSecond = s; secs.textContent = t('common.sec', { n: s }); setTitle(t('common.secCompact', { n: s })); }
  };

  const finish = (delay: number): void => {
    finished = true;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    later(() => onDone(state), delay);
  };

  const frame = (now: number): void => {
    raf = requestAnimationFrame(frame);
    const r = tick(state, now - startTs - pausedTotal);
    state = r.state;
    if (r.addedChain) addCard(r.addedChain, true);
    if (r.event) {
      const ev = r.event;
      const chain = state.chains.find((c) => c.id === ev.chainId);
      if (chain) pulse(chain, ev.label);
      status.textContent = t('parallel.chainStatus', { id: ev.chainId, label: ev.label });
      buzz();
    }
    updateTime();
    if (r.ended) finish(r.event ? PULSE_MS : 0);
  };

  const onVisibility = (): void => {
    if (finished) return;
    if (document.hidden) {
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      hiddenAt = performance.now();
      paused.hidden = false;
    } else if (hiddenAt !== null) {
      pausedTotal += performance.now() - hiddenAt;
      hiddenAt = null;
      paused.hidden = true;
      raf = requestAnimationFrame(frame);
    }
  };

  app.replaceChildren();
  appendChildren(app, [h('div', { class: 'parallel' },
    h('a', { class: 'back-link', href: '#/' }, t('common.cancelLink')),
    h('div', { class: 'pl-time', role: 'progressbar', 'aria-label': t('parallel.timeLeft') }, h('div', { class: 'pl-time-track' }, fill), secs),
    grid, paused, status)]);
  for (const chain of state.chains) addCard(chain, false);
  updateTime();

  document.addEventListener('visibilitychange', onVisibility);
  startTs = performance.now();
  raf = requestAnimationFrame(frame);

  return (): void => {
    finished = true;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    for (const id of timers) clearTimeout(id);
    timers.clear();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
