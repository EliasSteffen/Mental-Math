// Theme handling: 'system' | 'neon' | 'oled' | 'pastel'
const BG = { neon: '#121214', oled: '#000000', pastel: '#F8F9FA' };
let mq = null;
let current = 'system';

function resolve(setting) {
  if (setting === 'neon' || setting === 'oled' || setting === 'pastel') return setting;
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'neon' : 'pastel';
}

export function applyTheme(setting = 'system') {
  current = setting;
  const t = resolve(setting);
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BG[t]);
}

export function initTheme(setting) {
  applyTheme(setting);
  if (typeof matchMedia !== 'function' || mq) return;
  mq = matchMedia('(prefers-color-scheme: dark)');
  const on = () => { if (current === 'system') applyTheme('system'); };
  if (mq.addEventListener) mq.addEventListener('change', on);
  else if (mq.addListener) mq.addListener(on);
}
