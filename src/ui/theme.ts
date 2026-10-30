// Theme handling: 'system' | 'neon' | 'oled' | 'pastel'
import type { Theme, ThemeSetting } from '../types.ts';

const BG: Record<Theme, string> = { neon: '#121214', oled: '#000000', pastel: '#F8F9FA' };
let mq: MediaQueryList | null = null;
let current: ThemeSetting = 'system';

function resolve(setting: ThemeSetting): Theme {
  if (setting === 'neon' || setting === 'oled' || setting === 'pastel') return setting;
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'neon' : 'pastel';
}

export function applyTheme(setting: ThemeSetting = 'system'): void {
  current = setting;
  const t = resolve(setting);
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BG[t]);
}

export function initTheme(setting: ThemeSetting): void {
  applyTheme(setting);
  if (typeof matchMedia !== 'function' || mq) return;
  mq = matchMedia('(prefers-color-scheme: dark)');
  const on = (): void => { if (current === 'system') applyTheme('system'); };
  if (mq.addEventListener) mq.addEventListener('change', on);
  else if ('addListener' in mq) (mq as MediaQueryList).addListener(on);
}
