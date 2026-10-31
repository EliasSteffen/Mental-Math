// Parallel · Stream (Fokus-Modus): Ketten-Karten mit den letzten Schritten als Tokens, Restzeit als Zeitlinie.
// Ruhig: Karten leuchten kurz per Farbübergang auf, neue Schritte und Karten blenden einmal ein (rise, 320 ms).
import type { ParallelChain, ParallelConfig, ParallelState } from '../../types.ts';
import { createParallelState, tick } from '../../core/parallel.ts';
import { app, h, appendChildren } from '../../ui/dom.ts';
import { focusHead, timeLine } from '../../ui/kit.ts';
import { haptic } from '../../ui/fx.ts';
import { setTitle } from '../../ui/title.ts';
import { t } from '../../i18n/index.ts';

const PULSE_MS = 900;
const BADGE_MS = 3500;
const RECENT_COUNT = 3;
/** Takt der Zeitlinie (wie im Training): seltener nachführen, die CSS-Transition glättet linear */
const LINE_TICK_MS = 250;

interface CardRefs {
  root: HTMLElement;
  main: HTMLElement;
  tokens: HTMLElement;
  pulseTimer: number | null;
}

function startValue(chain: ParallelChain): string {
  return (chain.history[0] ?? '').replace(/^Start\s*/, '');
}

/** Die letzten Schritte einer Kette als Tokens; der jüngste ist hervorgehoben. */
function recentTokens(chain: ParallelChain): HTMLElement[] {
  const labels = chain.history.slice(-RECENT_COUNT);
  return labels.map((label, i) => h('span', { class: i === labels.length - 1 ? 'play-token is-last' : 'play-token' }, label));
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
  let lastLineTick = -1;

  const grid = h('div', { class: 'play-cards' });
  const line = timeLine();
  const secs = h('span', { class: 'num' });
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const paused = h('p', { class: 'play-paused', hidden: true }, t('parallel.paused'));

  const later = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };

  const addCard = (chain: ParallelChain, isNew: boolean): void => {
    const main = h('p', { class: 'play-card-main num is-start' }, startValue(chain));
    const tokens = h('div', { class: 'play-tokens num', 'aria-hidden': 'true' });
    const badge = isNew ? h('span', { class: 'play-badge' }, t('parallel.badgeNew')) : null;
    const root = h('article', { class: `play-card${isNew ? ' rise' : ''}`, 'aria-label': t('parallel.chain', { id: chain.id }) },
      h('div', { class: 'play-card-head' }, h('span', { class: 'play-card-id' }, t('parallel.chain', { id: chain.id })), badge),
      main, tokens);
    grid.append(root);
    cards.set(chain.id, { root, main, tokens, pulseTimer: null });
    if (badge) later(() => badge.remove(), BADGE_MS);
  };

  const pulse = (chain: ParallelChain, label: string): void => {
    const refs = cards.get(chain.id);
    if (!refs) return;
    if (refs.pulseTimer !== null) { clearTimeout(refs.pulseTimer); timers.delete(refs.pulseTimer); }
    refs.main.className = 'play-card-main num is-op';
    // Neues Element je Schritt: blendet einmal ein, auch wenn derselbe Schritt zweimal hintereinander kommt
    refs.main.replaceChildren(h('span', { class: 'rise' }, label));
    refs.root.classList.add('is-pulse');
    refs.tokens.replaceChildren(...recentTokens(chain));
    refs.pulseTimer = later(() => {
      refs.pulseTimer = null;
      refs.root.classList.remove('is-pulse');
      refs.main.className = 'play-card-main num is-idle';
      refs.main.textContent = '·';
    }, PULSE_MS);
  };

  const updateTime = (): void => {
    const elapsed = config.durationMs - state.remainingMs;
    const lineTick = Math.floor(elapsed / LINE_TICK_MS);
    if (lineTick !== lastLineTick) {
      lastLineTick = lineTick;
      line.set(config.durationMs > 0 ? elapsed / config.durationMs : 1, false);
    }
    const s = Math.max(0, Math.ceil(state.remainingMs / 1000));
    if (s !== lastSecond) {
      lastSecond = s;
      secs.textContent = t('common.sec', { n: s });
      setTitle(t('common.secCompact', { n: s }));
    }
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
      haptic('tap');
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

  const header = focusHead({
    title: t('parallel.title'), shortTitle: t('parallel.titleShort'),
    children: [h('p', { class: 'play-time' }, h('span', { class: 'sr-only' }, `${t('parallel.timeLeft')} `), secs)],
  });
  header.append(line.el);

  app.replaceChildren();
  appendChildren(app, [header, h('div', { class: 'stage play-stream' }, grid, paused), status]);
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
