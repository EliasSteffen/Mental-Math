// „Was ist neu?“ – Modal nach einem Versionsupdate und vollständiger Changelog.
import type { Release, ReleaseNote } from '../types.ts';
import { getLang, locale, t } from '../i18n/index.ts';
import { BUILD_INFO } from '../generated/build-info.ts';
import { RELEASES, releasesSince } from '../releases.ts';
import { getAttempts, getSettings, setSettings } from '../data/storage.ts';
import { h } from '../ui/dom.ts';
import { openModal } from '../ui/modal.ts';

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

export function maybeShowWhatsNew(): void {
  const seen: string = getSettings().lastSeenVersion;
  if (seen === BUILD_INFO.version) return;
  if (seen === '' && getAttempts().length === 0) {
    setSettings({ lastSeenVersion: BUILD_INFO.version });
    return;
  }
  const list: Release[] = releasesSince(seen).slice(0, MAX_SHOWN);
  const remember = (): void => { setSettings({ lastSeenVersion: BUILD_INFO.version }); };
  if (list.length === 0) { remember(); return; }
  openModal({
    title: t('release.whatsNew', { version: BUILD_INFO.version }),
    body: body(list),
    actions: [{ label: t('release.letsGo'), primary: true }],
    onClose: remember,
  });
}

export function openChangelog(): void {
  openModal({
    title: t('release.history'),
    body: h('div', { class: 'releases' }, ...RELEASES.map(releaseBlock)),
    actions: [{ label: t('release.close'), primary: true }],
  });
}
