// In-Memory-AuthStore für Tests und Demos; Semantik wie die SQL-Funktionen im Plan.
import type {
  AuthStore, AuthUser, Base64URL, ChallengePurpose, ChallengeRecord, NewPasskey, StoredPasskey,
} from '../shared/types.ts';
import { PasskeyAuthError } from '../shared/errors.ts';

/** Gnadenfrist für den Vorgänger-Hash nach einer Rotation; wie in pa_rotate_session (sql/001) */
export const ROTATION_GRACE_MS = 60_000;

// Wie public.auth_sessions; absoluteExpiresAt null = unbegrenzt (Altbestand)
interface SessionRow {
  userId: string;
  expiresAt: number;
  absoluteExpiresAt: number | null;
  prevHash: string | null;
  rotatedAt: number | null;
}

export class MemoryAuthStore implements AuthStore {
  private readonly now: () => number;
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly users = new Map<string, string>();
  private readonly passkeys = new Map<string, StoredPasskey>();
  private readonly sessions = new Map<string, SessionRow>();
  private readonly recovery = new Map<string, { hash: string; createdAt: number }>(); // userId → Code-Hash
  private seq = 0;

  constructor(opts: { now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  async createChallenge(c: ChallengeRecord): Promise<void> {
    this.challenges.set(c.id, { ...c });
    return Promise.resolve();
  }

  async consumeChallenge(id: string, purpose: ChallengePurpose): Promise<ChallengeRecord | null> {
    const c = this.challenges.get(id);
    this.challenges.delete(id); // wird immer gelöscht
    if (!c || c.purpose !== purpose || c.expiresAt <= this.now()) return Promise.resolve(null);
    return Promise.resolve(c);
  }

  private credentialTaken(credentialId: Base64URL): boolean {
    for (const p of this.passkeys.values()) if (p.credentialId === credentialId) return true;
    return false;
  }

  private insertPasskey(userId: string, pk: NewPasskey): void {
    if (this.credentialTaken(pk.credentialId)) {
      throw new PasskeyAuthError('already_registered', 'credential_exists', 409);
    }
    const id = `pk-${++this.seq}`;
    this.passkeys.set(id, { ...pk, transports: [...pk.transports], id, userId });
  }

  async createUserWithPasskey(user: AuthUser, pk: NewPasskey): Promise<void> {
    if (this.users.has(user.id)) throw new PasskeyAuthError('verification_failed', 'user_exists', 409);
    if (this.credentialTaken(pk.credentialId)) {
      throw new PasskeyAuthError('already_registered', 'credential_exists', 409);
    }
    this.users.set(user.id, user.username);
    this.insertPasskey(user.id, pk);
    return Promise.resolve();
  }

  async addPasskey(userId: string, pk: NewPasskey): Promise<void> {
    if (!this.users.has(userId)) throw new PasskeyAuthError('unauthorized', 'unknown_user', 401);
    this.insertPasskey(userId, pk);
    return Promise.resolve();
  }

  async findPasskey(credentialId: Base64URL): Promise<(StoredPasskey & { username: string }) | null> {
    for (const p of this.passkeys.values()) {
      if (p.credentialId === credentialId) {
        return Promise.resolve({ ...p, transports: [...p.transports], username: this.users.get(p.userId) ?? '' });
      }
    }
    return Promise.resolve(null);
  }

  async listCredentialIds(userId: string): Promise<Base64URL[]> {
    return Promise.resolve([...this.passkeys.values()].filter((p) => p.userId === userId).map((p) => p.credentialId));
  }

  async touchPasskey(id: string, counter: number): Promise<void> {
    const p = this.passkeys.get(id);
    if (p) p.counter = counter;
    return Promise.resolve();
  }

  async createSession(userId: string, tokenHash: string, expiresAt: number, absoluteExpiresAt?: number): Promise<void> {
    this.sessions.set(tokenHash, {
      userId, expiresAt, absoluteExpiresAt: absoluteExpiresAt ?? null, prevHash: null, rotatedAt: null,
    });
    return Promise.resolve();
  }

  async rotateSession(oldHash: string, newHash: string, expiresAt: number): Promise<AuthUser | null> {
    const now = this.now();
    const expired = (s: SessionRow): boolean =>
      s.expiresAt <= now || (s.absoluteExpiresAt !== null && s.absoluteExpiresAt <= now);
    const capped = (s: SessionRow): number => Math.min(expiresAt, s.absoluteExpiresAt ?? expiresAt);
    const userOf = (s: SessionRow): AuthUser | null => {
      const username = this.users.get(s.userId);
      return username === undefined ? null : { id: s.userId, username };
    };

    // 1. Aktueller Hash: rotieren, alter Hash wird Vorgänger
    const cur = this.sessions.get(oldHash);
    if (cur) {
      this.sessions.delete(oldHash);
      if (expired(cur)) return Promise.resolve(null); // abgelaufen: Zeile bleibt gelöscht
      this.sessions.set(newHash, { ...cur, prevHash: oldHash, rotatedAt: now, expiresAt: capped(cur) });
      return Promise.resolve(userOf(cur));
    }

    // 2. Vorgänger-Hash: Gnadenfrist ab der letzten echten Rotation, sonst Wiederverwendung
    for (const [hash, s] of this.sessions) {
      if (s.prevHash !== oldHash) continue;
      this.sessions.delete(hash);
      if (expired(s) || s.rotatedAt === null || now - s.rotatedAt >= ROTATION_GRACE_MS) {
        return Promise.resolve(null); // Wiederverwendung (Diebstahlsignal) oder abgelaufen: Session gelöscht
      }
      this.sessions.set(newHash, { ...s, expiresAt: capped(s) }); // prevHash/rotatedAt unverändert: Frist gleitet nicht
      return Promise.resolve(userOf(s));
    }
    return Promise.resolve(null);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }

  async setRecoveryCode(userId: string, codeHash: string): Promise<void> {
    if (!this.users.has(userId)) throw new PasskeyAuthError('unauthorized', 'unknown_user', 401);
    for (const [u, r] of this.recovery) {
      if (u !== userId && r.hash === codeHash) throw new Error('recovery hash collision');
    }
    this.recovery.set(userId, { hash: codeHash, createdAt: this.now() });
    return Promise.resolve();
  }

  async findRecoveryUser(codeHash: string): Promise<AuthUser | null> {
    for (const [userId, r] of this.recovery) {
      const username = this.users.get(userId);
      if (r.hash === codeHash && username !== undefined) return Promise.resolve({ id: userId, username });
    }
    return Promise.resolve(null);
  }

  async getRecoveryInfo(userId: string): Promise<{ createdAt: number } | null> {
    const r = this.recovery.get(userId);
    return Promise.resolve(r ? { createdAt: r.createdAt } : null);
  }

  /** Nur für Tests: Anzahl der Zeilen je Tabelle. */
  snapshot(): { challenges: number; users: number; passkeys: number; sessions: number } {
    return {
      challenges: this.challenges.size, users: this.users.size,
      passkeys: this.passkeys.size, sessions: this.sessions.size,
    };
  }
}
