import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAST_TAB_KEY, lastTabHash, shellOf, tabOf, type RouteName } from '../src/core/nav.ts';

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('tabOf: jede Route gehört zum richtigen Tab', () => {
  const expected: Record<RouteName, string | null> = {
    today: 'today', custom: 'today', quests: 'today', case: 'today',
    learn: 'learn',
    achievements: 'achievements', progress: 'achievements',
    compete: 'compete', board: 'compete', challenge: 'compete', duel: 'compete', race: 'compete', // v12 R1
    profile: null, chain: null, parallel: null, placement: null, train: null, 'race-reihum': null, 'race-group': null, 'race-live': null, // v12 R2, R3
  };
  for (const [name, tab] of Object.entries(expected)) assert.equal(tabOf(name as RouteName), tab, name);
  assert.equal(tabOf('case', { caseId: 'random' }), null, 'Mini-Case im Spiel: Fokus-Modus');
  assert.equal(tabOf('case', { caseId: null }), 'today');
});

test('Profil ist Modal (kein Fokus-Modus), Training bleibt Fokus', () => {
  assert.deepEqual(shellOf('profile'), { tab: null, modal: true });
  assert.deepEqual(shellOf('train'), { tab: null, modal: false });
  assert.deepEqual(shellOf('chain'), { tab: null, modal: false });
  assert.deepEqual(shellOf('today'), { tab: 'today', modal: false });
});

test('TAB_HREF: vier Tabs in Leistenreihenfolge', () => {
  const shell = read('../src/ui/shell.ts');
  const block = /TAB_HREF[^=]*=\s*\{([^}]*)\}/.exec(shell)?.[1] ?? '';
  const hrefs = Object.fromEntries([...block.matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(hrefs, { today: '#/', learn: '#/lernen', achievements: '#/erfolge', compete: '#/wettbewerbe' });
});

test('lastTabHash: gültiger Hash bleibt, Unbrauchbares und Profil fallen zurück', () => {
  assert.equal(lastTabHash('#/lernen'), '#/lernen');
  assert.equal(lastTabHash('#/wettbewerbe?x=1'), '#/wettbewerbe?x=1');
  assert.equal(lastTabHash('#/erfolge/shop'), '#/erfolge/shop');
  assert.equal(lastTabHash(null), '#/');
  assert.equal(lastTabHash(undefined, '#/lernen'), '#/lernen');
  assert.equal(lastTabHash(''), '#/');
  assert.equal(lastTabHash('https://evil.example/'), '#/');
  assert.equal(lastTabHash('#/profil'), '#/');
  assert.equal(lastTabHash('#/profil/training', '#/x'), '#/x');
  assert.equal(lastTabHash('#/settings'), '#/');
  assert.equal(lastTabHash('#/a b'), '#/');
  assert.equal(LAST_TAB_KEY, 'mm.lastTab');
});

test('index.html: vier Tabs plus Profil-Eintrag der Seitenleiste; Medaillen-Icon', () => {
  const html = read('../public/index.html');
  const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(tabs, ['today', 'learn', 'achievements', 'compete']);
  assert.match(html, /class="tab tabbar-profile press" href="#\/profil"/);
  assert.match(read('../src/ui/charts.ts'), /\bmedal: \[/);
  assert.match(read('../public/css/app.css'), /views\/nav\.css/);
});
