// Labor auf der Kommandozeile: das Lernstand-Modell ohne die App trainieren und prüfen.
//   npm run lab -w learning-engine                         → Erkennung + Strategien (Simulation)
//   npm run lab -w learning-engine -- detect --learners 100
//   npm run lab -w learning-engine -- policy --days 28
//   npm run lab -w learning-engine -- tune
//   npm run lab -w learning-engine -- replay export.json   → Modelle auf echten Daten (Export der App) vergleichen
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  POLICIES, baseRate, elo, loadObservations, simulateDetection, simulatePolicy, trainTestSplit, tuneDetection, windowAccuracy,
} from '../src/lab/index.ts';
import type { ReplayReport } from '../src/lab/index.ts';
import { DEFAULT_CONFIG, resolveConfig } from '../src/index.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    learners: { type: 'string' },
    seed: { type: 'string' },
    days: { type: 'string' },
    checkpoint: { type: 'string' },
    train: { type: 'string' },
  },
});
const num = (v: string | undefined, d: number): number => (v === undefined ? d : Number(v));
const pct = (x: number): string => `${(100 * x).toFixed(0)} %`.padStart(6);
const f = (x: number | null, digits = 3): string => (x === null ? '–' : x.toFixed(digits));

function detect(): void {
  const r = simulateDetection({ learners: num(values.learners, 60), seed: num(values.seed, 1) });
  console.log(`\nErkennung – ${r.learners} simulierte Personen, ${r.subtypes} Aufgabentypen, je 3 eingepflanzte Schwächen`);
  console.log('Ø Antw./Typ  Precision  Recall     F1  Diagnose  Top-3   Recall: ungenau  langsam  nullen');
  for (const c of r.checkpoints) {
    const b = c.recallByReason;
    console.log(`${String(c.perSubtype).padStart(11)}  ${pct(c.overall.precision)}    ${pct(c.overall.recall)} ${f(c.overall.f1, 2).padStart(6)}  ${pct(c.reasonAccuracy)}  ${pct(c.top3Precision)}         ${pct(b.ungenau)}   ${pct(b.langsam)}  ${pct(b.nullen)}`);
  }
}

function policy(): void {
  const days = num(values.days, 21);
  console.log(`\nStrategien – ${days} Tage, 2 Runden à 10 Aufgaben pro Tag (gleiche Personen je Strategie)`);
  console.log('Strategie     Schwächen-Score vorher → nachher  noch schwach  Gesamt-Score  Übung auf Schwächen');
  for (const p of POLICIES) {
    const r = simulatePolicy({ policy: p, days, learners: num(values.learners, 40), seed: num(values.seed, 7) });
    console.log(`${p.padEnd(12)}  ${r.deficitScoreBefore.toFixed(1).padStart(15)} → ${r.deficitScoreAfter.toFixed(1).padEnd(15)}  ${pct(r.stillDeficient)}        ${r.overallScoreAfter.toFixed(1).padStart(6)}  ${pct(r.deficitPracticeShare)}`);
  }
}

function tune(): void {
  const checkpoint = num(values.checkpoint, 15);
  const space = { window: [10, 15, 25, 40], deficitScore: [75, 80, 85, 90], minAttempts: [3, 5, 8], accuracyFloor: [0.7, 0.8, 0.85] };
  console.log(`\nTuning – F1 der Erkennung nach Ø ${checkpoint} Antworten je Typ; Raster ${JSON.stringify(space)}`);
  const res = tuneDetection(space, { checkpoint, learners: num(values.learners, 40), seed: num(values.seed, 1) });
  const isDefault = (p: Record<string, unknown>): boolean => Object.entries(p).every(([k, v]) => DEFAULT_CONFIG[k as keyof typeof DEFAULT_CONFIG] === v);
  res.slice(0, 10).forEach((r, i) => console.log(`${String(i + 1).padStart(2)}. F1 ${f(r.value)}  ${JSON.stringify(r.params)}${isDefault(r.params) ? '  ← Standard' : ''}`));
  const rank = res.findIndex((r) => isDefault(r.params));
  if (rank >= 10) console.log(`    Standard: Platz ${rank + 1}, F1 ${f(res[rank]!.value)}`);
}

function replayFile(file: string): void {
  const { observations, skipped } = loadObservations(JSON.parse(readFileSync(file, 'utf8')));
  if (observations.length < 50) throw new Error(`zu wenig Antworten (${observations.length}) – mindestens 50`);
  const share = num(values.train, 0.7);
  const candidates = [
    baseRate(),
    windowAccuracy(),
    windowAccuracy({ cfg: resolveConfig({ window: 10 }) }),
    elo({ k: 0.1 }), elo({ k: 0.2 }), elo({ k: 0.3 }), elo({ k: 0.5 }),
    elo({ k: 0.3, levelWeight: 0.5 }),
  ];
  const s = trainTestSplit(observations, candidates, share);
  console.log(`\nReplay – ${observations.length} Antworten (${skipped} verworfen); Training bis #${s.splitAt}, Prüfung danach`);
  console.log('Modell                    Brier  Log-Loss     AUC  Trefferq.');
  const row = (r: ReplayReport): string => `${r.model.padEnd(24)} ${f(r.brier, 4)}   ${f(r.logLoss, 4)}  ${f(r.auc)}   ${pct(r.accuracy)}`;
  for (const r of s.test) console.log(row(r) + (r.model === s.best ? '  ← bestes im Training' : ''));
  const best = s.test.find((r) => r.model === s.best);
  if (best) {
    console.log(`\nKalibrierung (${best.model}, Prüfteil): vorhergesagt → tatsächlich`);
    for (const b of best.calibration) console.log(`  ${pct(b.lo)}–${pct(b.hi).trim()}  n=${String(b.n).padStart(4)}  ${pct(b.meanP)} → ${pct(b.rate)}`);
  }
}

const [cmd = 'all', arg] = positionals;
switch (cmd) {
  case 'detect': detect(); break;
  case 'policy': policy(); break;
  case 'tune': tune(); break;
  case 'replay':
    if (!arg) throw new Error('replay <export.json>: Datei fehlt (Profil → Daten → Exportieren)');
    replayFile(arg);
    break;
  case 'all': detect(); policy(); break;
  default: throw new Error(`unbekannter Befehl „${cmd}“ (detect | policy | tune | replay <datei> | all)`);
}
