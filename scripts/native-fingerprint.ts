// Fingerprint der nativen Teile der iOS-App und ios/native-version.json (docs/PLAN-live-updates.md, Abschnitt 3.3).
// Ein Live-Update darf nur native Fähigkeiten nutzen, die das installierte Binary hat. minNative in
// ios/native-version.json ist die kleinste App-Version mit dem aktuellen nativen Stand; der Fingerprint erkennt, wann
// sich dieser Stand ändert. tests/live-update.test.ts schlägt dann fehl, bis die Datei nachgezogen ist:
//   npm run native:stamp                     → minNative = Version aus package.json (vorher auf die nächste Store-Version setzen)
//   node scripts/native-fingerprint.ts --write --min-native 1.17.0
//   node scripts/native-fingerprint.ts --check
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT: string = fileURLToPath(new URL('..', import.meta.url));
export const NATIVE_VERSION_FILE = 'ios/native-version.json';

export interface NativeVersion { minNative: string; fingerprint: string }

/** Eigene Quellen der App (ohne App-Icons/Assets und ohne die von Capacitor erzeugten public/, config.xml, *.json) */
const APP_DIR = 'ios/App/App';
const APP_EXT = /\.(swift|plist|entitlements|xcprivacy|storyboard|h|m)$/;
const EXTRA_FILES: readonly string[] = [
  'ios/App/App.xcodeproj/project.pbxproj',
  'ios/App/CapApp-SPM/Package.swift',
  'capacitor.config.json',
];

function list(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'public' || e.name.endsWith('.xcassets') ? [] : list(root, rel);
    return APP_EXT.test(e.name) ? [rel] : [];
  });
}

/** Native Eingaben: [Name, Inhalt] – Dateien plus die Versionen der @capacitor-Pakete (nicht die App-Version). */
export function nativeInputs(root: string = ROOT): Array<[string, Buffer]> {
  const files = [...list(root, APP_DIR), ...EXTRA_FILES.filter((f) => existsSync(join(root, f)))].sort();
  const out: Array<[string, Buffer]> = files.map((f) => [f, readFileSync(join(root, f))]);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> };
  const cap = Object.entries(pkg.dependencies ?? {}).filter(([n]) => n.startsWith('@capacitor/')).sort(([a], [b]) => a.localeCompare(b));
  out.push(['package.json#dependencies/@capacitor', Buffer.from(JSON.stringify(cap))]);
  return out;
}

export function fingerprint(inputs: ReadonlyArray<[string, Buffer]>): string {
  const h = createHash('sha256');
  for (const [name, content] of inputs) h.update(`${name}\n${createHash('sha256').update(content).digest('hex')}\n`);
  return h.digest('hex');
}

export function readNativeVersion(root: string = ROOT): NativeVersion {
  return JSON.parse(readFileSync(join(root, NATIVE_VERSION_FILE), 'utf8')) as NativeVersion;
}

function main(): void {
  const args = process.argv.slice(2);
  const current = fingerprint(nativeInputs());
  if (args.includes('--write')) {
    const i = args.indexOf('--min-native');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    const minNative = i >= 0 ? (args[i + 1] ?? '') : pkg.version;
    if (!/^\d+\.\d+\.\d+$/.test(minNative)) throw new Error(`minNative ungültig: „${minNative}“`);
    const out: NativeVersion = { minNative, fingerprint: current };
    writeFileSync(join(ROOT, NATIVE_VERSION_FILE), `${JSON.stringify(out, null, 2)}\n`);
    console.log(`${NATIVE_VERSION_FILE}: minNative ${minNative}, Fingerprint ${current.slice(0, 12)}…`);
    console.log('minNative muss die nächste Store-Version sein, die diesen nativen Stand enthält.');
    return;
  }
  const saved = readNativeVersion();
  if (saved.fingerprint !== current) {
    console.error(`Native Teile geändert (Fingerprint ${current.slice(0, 12)}… statt ${saved.fingerprint.slice(0, 12)}…).`);
    console.error('Version in package.json auf die nächste Store-Version setzen, dann: npm run native:stamp');
    process.exit(1);
  }
  console.log(`native: minNative ${saved.minNative}, Fingerprint aktuell`);
}

if (import.meta.main) main();
