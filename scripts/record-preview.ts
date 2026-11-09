// App-Store-Vorschauvideos und iPad-Screenshots: nimmt den echten Rundgang im Simulator auf (Apple erlaubt nur Aufnahmen der App).
//   npm run preview:record            → Deutsch und Englisch, iPhone und iPad
//   npm run preview:record -- de      → nur eine Sprache
// Braucht Xcode mit Simulatoren und ffmpeg. Ergebnis: marketing/app-store/preview/<sprache>/ (nicht versioniert).
// Vorgaben (App Store Connect, „App preview specifications“): 15–30 s, 30 fps, H.264 High bis Level 4.0, 10–12 Mbit/s,
// Stereo-AAC; 886 × 1920 (iPhone), 1200 × 1600 (iPad).
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUNDLE = 'de.eliassteffen.mentalmath';
const OUT = join(ROOT, 'marketing/app-store/preview');
const LANGS = process.argv.slice(2).filter((a) => a === 'de' || a === 'en');
/** Nach so vielen ms ohne Ende-Marke gilt die Aufnahme als gescheitert. */
const MAX_RUN_MS = 60_000;

interface Device { key: string; name: string; w: number; h: number; shots: boolean }
const DEVICES: readonly Device[] = [
  { key: 'iphone-6.9', name: 'iPhone 17 Pro Max', w: 886, h: 1920, shots: false },
  { key: 'ipad-13', name: 'iPad Pro 13-inch (M5)', w: 1200, h: 1600, shots: true },
];

const run = (cmd: string, args: string[]): string => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
const sim = (...args: string[]): string => run('xcrun', ['simctl', ...args]);
const quietly = (fn: () => unknown): void => { try { fn(); } catch { /* z. B. schon gestartet oder nicht installiert */ } };
const delay = (ms: number): Promise<void> => new Promise((r) => { setTimeout(r, ms); });

function udidOf(name: string): string {
  const { devices } = JSON.parse(sim('list', 'devices', 'available', '-j')) as { devices: Record<string, Array<{ name: string; udid: string }>> };
  const runtimes = Object.keys(devices).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const rt of runtimes) {
    const hit = devices[rt]?.find((d) => d.name === name);
    if (hit) return hit.udid;
  }
  throw new Error(`Simulator nicht gefunden: ${name}`);
}

/** Eine einmal gebaute App; die Sprache steckt pro Lauf im Meta-Tag der Kopie (der Rundgang startet dann von selbst). */
function buildApp(workdir: string): string {
  console.log('Baue App …');
  run('npm', ['run', 'ios:sync']);
  run('xcodebuild', ['-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug', '-destination', 'generic/platform=iOS Simulator',
    '-derivedDataPath', join(workdir, 'dd'), '-skipMacroValidation', 'CODE_SIGNING_ALLOWED=NO', 'build']);
  return join(workdir, 'dd/Build/Products/Debug-iphonesimulator/App.app');
}

function preparedApp(app: string, workdir: string, content: string): string {
  const copy = join(workdir, 'run.app');
  rmSync(copy, { recursive: true, force: true });
  cpSync(app, copy, { recursive: true });
  const index = join(copy, 'public/index.html');
  writeFileSync(index, readFileSync(index, 'utf8').replace('<head>', `<head><meta name="mm-record" content="${content}">`));
  return copy;
}

interface Take { startS: number; endS: number }

/** Spielt den Rundgang einmal ab. Die App meldet Start, Texte und Ende über die Konsole; daran hängen Schnitt und Screenshots. */
async function take(udid: string, app: string, raw: string, onSay?: (name: string) => void): Promise<Take> {
  quietly(() => sim('terminate', udid, BUNDLE));
  quietly(() => sim('uninstall', udid, BUNDLE));
  sim('install', udid, app);
  const rec: ChildProcess = spawn('xcrun', ['simctl', 'io', udid, 'recordVideo', '--codec=h264', '--force', raw], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const started = new Promise<number>((resolve) => {
    const seen = (b: Buffer): void => { if (b.toString().includes('Recording started')) resolve(Date.now()); };
    rec.stdout?.on('data', seen);
    rec.stderr?.on('data', seen);
  });
  const t0 = await started;
  // --console-pty: Über eine Pipe puffert die App ihre Ausgaben bis zum Beenden, die Marken kämen zu spät
  const app2 = spawn('xcrun', ['simctl', 'launch', '--console-pty', '--terminate-running-process', udid, BUNDLE], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let startS = -1;
  let endS = -1;
  const onLine = (b: Buffer): void => {
    const text = b.toString();
    if (startS < 0 && text.includes('mm-record-start')) startS = (Date.now() - t0) / 1000;
    if (endS < 0 && text.includes('mm-record-end')) endS = (Date.now() - t0) / 1000;
    for (const m of text.matchAll(/mm-record-say\s+tour\.(\w+)/g)) if (m[1]) onSay?.(m[1]);
  };
  app2.stdout?.on('data', onLine);
  app2.stderr?.on('data', onLine);
  for (let waited = 0; endS < 0 && waited < MAX_RUN_MS; waited += 200) await delay(200);
  await delay(600);
  const stopped = new Promise<void>((resolve) => { rec.on('close', () => resolve()); });
  rec.kill('SIGINT');
  await stopped;
  app2.kill('SIGKILL');
  if (startS < 0 || endS < 0) throw new Error('Keine Start-/Ende-Marke aus der App (läuft sie als Debug-Build mit Konsolen-Logging?)');
  return { startS, endS };
}

function encode(raw: string, out: string, t: Take, d: Device): void {
  // Kurz vor dem Ende schneiden: danach erschiene die echte Startseite
  const seconds = Math.min(29.8, t.endS - t.startS - 0.1).toFixed(2);
  run('ffmpeg', ['-y', '-ss', t.startS.toFixed(2), '-i', raw, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', seconds,
    '-map', '0:v', '-map', '1:a', '-vf', `scale=${d.w}:${d.h}:force_original_aspect_ratio=increase,crop=${d.w}:${d.h},fps=30,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high', '-level:v', '4.0', '-b:v', '11M', '-maxrate', '12M', '-bufsize', '24M',
    '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', out]);
}

/** Prüft das fertige Video gegen Apples Vorgaben; ein Verstoß bricht ab. */
function verify(out: string, d: Device): string {
  const info = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', out])) as {
    streams: Array<Record<string, string | number>>; format: { duration: string };
  };
  const v = info.streams.find((s) => s['codec_type'] === 'video');
  const a = info.streams.find((s) => s['codec_type'] === 'audio');
  const seconds = Number(info.format.duration);
  const problems = [
    v?.['codec_name'] === 'h264' ? null : 'Codec', String(v?.['profile']) === 'High' ? null : 'Profil', Number(v?.['level']) <= 40 ? null : 'Level',
    v?.['width'] === d.w && v?.['height'] === d.h ? null : 'Größe', v?.['r_frame_rate'] === '30/1' ? null : 'Bildrate',
    a?.['codec_name'] === 'aac' && a?.['channels'] === 2 ? null : 'Ton', seconds >= 15 && seconds <= 30 ? null : `Dauer ${seconds}`,
  ].filter(Boolean);
  if (problems.length) throw new Error(`${out}: ${problems.join(', ')}`);
  return `${d.w}×${d.h}, ${seconds.toFixed(1)} s`;
}

async function main(): Promise<void> {
  const workdir = mkdtempSync(join(tmpdir(), 'mm-preview-'));
  const app = buildApp(workdir);
  for (const lang of LANGS.length ? LANGS : ['de', 'en']) {
    const dir = join(OUT, lang);
    mkdirSync(dir, { recursive: true });
    for (const d of DEVICES) {
      const udid = udidOf(d.name);
      quietly(() => sim('boot', udid));
      sim('bootstatus', udid, '-b');
      sim('status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100');
      const raw = join(workdir, `${lang}-${d.key}.mov`);
      const t = await take(udid, preparedApp(app, workdir, lang), raw);
      const out = join(dir, `${d.key}.mp4`);
      encode(raw, out, t, d);
      console.log(`${lang}/${d.key}.mp4: ${verify(out, d)}`);
      run('ffmpeg', ['-y', '-i', out, '-vf', 'fps=1/4,scale=260:-1,tile=4x2', '-frames:v', '1', join(dir, `${d.key}-uebersicht.png`)]);
      if (d.shots) {
        // Zweiter Durchlauf ohne Abdunklung: Screenshots in voller Auflösung, je Text ein Bild
        const shotDir = join(dir, d.key);
        mkdirSync(shotDir, { recursive: true });
        await take(udid, preparedApp(app, workdir, `${lang} shots`), join(workdir, 'shots.mov'), (name) => {
          setTimeout(() => { quietly(() => sim('io', udid, 'screenshot', '--type=png', join(shotDir, `${name}.png`))); }, 1200);
        });
        await delay(1500);
      }
      quietly(() => sim('status_bar', udid, 'clear'));
    }
  }
  rmSync(workdir, { recursive: true, force: true });
  if (!existsSync(OUT)) throw new Error('Keine Ausgabe');
  console.log(`Fertig: ${OUT}`);
}

await main();
