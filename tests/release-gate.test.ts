// Release-Gate (scripts/release-gate.ts): Produktion nur mit iOS-Build desselben Codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkOnce, githubApi, runGate, UPLOAD_STEP, IOS_WORKFLOW } from '../scripts/release-gate.ts';
import type { GateApi, IosRun } from '../scripts/release-gate.ts';

const run = (o: Partial<IosRun> & Pick<IosRun, 'id' | 'headSha'>): IosRun => ({
  event: 'push', status: 'completed', conclusion: 'success', url: `https://example.test/runs/${o.id}`, ...o,
});

/** Fake-API: Commit → Tree, Läufe, Ergebnis des Upload-Schritts je Lauf */
function fakeApi(trees: Record<string, string>, runs: IosRun[], uploads: Record<number, string | null>): GateApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    treeOf: async (sha) => { calls.push(`tree:${sha}`); return trees[sha] ?? `tree-of-${sha}`; },
    iosRuns: async () => runs,
    uploadConclusion: async (id) => uploads[id] ?? null,
  };
}

test('ok: erfolgreicher Upload für denselben Tree – auch wenn der Commit ein anderer ist (Merge/Squash)', async () => {
  const api = fakeApi({ merge: 'T1', dev: 'T1', old: 'T0' }, [run({ id: 2, headSha: 'dev' }), run({ id: 1, headSha: 'old' })], { 2: 'success', 1: 'success' });
  const r = await checkOnce(api, 'T1');
  assert.equal(r.state, 'ok');
  assert.equal(r.state === 'ok' && r.run.id, 2);
});

test('missing: Upload-Schritt übersprungen, anderer Tree, Pull-Request-Lauf oder fehlgeschlagener Lauf zählen nicht', async () => {
  const api = fakeApi({ a: 'T1', b: 'T1', c: 'T2', d: 'T1' }, [
    run({ id: 4, headSha: 'a' }), // Upload übersprungen (kein Release-Kandidat)
    run({ id: 3, headSha: 'b', event: 'pull_request' }),
    run({ id: 2, headSha: 'c' }), // anderer Code
    run({ id: 1, headSha: 'd', conclusion: 'failure' }),
  ], { 4: 'skipped', 3: 'success', 2: 'success', 1: 'success' });
  assert.deepEqual(await checkOnce(api, 'T1'), { state: 'missing' });
  assert.ok(!api.calls.includes('tree:b'), 'Pull-Request-Läufe werden gar nicht erst geprüft');
});

test('waiting: passender Lauf läuft noch; Trees werden je Commit nur einmal geholt', async () => {
  const api = fakeApi({ a: 'T1' }, [run({ id: 2, headSha: 'a', status: 'in_progress', conclusion: null }), run({ id: 1, headSha: 'a', conclusion: 'cancelled' })], {});
  const r = await checkOnce(api, 'T1');
  assert.equal(r.state, 'waiting');
  assert.deepEqual(r.state === 'waiting' && r.runs.map((x) => x.id), [2]);
  assert.equal(api.calls.filter((c) => c === 'tree:a').length, 1);
});

test('runGate: wartet auf den laufenden iOS-Build und meldet dann ok; ohne Fortschritt Abbruch nach timeout', async () => {
  let now = 0;
  const runs = [run({ id: 7, headSha: 'dev', status: 'queued', conclusion: null })];
  const api = fakeApi({ head: 'T', dev: 'T' }, runs, { 7: 'success' });
  const logs: string[] = [];
  const opts = {
    timeoutMs: 10 * 60_000, intervalMs: 60_000, now: () => now, log: (l: string) => logs.push(l),
    sleep: async (ms: number) => {
      now += ms;
      if (now >= 3 * 60_000) Object.assign(runs[0]!, { status: 'completed', conclusion: 'success' });
    },
  };
  const ok = await runGate(api, 'head', opts);
  assert.equal(ok.state, 'ok');
  assert.equal(logs.length, 3);

  now = 0;
  const stuck = fakeApi({ head: 'T', dev: 'T' }, [run({ id: 8, headSha: 'dev', status: 'in_progress', conclusion: null })], {});
  const r = await runGate(stuck, 'head', { ...opts, sleep: async (ms: number) => { now += ms; } });
  assert.equal(r.state, 'waiting');
  assert.ok(now <= 10 * 60_000);
});

test('githubApi: fragt push- und Run-workflow-Läufe getrennt ab, neueste zuerst; findet den Upload-Schritt', async () => {
  const urls: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const body = url.includes('/git/commits/abc')
      ? { tree: { sha: 'T' } }
      : url.includes('event=push')
        ? { workflow_runs: [{ id: 5, head_sha: 'abc', event: 'push', status: 'completed', conclusion: 'success', html_url: 'u5' }] }
        : url.includes('event=workflow_dispatch')
          ? { workflow_runs: [{ id: 9, head_sha: 'def', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', html_url: 'u9' }] }
          : { jobs: [{ steps: [{ name: 'Tests', conclusion: 'success' }, { name: UPLOAD_STEP, conclusion: 'success' }] }] };
    return new Response(JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  const api = githubApi('owner/repo', 'token', fakeFetch);
  assert.equal(await api.treeOf('abc'), 'T');
  assert.deepEqual((await api.iosRuns()).map((r) => r.id), [9, 5]);
  assert.equal(await api.uploadConclusion(5), 'success');
  assert.ok(urls.every((u) => u.startsWith('https://api.github.com/repos/owner/repo/')));
  assert.ok(urls.some((u) => u.includes(`/actions/workflows/${IOS_WORKFLOW}/runs?event=push`)));

  const failing = githubApi('o/r', 't', (async () => new Response('{}', { status: 403 })) as typeof fetch);
  await assert.rejects(failing.treeOf('abc'), /HTTP 403/);
});

test('Workflows passen zusammen: ios.yml hat den Upload-Schritt, Deploy und PRs nutzen das Gate', () => {
  const read = (p: string): string => readFileSync(new URL(`../.github/workflows/${p}`, import.meta.url), 'utf8');
  const ios = read(IOS_WORKFLOW);
  assert.match(ios, new RegExp(`- name: ${UPLOAD_STEP.replace(/[()]/g, '\\$&')}\\n`));
  assert.match(ios, /branches: \[release, develop, 'hotfix\/\*\*'\]/);
  const deploy = read('deploy.yml');
  assert.match(deploy, /uses: \.\/\.github\/workflows\/release-gate\.yml/);
  const step = (name: string): string => {
    const start = deploy.indexOf(`- name: ${name}`);
    assert.ok(start >= 0, `Schritt „${name}“ fehlt`);
    const next = deploy.indexOf('\n      - ', start + 1);
    return deploy.slice(start, next < 0 ? undefined : next);
  };
  // develop-Vorschau: Vorschau-Kanal, aber dasselbe Supabase wie die Produktion (Konto mit Passkeys)
  const develop = step('Bauen (Vorschau mit Konto, develop)');
  assert.match(develop, /DEPLOY_CHANNEL: preview/);
  assert.match(develop, /vars\.PUBLIC_SUPABASE_URL/);
  assert.match(develop, /account == 'true'/);
  // PR-Vorschauen (*.pages.dev): keine Passkeys möglich, also gar kein Supabase
  const pr = step('Bauen (Vorschau ohne Konto, Pull Requests)');
  assert.match(pr, /DEPLOY_CHANNEL: preview/);
  assert.doesNotMatch(pr, /SUPABASE/);
  assert.match(deploy, /if \[ "\$EVENT" = pull_request \]; then\n\s+branch="pr-\$PR"; channel=preview; account=false/);
  assert.doesNotMatch(step('Bauen (Produktion)'), /DEPLOY_CHANNEL/);
  assert.match(read('release-gate.yml'), /pull_request:\n {4}branches: \[release\]/);
});
