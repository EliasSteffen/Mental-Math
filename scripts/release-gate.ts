// Release-Gate: Die Website geht nur live, wenn genau dieser Code schon als iOS-Build zu TestFlight hochgeladen ist.
// „Genau dieser Code“ heißt: derselbe Git-Tree wie ein Commit, für den .github/workflows/ios.yml (push oder Run workflow)
// den Upload-Schritt erfolgreich beendet hat. Der Tree-Vergleich übersteht Merge-, Squash- und Rebase-Merges, schlägt
// aber fehl, sobald sich der Code unterscheidet (z. B. ein Commit direkt auf main ohne iOS-Build).
// Läuft in CI: release-gate.yml (Pull Requests auf main) und deploy.yml (vor dem Produktions-Deploy).
// Läuft gerade ein passender iOS-Lauf, wartet das Gate auf ihn (GATE_TIMEOUT_MIN, Standard 45).
import { appendFileSync } from 'node:fs';

/** Name des Upload-Schritts in ios.yml – tests/release-gate.test.ts prüft, dass es ihn dort gibt. */
export const UPLOAD_STEP = 'Zu App Store Connect hochladen (TestFlight)';
export const IOS_WORKFLOW = 'ios.yml';
/** Nur diese Anlässe können hochladen (Pull Requests bauen nur für den Simulator). */
const UPLOAD_EVENTS: readonly string[] = ['push', 'workflow_dispatch'];

export interface IosRun {
  id: number;
  headSha: string;
  event: string;
  /** queued | in_progress | completed | … */
  status: string;
  /** success | failure | cancelled | … (null solange er läuft) */
  conclusion: string | null;
  url: string;
}

export interface GateApi {
  /** Tree-SHA eines Commits */
  treeOf(sha: string): Promise<string>;
  /** letzte Läufe von ios.yml, neueste zuerst */
  iosRuns(): Promise<IosRun[]>;
  /** Ergebnis des Upload-Schritts eines Laufs (null: Schritt fehlt) */
  uploadConclusion(runId: number): Promise<string | null>;
}

export type GateResult =
  | { state: 'ok'; run: IosRun }
  | { state: 'waiting'; runs: IosRun[] }
  | { state: 'missing' };

/** Einmal prüfen: Gibt es einen erfolgreichen Upload für denselben Tree, oder läuft einer noch? */
export async function checkOnce(api: GateApi, tree: string): Promise<GateResult> {
  const runs = (await api.iosRuns()).filter((r) => UPLOAD_EVENTS.includes(r.event));
  const matching: IosRun[] = [];
  const trees = new Map<string, string>();
  for (const r of runs) {
    let t = trees.get(r.headSha);
    if (t === undefined) {
      t = await api.treeOf(r.headSha);
      trees.set(r.headSha, t);
    }
    if (t === tree) matching.push(r);
  }
  for (const r of matching) {
    if (r.status === 'completed' && r.conclusion === 'success' && (await api.uploadConclusion(r.id)) === 'success') {
      return { state: 'ok', run: r };
    }
  }
  const running = matching.filter((r) => r.status !== 'completed');
  return running.length ? { state: 'waiting', runs: running } : { state: 'missing' };
}

export interface GateOptions {
  timeoutMs: number;
  intervalMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  log: (line: string) => void;
}

/** Prüfen und, solange ein passender iOS-Lauf noch läuft, warten (höchstens timeoutMs). */
export async function runGate(api: GateApi, sha: string, o: GateOptions): Promise<GateResult> {
  const tree = await api.treeOf(sha);
  const deadline = o.now() + o.timeoutMs;
  for (;;) {
    const r = await checkOnce(api, tree);
    if (r.state !== 'waiting' || o.now() + o.intervalMs > deadline) return r;
    o.log(`iOS-Build läuft noch (${r.runs.map((x) => x.url).join(', ')}) – warte ${Math.round(o.intervalMs / 1000)} s`);
    await o.sleep(o.intervalMs);
  }
}

/* ---------- GitHub-API ---------- */

interface ApiRun { id: number; head_sha: string; event: string; status: string; conclusion: string | null; html_url: string }
interface ApiJobs { jobs?: Array<{ steps?: Array<{ name: string; conclusion: string | null }> }> }

export function githubApi(repo: string, token: string, fetchFn: typeof fetch = fetch): GateApi {
  const get = async <T>(path: string): Promise<T> => {
    const res = await fetchFn(`https://api.github.com/repos/${repo}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!res.ok) throw new Error(`GitHub-API ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };
  return {
    treeOf: async (sha) => (await get<{ tree: { sha: string } }>(`/git/commits/${sha}`)).tree.sha,
    iosRuns: async () => {
      // je Anlass abfragen: Pull-Request-Läufe würden ältere Uploads sonst aus den 50 neuesten verdrängen
      const lists = await Promise.all(UPLOAD_EVENTS.map((event) =>
        get<{ workflow_runs: ApiRun[] }>(`/actions/workflows/${IOS_WORKFLOW}/runs?event=${event}&per_page=50&exclude_pull_requests=true`)));
      return lists
        .flatMap((r) => r.workflow_runs)
        .sort((a, b) => b.id - a.id)
        .map((x) => ({ id: x.id, headSha: x.head_sha, event: x.event, status: x.status, conclusion: x.conclusion, url: x.html_url }));
    },
    uploadConclusion: async (runId) => {
      const r = await get<ApiJobs>(`/actions/runs/${runId}/jobs?per_page=100`);
      for (const job of r.jobs ?? []) {
        const step = job.steps?.find((s) => s.name === UPLOAD_STEP);
        if (step) return step.conclusion;
      }
      return null;
    },
  };
}

/* ---------- CLI (CI) ---------- */

async function main(): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const token = process.env.GITHUB_TOKEN ?? '';
  const sha = (process.env.GATE_SHA || process.env.GITHUB_SHA || '').trim();
  const minutes = Number(process.env.GATE_TIMEOUT_MIN ?? 45);
  if (!repo || !token || !/^[0-9a-f]{40}$/.test(sha)) {
    console.log('::error::Release-Gate: GITHUB_REPOSITORY, GITHUB_TOKEN und GATE_SHA (Commit) werden gebraucht.');
    process.exit(1);
  }
  const result = await runGate(githubApi(repo, token), sha, {
    timeoutMs: (Number.isFinite(minutes) ? minutes : 45) * 60_000,
    intervalMs: 60_000,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    log: (line) => console.log(line),
  });
  const summary = process.env.GITHUB_STEP_SUMMARY;
  const write = (text: string): void => {
    if (summary) appendFileSync(summary, `${text}\n`);
  };
  if (result.state === 'ok') {
    console.log(`Release-Gate: iOS-Build für diesen Code liegt in TestFlight (${result.run.url}).`);
    write(`### ✅ Release-Gate\niOS-Build für denselben Code: ${result.run.url}`);
    return;
  }
  const why = result.state === 'waiting'
    ? `Der iOS-Build für diesen Code ist nach ${minutes} min noch nicht fertig (${result.runs.map((r) => r.url).join(', ')}). Danach diesen Lauf neu starten.`
    : 'Für diesen Code gibt es keinen iOS-Build in TestFlight. Version in package.json auf develop erhöhen (dann lädt ios.yml hoch) '
      + 'oder Actions → iOS → Run workflow (Branch des Codes, „Zu TestFlight hochladen“). Siehe README → Branches, Vorschau & Release.';
  console.log(`::error::Release-Gate: ${why}`);
  write(`### ❌ Release-Gate\n${why}`);
  process.exit(1);
}

if (import.meta.main) await main();
