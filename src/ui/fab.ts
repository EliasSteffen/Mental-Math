// Floating Action Buttons für Ergebnisseiten (Nochmal / Übersicht).
// Blendet sich beim Runterscrollen aus, beim Hochscrollen/Stillstand/Seitenende ein.
import { h } from './dom.ts';

export interface FabAction { label: string; onClick: () => void; primary?: boolean }
export interface FabBar { el: HTMLElement; destroy(): void }

const IDLE_MS = 150;
const BOTTOM_SLACK = 20;

export function createFabBar(actions: FabAction[]): FabBar {
  const buttons = actions.map((a) => h('button', {
    type: 'button', class: `btn fab-btn${a.primary ? ' primary' : ''}`, onclick: a.onClick,
  }, a.label));
  const el = h('div', { class: 'fab-bar', role: 'group', 'aria-label': 'Aktionen' }, ...buttons);

  let hidden = false;
  let lastY = window.scrollY;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let raf: number | null = null;
  let destroyed = false;

  const setHidden = (value: boolean): void => {
    if (value === hidden) return;
    hidden = value;
    el.classList.toggle('is-hidden', value);
    if (value) el.setAttribute('aria-hidden', 'true');
    else el.removeAttribute('aria-hidden');
    for (const b of buttons) b.tabIndex = value ? -1 : 0;
  };

  const atBottom = (): boolean =>
    window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - BOTTOM_SLACK;

  const process = (): void => {
    raf = null;
    if (destroyed) return;
    const y = window.scrollY;
    if (atBottom() || y < lastY) setHidden(false);
    else if (y > lastY) setHidden(true);
    lastY = y;
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { idleTimer = null; if (!destroyed) setHidden(false); }, IDLE_MS);
  };

  const onScroll = (): void => {
    if (raf === null) raf = requestAnimationFrame(process);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  document.body.append(el);
  document.body.classList.add('has-fab');

  return {
    el,
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
      if (idleTimer !== null) { clearTimeout(idleTimer); idleTimer = null; }
      el.remove();
      document.body.classList.remove('has-fab');
    },
  };
}
