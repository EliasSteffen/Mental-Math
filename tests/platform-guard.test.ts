// Web-only-APIs nur in src/platform/ (und im Service Worker): Außerhalb davon funktionieren sie in der iOS-App still nicht.
// Schlägt der Test fehl: die Funktion in src/platform/index.ts ergänzen (Web- und App-Variante) und von dort aufrufen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
/** Erlaubt: Plattform-Schicht, Service Worker (nur Website), erzeugte Dateien, Vendor-Einstiege */
const ALLOWED: readonly RegExp[] = [/^platform\//, /^sw\.ts$/, /^generated\//, /^vendor\//];

const RULES: ReadonlyArray<{ re: RegExp; use: string }> = [
  { re: /\bnavigator\.vibrate\b|\.vibrate\(/, use: 'haptic() aus platform/index.ts' },
  { re: /\bPushManager\b|\.pushManager\b|\bserviceWorker\b/, use: 'platform/reminders.ts bzw. startPlatform()' },
  { re: /\bNotification\.(permission|requestPermission)\b|\bnew Notification\(/, use: 'platform/reminders.ts' },
  { re: /\bnavigator\.credentials\b|\bPublicKeyCredential\b/, use: 'authOptions() aus platform/index.ts' },
  { re: /\bnavigator\.share\b/, use: 'shareText() aus platform/index.ts' },
  { re: /\bcreateObjectURL\b|\bdownload:\s*['"`]/, use: 'saveFile() aus platform/index.ts' },
  { re: /\bfetch\(\s*['"`]\//, use: 'fetch(apiUrl(…)) aus platform/index.ts' },
  { re: /\blocation\.(origin|host|hostname)\b/, use: 'publicUrl() aus platform/index.ts' },
  { re: /\bwindow\.open\(/, use: '<a href> (die App öffnet externe Links im In-App-Browser)' },
  { re: /['"]@capacitor\//, use: 'Plugins nur über platform/native.ts' },
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

/** Kommentare entfernen, damit Erklärtexte nicht anschlagen (grob, reicht für den Zweck). */
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('Web-only-APIs nur in src/platform/', () => {
  const hits: string[] = [];
  for (const file of files(SRC)) {
    const rel = relative(SRC, file).split(sep).join('/');
    if (ALLOWED.some((re) => re.test(rel))) continue;
    code(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
      for (const r of RULES) if (r.re.test(line)) hits.push(`src/${rel}:${i + 1} → ${r.use}`);
    });
  }
  assert.deepEqual(hits, [], `Web-only-API außerhalb von src/platform/:\n${hits.join('\n')}`);
});

test('Guard erkennt Verstöße', () => {
  const sample = "navigator.vibrate(10); fetch('/api/x'); location.origin; import { Haptics } from '@capacitor/haptics';";
  const found = RULES.filter((r) => r.re.test(sample)).length;
  assert.equal(found, 4);
});
