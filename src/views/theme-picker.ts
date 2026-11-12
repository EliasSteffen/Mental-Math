// Theme-Auswahl im Profil (v10 P): Kacheln mit Farbvorschau. Gekaufte Themes sind wählbar, die übrigen zeigen Schloss und Preis
// und führen zum Shop (#/erfolge/shop). OLED bleibt der Schalter „Reines Schwarz“ darunter (settings.ts).
import { fmt } from '../core/numbers.ts';
import { isPremiumTheme, ownsItem, shopItem, themeItemId } from '../core/shop.ts';
import { getSettings } from '../data/storage.ts';
import { t } from '../i18n/index.ts';
import type { ThemeSetting } from '../types.ts';
import { h } from '../ui/dom.ts';
import { icon } from '../ui/kit.ts';
import { themeLabel } from '../ui/theme.ts';
import { go } from '../router.ts';

export type ThemePick = Exclude<ThemeSetting, 'oled'>;

let uid = 0;

/** Vorschau-Farbfeld eines Themes (Tokens über [data-preview], tokens.css); „system“ zeigt Papier und Nacht geteilt. */
function swatch(v: ThemePick): HTMLElement {
  return h('span', { class: 'tp-swatch', 'data-preview': v === 'system' ? 'paper' : v, 'aria-hidden': 'true' },
    v === 'system' ? h('span', { class: 'tp-half', 'data-preview': 'night' }) : null,
    h('span', { class: 'tp-dot' }));
}

export function themePicker(o: {
  label: string; help?: string; options: readonly ThemePick[]; value: ThemePick; onChange: (v: ThemePick) => void;
}): { el: HTMLElement; set(v: ThemePick): void } {
  const labelId = `tp-label-${++uid}`;
  let current = o.value;
  const buttons = o.options.map((v) => {
    const owned = !isPremiumTheme(v) || ownsItem(getSettings().purchases, themeItemId(v));
    const price = owned ? null : shopItem(themeItemId(v))?.price ?? null;
    const name = themeLabel(v);
    const btn = h('button', {
      type: 'button', class: `tp-tile press${owned ? '' : ' is-locked'}`, 'data-theme-pick': v,
      'aria-pressed': owned ? String(v === current) : null,
      'aria-label': owned ? null : t('shop.themeUnlock', { name, price: fmt(price ?? 0, 0) }),
      onclick: () => {
        if (!owned) { go('#/erfolge/shop'); return; }
        if (v === current) return;
        current = v;
        paint();
        o.onChange(v);
      },
    },
    swatch(v),
    h('span', { class: 'tp-name' }, name),
    owned ? null : h('span', { class: 'tp-lock num', 'aria-hidden': 'true' }, icon('lock', 14), price === null ? t('shop.themeLocked') : t('shop.price', { n: fmt(price, 0) })));
    return { v, owned, btn };
  });
  const paint = (): void => {
    for (const b of buttons) if (b.owned) b.btn.setAttribute('aria-pressed', String(b.v === current));
  };
  const grid = h('div', { class: 'tp-grid', role: 'group', 'aria-labelledby': labelId }, ...buttons.map((b) => b.btn));
  const el = h('div', { class: 'control tp' },
    h('p', { class: 'control-label', id: labelId }, o.label),
    grid,
    o.help ? h('p', { class: 'control-help' }, o.help) : null);
  return { el, set(v) { current = v; paint(); } };
}
