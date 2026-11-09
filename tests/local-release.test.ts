import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchAllowed, buildNumber, parseConfig, publicEnv } from '../scripts/local-release.ts';

test('buildNumber: yyMMddHHmm in UTC, steigt mit der Zeit', () => {
  assert.equal(buildNumber(new Date('2026-11-05T09:07:00Z')), '2611050907');
  assert.ok(Number(buildNumber(new Date('2026-11-05T09:08:00Z'))) > Number(buildNumber(new Date('2026-11-05T09:07:00Z'))));
  assert.ok(Number(buildNumber(new Date('2027-01-01T00:00:00Z'))) > Number(buildNumber(new Date('2026-12-31T23:59:00Z'))));
});

test('publicEnv: nur PUBLIC_*, nie Server-Geheimnisse', () => {
  const env = publicEnv('SUPABASE_SERVICE_ROLE_KEY=geheim\nPUBLIC_SUPABASE_URL=https://x.supabase.co\nAUTH_JWT_KEY=geheim\nPUBLIC_SUPABASE_ANON_KEY="sb_publishable_x"\n# PUBLIC_KOMMENTAR=nein\n');
  assert.deepEqual(env, { PUBLIC_SUPABASE_URL: 'https://x.supabase.co', PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x' });
});

test('parseConfig: Team-ID Pflicht, Schlüssel gefiltert', () => {
  const key = 'M'.repeat(60);
  assert.deepEqual(parseConfig(JSON.stringify({ appleTeamId: 'ABCDE12345', production: [key, 3, 'kurz'], beta: [key] })),
    { appleTeamId: 'ABCDE12345', production: [key], beta: [key] });
  assert.throws(() => parseConfig(JSON.stringify({ production: [key] })), /appleTeamId/);
});

test('branchAllowed: wie die Trigger in deploy.yml/ios.yml', () => {
  assert.ok(branchAllowed('preview', 'develop'));
  assert.ok(!branchAllowed('preview', 'release'));
  assert.ok(branchAllowed('production', 'release'));
  assert.ok(!branchAllowed('production', 'develop'));
  for (const b of ['develop', 'release', 'hotfix/login']) assert.ok(branchAllowed('testflight', b));
  assert.ok(!branchAllowed('testflight', 'feat/x'));
});
