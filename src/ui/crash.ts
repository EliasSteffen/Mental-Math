// Fehlerkarte statt leerer Seite: Wirft das Zeichnen einer Ansicht, zeigt der Router diese Karte (router.ts → render).
// Mit Fehlerbericht (Meldung, Stack-Auszug, Version, Route, Browser) zum Kopieren, „Erneut versuchen“ und Cache-Reset.
// Bewusst mit wenigen Abhängigkeiten, damit sie auch dann noch steht, wenn Teile der App kaputt sind.
import { BUILD_INFO } from '../generated/build-info.ts';
import { t } from '../i18n/index.ts';
import { resetAppCache, shareText } from '../platform/index.ts';
import { h } from './dom.ts';
import { toast } from './toast.ts';

/** Fehlerbericht als Text (für Screenshot und Zwischenablage). */
export function crashReport(error: unknown, where: string): string {
  const e = error instanceof Error ? error : new Error(String(error));
  const head = `${e.name}: ${e.message}`;
  // Chrome wiederholt die Meldung als erste Stack-Zeile, Safari nicht
  const stack = (e.stack ?? '').split('\n').map((l) => l.trim()).filter((l) => l && l !== head).slice(0, 8).join('\n');
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return [
    head,
    stack,
    `Version ${BUILD_INFO.version} (${BUILD_INFO.build}, ${BUILD_INFO.channel ?? 'production'}) · ${where}`,
    ua,
  ].filter(Boolean).join('\n');
}

/** Karte in `root` zeichnen; `retry` zeichnet die Seite erneut. */
export function renderCrash(root: HTMLElement, error: unknown, where: string, retry: () => void): void {
  const report = crashReport(error, where);
  const btn = (label: string, onClick: () => void, primary = false): HTMLButtonElement =>
    h('button', { type: 'button', class: `btn ${primary ? 'primary' : 'outline'} is-full press`, onclick: onClick }, h('span', { class: 'btn-label' }, label));
  root.replaceChildren(
    h('section', { class: 'crash', role: 'alert' },
      h('h1', { class: 'crash-title' }, t('common.crashTitle')),
      h('p', { class: 'crash-text' }, t('common.crashText')),
      h('pre', { class: 'crash-report' }, report),
      btn(t('common.crashRetry'), retry, true),
      btn(t('common.crashCopy'), () => {
        void shareText(report).then((r) => { if (r === 'copied') toast(t('common.crashCopied'), { kind: 'success' }); });
      }),
      btn(t('common.crashReset'), () => { void resetAppCache(); }),
      h('p', { class: 'crash-help' }, t('common.crashResetHelp'))));
}
