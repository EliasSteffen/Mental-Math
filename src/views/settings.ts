import type { CategoryId, Settings, ThemeSetting } from '../types.ts';
import { getSettings, setSettings, resetAll, exportJSON } from '../data/storage.ts';
import { applyTheme } from '../ui/theme.ts';
import { CATEGORIES } from '../core/catalog.ts';
import { app, h, appendChildren } from '../ui/dom.ts';
import { rerender } from '../router.ts';

function segmented<V extends string | number>(
  label: string,
  options: ReadonlyArray<readonly [V, string]>,
  current: V,
  onPick: (value: V) => void,
): HTMLDivElement {
  const seg = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    const active = value === current;
    seg.append(h('button', {
      type: 'button', class: active ? 'active' : null, 'aria-pressed': String(active),
      onclick: () => { onPick(value); rerender(); },
    }, text));
  }
  return seg;
}

type BooleanSettingKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function toggle(label: string, key: BooleanSettingKey, settings: Settings, after?: () => void): HTMLLabelElement {
  const input: HTMLInputElement = h('input', {
    type: 'checkbox', 'aria-label': label, checked: settings[key] ? true : null,
    onchange: () => { setSettings({ [key]: input.checked }); if (after) after(); },
  });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }));
}

function autoFailToggle(s: Settings): HTMLLabelElement {
  const input: HTMLInputElement = h('input', {
    type: 'checkbox', 'aria-label': 'Auto-Fail', checked: s.autoFail && s.timer ? true : null,
    disabled: s.timer ? null : true,
    onchange: () => setSettings({ autoFail: input.checked }),
  });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }));
}

function row(label: string, control: Node, sub?: string): HTMLDivElement {
  const inline = control instanceof HTMLElement && (control.classList.contains('switch') || control.tagName === 'BUTTON' || control.tagName === 'A');
  return h('div', { class: `setting-row${inline ? ' inline' : ''}` },
    h('div', null, label, sub ? h('div', { class: 'small muted' }, sub) : null),
    control);
}

function download(): void {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'mental-math-export.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function categoriesSection(s: Settings): HTMLElement {
  const all: CategoryId[] = CATEGORIES.map((c) => c.id);
  const enabled: CategoryId[] = Array.isArray(s.enabledCategories)
    ? all.filter((id) => s.enabledCategories?.includes(id)) : all;
  const save = (ids: CategoryId[]): void => {
    setSettings({ enabledCategories: ids.length >= all.length ? null : ids });
    rerender();
  };
  const rows = CATEGORIES.map((c) => {
    const on = enabled.includes(c.id);
    const last = on && enabled.length === 1;
    const input: HTMLInputElement = h('input', {
      type: 'checkbox', 'aria-label': c.name, checked: on ? true : null, disabled: last ? true : null,
      onchange: () => save(input.checked ? all.filter((id) => id === c.id || enabled.includes(id)) : enabled.filter((id) => id !== c.id)),
    });
    return h('div', { class: 'setting-row cat-row' },
      h('div', null, c.name, h('div', { class: 'small muted' }, c.description)),
      h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' })));
  });
  return h('section', { class: 'settings-section' },
    h('h2', { class: 'section-title' }, 'Kategorien'),
    h('p', { class: 'small muted' }, 'Nur aktive Kategorien erscheinen im Training, auf der Startseite und in der Analyse. Mindestens eine bleibt aktiv.'),
    ...rows,
    enabled.length === 1 ? h('p', { class: 'small muted' }, 'Die letzte aktive Kategorie kann nicht deaktiviert werden.') : null,
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button', class: 'btn', disabled: enabled.length === all.length ? true : null,
        onclick: () => save(all),
      }, 'Alle aktivieren')));
}

export function renderSettings(): void {
  const s = getSettings();

  const swatches = h('div', { class: 'theme-swatches', role: 'group', 'aria-label': 'Theme' });
  const themes: ReadonlyArray<readonly [ThemeSetting, string]> = [['system', 'System'], ['neon', 'Neon'], ['oled', 'OLED'], ['pastel', 'Pastel']];
  for (const [v, t] of themes) {
    const active = s.theme === v;
    swatches.append(h('button', {
      type: 'button', class: `swatch${active ? ' active' : ''}`, 'data-theme-value': v, 'aria-pressed': String(active),
      onclick: () => { setSettings({ theme: v }); applyTheme(v); rerender(); },
    }, h('span', { class: 'swatch-dot' }), t));
  }

  const goal: HTMLSelectElement = h('select', {
    class: 'select', 'aria-label': 'Tagesziel',
    onchange: () => setSettings({ dailyGoalMin: Number(goal.value) }),
  }, [5, 10, 15, 20, 30, 45, 60].map((m) => h('option', { value: m, selected: m === s.dailyGoalMin ? true : null }, `${m} min`)));

  const diffCur: 'auto' | 1 | 2 | 3 = s.difficulty === 'auto' ? 'auto' : s.difficulty;
  const resetBtn = h('button', {
    type: 'button', class: 'btn',
    onclick: () => {
      if (!confirm('Wirklich alle Daten löschen? Das lässt sich nicht rückgängig machen.')) return;
      resetAll();
      applyTheme('system');
      rerender();
    },
  }, 'Alles zurücksetzen');

  appendChildren(app, [
    h('h1', { class: 'page-title' }, 'Einstellungen'),
    h('section', { class: 'settings-section' },
      h('h2', { class: 'section-title' }, 'Darstellung'),
      h('div', { class: 'setting-row' }, h('div', null, 'Theme'), swatches)),
    h('section', { class: 'settings-section' },
      h('h2', { class: 'section-title' }, 'Training'),
      row('Tagesziel', goal),
      row('Schwierigkeit', segmented<'auto' | 1 | 2 | 3>('Schwierigkeit',
        [['auto', 'Automatisch'], [1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer']], diffCur, (v) => setSettings({ difficulty: v }))),
      row('Rundenlänge', segmented<number>('Rundenlänge',
        [[5, '5'], [10, '10'], [20, '20'], [30, '30']], s.sessionLength, (v) => setSettings({ sessionLength: v }))),
      row('Bildschirm-Tastatur', segmented<'auto' | 'on' | 'off'>('Bildschirm-Tastatur',
        [['auto', 'Automatisch'], ['on', 'An'], ['off', 'Aus']], s.keypad || 'auto', (v) => setSettings({ keypad: v })),
      'Eigene Zahlentastatur mit „Prüfen“-Taste'),
      row('Timer', toggle('Timer', 'timer', s, rerender), 'Aus: ohne Zeitdruck, Tempo zählt nicht'),
      row('Auto-Fail', autoFailToggle(s),
        s.timer ? 'Läuft die Zielzeit ab, wird deine aktuelle Eingabe automatisch abgegeben' : 'Nur mit Timer'),
      row('Auto-Submit', toggle('Auto-Submit', 'autoSubmit', s), 'Prüft automatisch, sobald die Zahl stimmt'),
      row('Numpad-Layout', segmented<'calculator' | 'phone'>('Numpad-Layout',
        [['calculator', 'Rechner'], ['phone', 'Telefon']], s.numpadLayout, (v) => setSettings({ numpadLayout: v }))),
      row('Schätzmodus', toggle('Schätzmodus', 'estimateMode', s), '±5 % reicht, weniger Punkte'),
      row('Ghost', toggle('Ghost', 'ghost', s), 'Zeigt deinen Rekord als Marker')),
    categoriesSection(s),
    h('section', { class: 'settings-section' },
      h('h2', { class: 'section-title' }, 'Feedback'),
      row('Haptik', toggle('Haptik', 'haptics', s)),
      row('Sound', toggle('Sound', 'sound', s))),
    h('section', { class: 'settings-section' },
      h('h2', { class: 'section-title' }, 'Daten'),
      row('Export als JSON', h('button', { type: 'button', class: 'btn', onclick: download }, 'Exportieren')),
      row('Alle Daten löschen', resetBtn)),
    h('section', { class: 'settings-section' },
      h('h2', { class: 'section-title' }, 'Über'),
      row('Version', h('span', { class: 'muted' }, 'Version 4')),
      row('Quellcode', h('a', { class: 'linkbtn', href: 'https://github.com/EliasSteffen/Mental-Math', target: '_blank', rel: 'noopener' }, 'GitHub'))),
  ]);
}
