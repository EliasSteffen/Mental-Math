// „Was ist neu?“ – Modal nach einem Versionsupdate und vollständiger Changelog.
import type { Release, ReleaseNote } from '../types.ts';
import { getLang, locale, t } from '../i18n/index.ts';
import { BUILD_INFO } from '../generated/build-info.ts';
import { RELEASES, releasesSince } from '../releases.ts';
import { getAttempts, getSettings, setSettings } from '../data/storage.ts';
import { h } from '../ui/dom.ts';
import { openModal } from '../ui/modal.ts';
import { toast } from '../ui/toast.ts';
import { liveUpdatedTo } from '../platform/index.ts';

const MAX_SHOWN = 3;

/** Einzige Stelle der Sprachwahl: aktuelle Sprache. */
function noteText(n: ReleaseNote): string {
  return n[getLang()];
}

/** 'YYYY-MM-DD' lokalisiert (lokales Datum, ohne Zeitzonen-Versatz). */
export function fmtIsoDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function releaseBlock(r: Release): HTMLElement {
  return h('section', { class: 'release' },
    h('h3', {}, t('release.version', { version: r.version, date: fmtIsoDate(r.date) })),
    h('p', { class: 'release-title' }, noteText(r.title)),
    h('ul', {}, ...r.highlights.map((hl) => h('li', {}, noteText(hl)))),
  );
}

function body(releases: Release[]): HTMLElement {
  return h('div', { class: 'releases' }, ...releases.map(releaseBlock));
}

/** Modal „Was ist neu in …?“ für die Releases seit `seen` (ohne neue: ganzer Verlauf). */
function openWhatsNew(seen: string, onClose?: () => void): void {
  const list: Release[] = releasesSince(seen).slice(0, MAX_SHOWN);
  if (list.length === 0) { openChangelog(); onClose?.(); return; }
  const tour = list.find((r) => r.tour)?.tour;
  let wantsTour = false;
  openModal({
    title: t('release.whatsNew', { version: BUILD_INFO.version }),
    body: body(list),
    actions: tour
      ? [{ label: t('release.later') }, { label: t('release.showMe'), primary: true, onClick: () => { wantsTour = true; } }]
      : [{ label: t('release.letsGo'), primary: true }],
    // Erst nach dem Schließen: onClose merkt sich die Version noch in den echten Daten
    onClose: () => {
      onClose?.();
      if (tour && wantsTour) void import('./tour.ts').then((m) => { m.startTour(tour); });
    },
  });
}

export function maybeShowWhatsNew(): void {
  const seen: string = getSettings().lastSeenVersion;
  // iOS-App, erster Start nach einem Live-Update: kurze Bestätigung statt Modal, „Was ist neu?“ auf Wunsch
  const live = liveUpdatedTo();
  if (live !== null) {
    setSettings({ lastSeenVersion: BUILD_INFO.version });
    toast(t('common.liveUpdateDone', { version: live }), {
      kind: 'success', durationMs: 8000,
      action: { label: t('common.liveUpdateWhatsNew'), onClick: () => openWhatsNew(seen) },
    });
    return;
  }
  if (seen === BUILD_INFO.version) return;
  if (seen === '' && getAttempts().length === 0) {
    setSettings({ lastSeenVersion: BUILD_INFO.version });
    return;
  }
  const remember = (): void => { setSettings({ lastSeenVersion: BUILD_INFO.version }); };
  if (releasesSince(seen).length === 0) { remember(); return; }
  openWhatsNew(seen, remember);
}

export function openChangelog(): void {
  openModal({
    title: t('release.history'),
    body: h('div', { class: 'releases' }, ...RELEASES.map(releaseBlock)),
    actions: [{ label: t('release.close'), primary: true }],
  });
}
