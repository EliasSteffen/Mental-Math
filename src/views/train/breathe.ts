// Atempause (E19): ein Atemzyklus von 8 s vor der ersten Aufgabe bzw. vor dem Methoden-Intro.
// Die einzige schleifenartige Animation der App – hier läuft sie genau einmal. Tippen irgendwo überspringt,
// ✕ führt zurück. Bei Reduced Motion: statischer Kreis, Start nach 3 s.
import { h } from '../../ui/dom.ts';
import { button, focusHead } from '../../ui/kit.ts';
import { go } from '../../router.ts';
import { t } from '../../i18n/index.ts';

const CYCLE_MS = 8000;
const STATIC_MS = 3000;

export interface BreatheOptions {
  root: HTMLElement;
  /** „Danach: Prozente · Methode + 5 Aufgaben“ */
  after: string;
  /** Startet die Runde (einmalig, nach Ablauf oder Überspringen) */
  onDone(): void;
}

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Zeigt die Atempause; liefert die Aufräum-Funktion (Timer und Listener), idempotent. */
export function showBreathe({ root, after, onDone }: BreatheOptions): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cleanup = (): void => {
    if (!active) return;
    active = false;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    root.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKey);
  };
  const done = (): void => {
    if (!active) return;
    cleanup();
    onDone();
  };

  const onClick = (e: MouseEvent): void => {
    // ✕ führt zurück (Link), alles andere überspringt
    if (e.target instanceof Element && e.target.closest('.focus-close')) return;
    done();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') { e.preventDefault(); cleanup(); go('#/'); return; }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target instanceof Element && e.target.closest('.focus-close')) return;
    e.preventDefault();
    done();
  };

  const head = focusHead({
    closeLabel: t('train.breatheBack'), href: '#/', title: t('train.breathe'),
    children: [h('span', { class: 'train-breathe-spacer', 'aria-hidden': 'true' })],
  });
  head.classList.add('train-breathe-head');

  const area = h('button', { type: 'button', class: 'train-breathe', 'aria-label': t('train.breatheSkipAria') },
    h('span', { class: 'train-breathe-circle', 'aria-hidden': 'true' },
      h('span', { class: 'train-breathe-track' }),
      h('span', { class: 'train-breathe-ring' }),
      h('span', { class: 'train-breathe-ring is-inner' }),
      h('span', { class: 'train-breathe-dot' })),
    h('span', { class: 'train-breathe-words', 'aria-hidden': 'true' },
      h('span', { class: 'train-breathe-in' }, t('train.breatheIn')),
      h('span', { class: 'train-breathe-out' }, t('train.breatheOut'))));

  root.replaceChildren(
    head,
    h('div', { class: 'stage' }, area),
    h('footer', { class: 'train-breathe-foot' },
      h('p', { class: 'train-breathe-after' }, after),
      button({ label: t('train.breatheSkip'), kind: 'link' })));

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  timer = setTimeout(done, reducedMotion() ? STATIC_MS : CYCLE_MS);
  area.focus({ preventScroll: true });
  return cleanup;
}
