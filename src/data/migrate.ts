// Migration `kopfrechner.v1` (State v1/v2) → `mm:v3:*`. Idempotent: der alte Schlüssel wird nach dem Schreiben entfernt
// (Lauf ohne Schlüssel = no-op), Schreiben ersetzt statt anzuhängen. Der erste alte Stand bleibt als `kopfrechner.v1.bak`.
import type { AppSettings, GameResult, SessionStats, UserProfile } from '../types.ts';
import type { LegacyStore } from './adapters.ts';
import { createMeta } from './meta.ts';
import { newId } from './ids.ts';
import type { Repository } from './repository.ts';
import { normalize } from './schema.ts';

export const LEGACY_KEY = 'kopfrechner.v1';
export const LEGACY_BACKUP_KEY = 'kopfrechner.v1.bak';

export type MigrationStatus = 'migrated' | 'none' | 'invalid';

export function migrateV1(repo: Repository, legacy: LegacyStore, now: number = Date.now()): MigrationStatus {
  const raw = legacy.get(LEGACY_KEY);
  if (raw === null) return 'none';

  if (legacy.get(LEGACY_BACKUP_KEY) === null) legacy.set(LEGACY_BACKUP_KEY, raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    legacy.remove(LEGACY_KEY);
    return 'invalid';
  }
  const s = normalize(parsed);
  const dev = repo.deviceId;

  const profile: UserProfile = {
    ...createMeta(now, dev), displayName: null, cloudUserId: null, schemaVersion: 3,
  };
  const settings: AppSettings = { ...s.settings, updatedAt: now };
  const results: GameResult[] = s.attempts
    .filter((a) => a !== null && typeof a === 'object')
    .map((a) => ({ ...a, ...createMeta(a.ts, dev, newId()) }));
  const sessions: SessionStats[] = s.sessions
    .filter((x) => x !== null && typeof x === 'object')
    .map((x) => ({ ...x, ...createMeta(x.ts, dev, typeof x.id === 'string' && x.id ? x.id : newId()) }));

  // Schreiben ersetzt (kein Anhängen) → ein abgebrochener Lauf lässt sich gefahrlos wiederholen.
  if (!repo.getDoc('profile')) repo.putDoc('profile', profile);
  repo.putDoc('settings', settings);
  repo.putDoc('reviews', s.reviews);
  repo.putDoc('activity', s.activity);
  repo.putDoc('dailyResults', s.dailyResults);
  repo.putDoc('chainBest', s.chainBest);
  repo.putDoc('parallel', s.parallel);
  repo.replaceCollection('results', results);
  repo.replaceCollection('sessions', sessions);
  legacy.remove(LEGACY_KEY);
  return 'migrated';
}
