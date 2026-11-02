// iPhone, iPad und Mac (Apple Silicon, „Designed for iPad“) aus einem Binary: schützt die Projekt-Einstellungen dafür.
// Xcode schreibt project.pbxproj und Info.plist gern beim Öffnen um; fällt dabei das iPad weg, schlägt dieser Test fehl.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const pbxproj = readFileSync(new URL('ios/App/App.xcodeproj/project.pbxproj', ROOT), 'utf8');
const plist = readFileSync(new URL('ios/App/App/Info.plist', ROOT), 'utf8');

/** Build-Einstellungen des App-Targets (die Konfigurationen mit INFOPLIST_FILE), je Debug und Release. */
function targetConfigs(): string[] {
  const out: string[] = [];
  for (const m of pbxproj.matchAll(/buildSettings = \{([\s\S]*?)\n\t\t\t\};/g)) {
    const body = m[1] ?? '';
    if (body.includes('INFOPLIST_FILE = App/Info.plist;')) out.push(body);
  }
  return out;
}

/** Werte eines <array> zu einem Schlüssel in der Info.plist (null = Schlüssel fehlt). */
function plistArray(key: string): string[] | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`<key>${esc}</key>\\s*<array>([\\s\\S]*?)</array>`).exec(plist);
  if (!m) return null;
  return [...(m[1] ?? '').matchAll(/<string>([^<]*)<\/string>/g)].map((x) => x[1] ?? '');
}

test('App-Target: iPhone und iPad (TARGETED_DEVICE_FAMILY = "1,2") in Debug und Release', () => {
  const configs = targetConfigs();
  assert.equal(configs.length, 2);
  for (const c of configs) assert.match(c, /TARGETED_DEVICE_FAMILY = "1,2";/);
});

test('Mac: als iPad-App auf Apple-Silicon-Macs, kein Mac Catalyst', () => {
  for (const c of targetConfigs()) {
    assert.match(c, /SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = YES;/);
    assert.match(c, /SUPPORTS_MACCATALYST = NO;/);
  }
});

test('iPad: alle vier Ausrichtungen (Split View, Stage Manager, frei skalierbares Mac-Fenster)', () => {
  const ipad = plistArray('UISupportedInterfaceOrientations~ipad');
  assert.ok(ipad, 'UISupportedInterfaceOrientations~ipad fehlt');
  assert.deepEqual([...ipad].sort(), [
    'UIInterfaceOrientationLandscapeLeft',
    'UIInterfaceOrientationLandscapeRight',
    'UIInterfaceOrientationPortrait',
    'UIInterfaceOrientationPortraitUpsideDown',
  ]);
  // Vollbild-Pflicht würde Multitasking auf dem iPad abschalten
  assert.doesNotMatch(plist, /<key>UIRequiresFullScreen<\/key>\s*<true\/>/);
  // Startbildschirm als Storyboard ist Voraussetzung für Multitasking
  assert.match(plist, /<key>UILaunchStoryboardName<\/key>\s*<string>LaunchScreen<\/string>/);
});

test('iPhone bleibt im Hochformat', () => {
  assert.deepEqual(plistArray('UISupportedInterfaceOrientations'), ['UIInterfaceOrientationPortrait']);
});

test('App-Icon: ein universelles 1024er-Icon deckt iPhone, iPad und Mac ab', () => {
  const icon = JSON.parse(readFileSync(new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json', ROOT), 'utf8')) as {
    images: Array<{ idiom?: string; size?: string; platform?: string }>;
  };
  assert.ok(icon.images.some((i) => i.idiom === 'universal' && i.size === '1024x1024' && i.platform === 'ios'));
});
