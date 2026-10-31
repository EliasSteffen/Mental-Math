// In-Memory-AuthStore für Tests und Demos; Semantik wie die SQL-Funktionen im Plan.
import type {
  AuthStore, AuthUser, Base64URL, ChallengePurpose, ChallengeRecord, NewPasskey, StoredPasskey,
} from '../shared/types.ts';
import { PasskeyAuthError } from '../shared/errors.ts';

interface SessionRow { userId: string; expiresAt: number }

export class MemoryAuthStore implements AuthStore {
  private readonly now: () => number;
  private readonly challenges = new Map<string, ChallengeRecord>();
  private readonly users = new Map<string, string>();
  private readonly passkeys = new Map<string, StoredPasskey>();
  private readonly sessions = new Map<string, SessionRow>();
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

  async createSession(userId: string, tokenHash: string, expiresAt: number): Promise<void> {
    this.sessions.set(tokenHash, { userId, expiresAt });
    return Promise.resolve();
  }

  async rotateSession(oldHash: string, newHash: string, expiresAt: number): Promise<AuthUser | null> {
    const s = this.sessions.get(oldHash);
    this.sessions.delete(oldHash); // abgelaufen: trotzdem löschen
    if (!s || s.expiresAt <= this.now()) return Promise.resolve(null);
    const username = this.users.get(s.userId);
    if (username === undefined) return Promise.resolve(null);
    this.sessions.set(newHash, { userId: s.userId, expiresAt });
    return Promise.resolve({ id: s.userId, username });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.sessions.delete(tokenHash);
    return Promise.resolve();
  }

  /** Nur für Tests: Anzahl der Zeilen je Tabelle. */
  snapshot(): { challenges: number; users: number; passkeys: number; sessions: number } {
    return {
      challenges: this.challenges.size, users: this.users.size,
      passkeys: this.passkeys.size, sessions: this.sessions.size,
    };
  }
}
