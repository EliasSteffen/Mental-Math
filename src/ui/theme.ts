// Theme-Logik (Ruhiger Fokus): 'system' | 'paper' | 'night' | 'oled' | 'aurora' | 'neon'.
// Reine Funktionen (resolveTheme, themeMeta) sind ohne DOM testbar; applyTheme/initTheme setzen <html data-theme> und Metas.
import type { Theme, ThemeSetting } from '../types.ts';
import { t } from '../i18n/index.ts';

type ThemeLabelKey = 'common.themeSystem' | 'common.themePaper' | 'common.themeNight' | 'common.themeOled'
  | 'common.themeAurora' | 'common.themeNeon';

/** Alle Theme-Einstellungen mit i18n-Schlüssel (Reihenfolge wie im Profil). Profil zeigt OLED als Switch (E2). */
export const THEMES: ReadonlyArray<{ readonly value: ThemeSetting; readonly label: ThemeLabelKey }> = [
  { value: 'system', label: 'common.themeSystem' },
  { value: 'paper', label: 'common.themePaper' },
  { value: 'night', label: 'common.themeNight' },
  { value: 'oled', label: 'common.themeOled' },
  { value: 'aurora', label: 'common.themeAurora' },
  { value: 'neon', label: 'common.themeNeon' },
];

/** Übersetzter Name einer Theme-Einstellung. */
export function themeLabel(value: ThemeSetting): string {
  return t(THEMES.find((x) => x.value === value)?.label ?? 'common.themeSystem');
}

/** --bg je Theme (für die Meta theme-color, identisch mit tokens.css). */
const BG: Record<Theme, string> = { paper: '#F6F4EF', night: '#141619', oled: '#000000', aurora: '#0B0A14', neon: '#08090A' };

/** Einstellung → konkretes Theme. 'system' folgt prefers-color-scheme: hell → Papier, dunkel → Nacht. */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): Theme {
  if (setting === 'system') return prefersDark ? 'night' : 'paper';
  return setting;
}

/** Metadaten eines Themes: Browserleiste (= --bg) und color-scheme (hell nur bei Papier). */
export function themeMeta(theme: Theme): { color: string; scheme: 'light' | 'dark' } {
  return { color: BG[theme], scheme: theme === 'paper' ? 'light' : 'dark' };
}

let mq: MediaQueryList | null = null;
let current: ThemeSetting = 'system';

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Wendet eine Theme-Einstellung an: data-theme auf <html>, Meta theme-color und color-scheme. Rückgabe: das aufgelöste Theme. */
export function applyTheme(setting: ThemeSetting = 'system'): Theme {
  current = setting;
  const theme = resolveTheme(setting, prefersDark());
  const meta = themeMeta(theme);
  document.documentElement.setAttribute('data-theme', theme);
  // index.html hat je eine theme-color für hell/dunkel; beide bekommen den aufgelösten Wert
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', meta.color));
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', meta.scheme);
  return theme;
}

/** Aktuelle Einstellung (nicht aufgelöst). */
export function getThemeSetting(): ThemeSetting { return current; }

export function initTheme(setting: ThemeSetting): void {
  applyTheme(setting);
  if (typeof matchMedia !== 'function' || mq) return;
  mq = matchMedia('(prefers-color-scheme: dark)');
  const on = (): void => { if (current === 'system') applyTheme('system'); };
  if (mq.addEventListener) mq.addEventListener('change', on);
  else if ('addListener' in mq) (mq as MediaQueryList).addListener(on);
}
