// Einmaliger Hinweis nach dem Update (Logik in core/nav-hint.ts): ruhige Sprechblase am Liga-Emblem oben rechts bzw. am
// Seitenleisten-Eintrag „Profil“ (ab 720 px). „OK“ merkt ihn geräte-lokal; bis dahin erscheint er bei jedem Start wieder.
import { h } from './dom.ts';
import { t } from '../i18n/index.ts';
import { getAttempts, getSettings } from '../data/storage.ts';
import { markNavHintSeen, navHintTarget, readNavHintSeen, shouldShowNavHint } from '../core/nav-hint.ts';

let shown: HTMLElement | null = null;

const isWide = (): boolean => typeof matchMedia === 'function' && matchMedia('(min-width: 720px)').matches;

function visible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function dismissNavHint(): void {
  shown?.remove();
  shown = null;
}

/** Nach jedem Zeichnen einer Seite aufrufen: zeigt den Hinweis, sobald alle Bedingungen passen; sonst still. */
export function maybeShowNavHint(focus: boolean): void {
  if (shown && !shown.isConnected) shown = null;
  if (shown) dismissNavHint(); // neue Seite: neu verankern (oder gar nicht, etwa im Fokus-Modus)
  const wide = isWide();
  const target = document.querySelector(navHintTarget(wide));
  const ok = shouldShowNavHint({
    seen: readNavHintSeen(),
    onboardingDone: getSettings().onboardingDone,
    attempts: getAttempts().length,
    focus,
    // Auch kein Toast: Der Hinweis-Toast für Bestandsnutzer läge sonst über „OK“ (gleicher Start)
    dialogOpen: document.querySelector('dialog[open], .sheet, .tour-ui, .toast') !== null,
    tourRunning: document.documentElement.dataset['tour'] !== undefined,
    targetVisible: visible(target),
  });
  if (!ok || !visible(target)) return;

  const r = target.getBoundingClientRect();
  const okBtn = h('button', { type: 'button', class: 'btn primary nav-hint-ok' }, t('common.navHintOk'));
  const el = h('div', { class: `nav-hint${wide ? ' is-side' : ''}`, role: 'status' },
    h('p', { class: 'nav-hint-text' }, t(wide ? 'common.navHintTextSide' : 'common.navHintText')), okBtn);
  // Telefon: unter dem Emblem, rechtsbündig; iPad: rechts neben dem Seitenleisten-Eintrag, an dessen Unterkante
  el.style.setProperty('--hint-top', `${Math.round(wide ? r.bottom : r.bottom + 10)}px`);
  el.style.setProperty('--hint-left', `${Math.round(r.right + 12)}px`);
  okBtn.addEventListener('click', () => { markNavHintSeen(); dismissNavHint(); });
  document.body.append(el);
  shown = el;
}
