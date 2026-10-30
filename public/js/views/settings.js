import { getSettings, setSettings, resetAll, exportJSON } from '../storage.js';
import { applyTheme } from '../theme.js';
import { app, h, appendChildren, rerender } from '../ui.js';

function segmented(label, options, current, onPick) {
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

function toggle(label, key, settings) {
  const input = h('input', {
    type: 'checkbox', 'aria-label': label, checked: settings[key] ? true : null,
    onchange: () => setSettings({ [key]: input.checked }),
  });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch-track' }));
}

function row(label, control, sub) {
  return h('div', { class: 'setting-row' },
    h('div', null, label, sub ? h('div', { class: 'small muted' }, sub) : null),
    control);
}

function download() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'mental-math-export.json' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function renderSettings() {
  const s = getSettings();

  const swatches = h('div', { class: 'theme-swatches', role: 'group', 'aria-label': 'Theme' });
  for (const [v, t] of [['system', 'System'], ['neon', 'Neon'], ['oled', 'OLED'], ['pastel', 'Pastel']]) {
    const active = s.theme === v;
    swatches.append(h('button', {
      type: 'button', class: `swatch${active ? ' active' : ''}`, 'data-theme-value': v, 'aria-pressed': String(active),
      onclick: () => { setSettings({ theme: v }); applyTheme(v); rerender(); },
    }, h('span', { class: 'swatch-dot' }), t));
  }

  const goal = h('select', {
    class: 'select', 'aria-label': 'Tagesziel',
    onchange: () => setSettings({ dailyGoalMin: Number(goal.value) }),
  }, [5, 10, 15, 20, 30, 45, 60].map((m) => h('option', { value: m, selected: m === s.dailyGoalMin ? true : null }, `${m} min`)));

  const diffCur = s.difficulty === 'auto' ? 'auto' : Number(s.difficulty);
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
      row('Schwierigkeit', segmented('Schwierigkeit',
        [['auto', 'Automatisch'], [1, 'Leicht'], [2, 'Mittel'], [3, 'Schwer']], diffCur, (v) => setSettings({ difficulty: v }))),
      row('Rundenlänge', segmented('Rundenlänge',
        [[5, '5'], [10, '10'], [20, '20'], [30, '30']], s.sessionLength, (v) => setSettings({ sessionLength: v }))),
      row('Timer', toggle('Timer', 'timer', s), 'Aus: ohne Zeitdruck, Tempo zählt nicht')),
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
      row('Version', h('span', { class: 'muted' }, 'Version 3')),
      row('Quellcode', h('a', { class: 'linkbtn', href: 'https://github.com/EliasSteffen/Mental-Math', target: '_blank', rel: 'noopener' }, 'GitHub'))),
  ]);
}
