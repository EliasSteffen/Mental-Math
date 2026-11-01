// Vertrag des Pakets passkey-auth (siehe docs/PLAN-auth.md). Änderungen nur durch den Architekten.

// ---------- Fehler ----------
export type AuthErrorCode =
  | 'invalid_username' | 'invalid_request' | 'challenge_expired' | 'verification_failed'
  | 'unknown_credential' | 'unauthorized' | 'last_passkey' | 'rate_limited'
  | 'not_supported' | 'cancelled' | 'network' | 'server_error' | 'already_registered' | 'invalid_recovery_code';

/** Fehler-Body aller Endpunkte: HTTP-Status 4xx/5xx + { error: { code } }. */
export interface ErrorBody { error: { code: AuthErrorCode; message?: string } }

// ---------- Nutzer & Session ----------
export interface AuthUser { id: string; username: string }
export interface AuthSession { user: AuthUser; accessToken: string; expiresAt: number /* ms epoch */ }
export interface PasskeyInfo {
  id: string;
  name: string | null;
  createdAt: string;          // ISO
  lastUsedAt: string | null;  // ISO
  backedUp: boolean;
  deviceType: DeviceType | null;
  transports: AuthenticatorTransport[];
}
export type DeviceType = 'singleDevice' | 'multiDevice';

// ---------- WebAuthn JSON (Level 3), selbst definiert → client/ ohne Abhängigkeiten ----------
export type Base64URL = string;
export type AuthenticatorTransport = 'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb';
export type UserVerification = 'discouraged' | 'preferred' | 'required';

export interface CredentialDescriptorJSON { id: Base64URL; type: 'public-key'; transports?: AuthenticatorTransport[] }

export interface RegistrationOptionsJSON {
  rp: { id?: string; name: string };
  user: { id: Base64URL; name: string; displayName: string };
  challenge: Base64URL;
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  timeout?: number;
  excludeCredentials?: CredentialDescriptorJSON[];
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    residentKey?: 'discouraged' | 'preferred' | 'required';
    requireResidentKey?: boolean;
    userVerification?: UserVerification;
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
  hints?: Array<'security-key' | 'client-device' | 'hybrid'>;
  extensions?: Record<string, unknown>;
}

export interface AuthenticationOptionsJSON {
  challenge: Base64URL;
  timeout?: number;
  rpId?: string;
  allowCredentials?: CredentialDescriptorJSON[];
  userVerification?: UserVerification;
  hints?: Array<'security-key' | 'client-device' | 'hybrid'>;
  extensions?: Record<string, unknown>;
}

export interface RegistrationResponseJSON {
  id: Base64URL;
  rawId: Base64URL;
  type: 'public-key';
  response: {
    clientDataJSON: Base64URL;
    attestationObject: Base64URL;
    authenticatorData?: Base64URL;
    transports?: AuthenticatorTransport[];
    publicKeyAlgorithm?: number;
    publicKey?: Base64URL;
  };
  authenticatorAttachment?: 'platform' | 'cross-platform';
  clientExtensionResults: Record<string, unknown>;
}

export interface AuthenticationResponseJSON {
  id: Base64URL;
  rawId: Base64URL;
  type: 'public-key';
  response: {
    clientDataJSON: Base64URL;
    authenticatorData: Base64URL;
    signature: Base64URL;
    userHandle?: Base64URL;
  };
  authenticatorAttachment?: 'platform' | 'cross-platform';
  clientExtensionResults: Record<string, unknown>;
}

// ---------- HTTP-Vertrag (alle POST + JSON unter basePath, Default '/api/auth') ----------
// POST /register/options   body RegisterOptionsReq                       → OptionsRes<RegistrationOptionsJSON>
// POST /register/verify    body VerifyReq<RegistrationResponseJSON>      → SessionRes + Set-Cookie
// POST /login/options      body {}                                       → OptionsRes<AuthenticationOptionsJSON>
// POST /login/verify       body VerifyReq<AuthenticationResponseJSON>    → SessionRes + Set-Cookie
// POST /refresh            Cookie                                        → SessionRes + Set-Cookie | 401
// POST /logout             Cookie                                        → 204 + Cookie gelöscht
// POST /passkeys/options   Authorization: Bearer <accessToken>, body {}  → OptionsRes<RegistrationOptionsJSON>
// POST /passkeys/verify    Bearer, body VerifyReq<RegistrationResponseJSON> → 204
// POST /recovery/status    Bearer, body {}                               → RecoveryStatus
// POST /recovery/create    Bearer, body {}                               → RecoveryCodeRes (ersetzt den alten Code)
// POST /recovery/options   body RecoverOptionsReq                        → OptionsRes<RegistrationOptionsJSON> | invalid_recovery_code
// POST /recovery/verify    body RecoverVerifyReq                         → SessionRes (mit neuem recoveryCode) + Set-Cookie
export interface RegisterOptionsReq { username: string }
export interface OptionsRes<T> { flowId: string; options: T }
export interface VerifyReq<R> { flowId: string; response: R }
export interface SessionRes {
  user: AuthUser; accessToken: string; expiresAt: number;
  /** Nur nach Registrierung und Wiederherstellung: neuer Wiederherstellungscode, wird genau einmal ausgeliefert */
  recoveryCode?: string;
}
export interface RecoveryStatus { exists: boolean; createdAt: string | null /* ISO */ }
export interface RecoveryCodeRes { code: string }
export interface RecoverOptionsReq { code: string }
export interface RecoverVerifyReq extends VerifyReq<RegistrationResponseJSON> { code: string }
/** Session plus einmalig sichtbarer Wiederherstellungscode (fehlt, wenn der Server ihn nicht speichern konnte) */
export type SessionWithRecovery = AuthSession & { recoveryCode?: string };

// ---------- Client ----------
export interface SupportInfo { webauthn: boolean; platform: boolean; conditional: boolean }

/** Browser-Zugriff (client/webauthn.ts). Für Tests injizierbar. Fehler → PasskeyAuthError. */
export interface WebAuthnApi {
  support(): Promise<SupportInfo>;
  create(options: RegistrationOptionsJSON, signal?: AbortSignal): Promise<RegistrationResponseJSON>;
  get(options: AuthenticationOptionsJSON, o?: { mediation?: 'conditional' | 'optional'; signal?: AbortSignal }): Promise<AuthenticationResponseJSON>;
}

/** Ablage des Refresh-Tokens in nativen App-Hüllen (z. B. Keychain). null = löschen. */
export interface RefreshStore {
  get(): Promise<string | null>;
  set(token: string | null): Promise<void>;
}

export interface PasskeyAuthOptions {
  baseUrl?: string;                 // Default '/api/auth'
  fetch?: typeof fetch;
  webauthn?: WebAuthnApi;           // Default: client/webauthn.ts
  now?: () => number;
  refreshRetryDelayMs?: number;     // Default 400: zweiter /refresh-Versuch nach 401 (anderer Tab hat evtl. gerade rotiert)
  /** Native App: Refresh-Token per Header (REFRESH_HEADER) statt Cookie; Server braucht die Origin in appOrigins */
  refreshStore?: RefreshStore;
}

export interface PasskeyAuthClient {
  support(): Promise<SupportInfo>;
  register(username: string, o?: { signal?: AbortSignal }): Promise<SessionWithRecovery>;
  login(o?: { conditional?: boolean; signal?: AbortSignal }): Promise<AuthSession>;
  addPasskey(o?: { signal?: AbortSignal }): Promise<void>;
  /** Alle Passkeys verloren: mit dem Wiederherstellungscode einen neuen Passkey anlegen und anmelden */
  recover(code: string, o?: { signal?: AbortSignal }): Promise<SessionWithRecovery>;
  /** Angemeldet: neuen Code erzeugen (der alte wird ungültig) */
  createRecoveryCode(): Promise<string>;
  recoveryStatus(): Promise<RecoveryStatus>;
  restore(): Promise<AuthSession | null>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  getSession(): AuthSession | null;
  onChange(cb: (s: AuthSession | null) => void): () => void;
}

// ---------- Server-Persistenz ----------
export type ChallengePurpose = 'register' | 'login' | 'add' | 'recover';
export interface ChallengeRecord {
  id: string;                 // = flowId (UUID)
  challenge: Base64URL;
  purpose: ChallengePurpose;
  userId: string | null;      // register: neue UUID; add: eingeloggter User; recover: User des Codes; login: null
  username: string | null;    // nur register
  expiresAt: number;          // ms epoch
}
export interface StoredPasskey {
  id: string;
  userId: string;
  credentialId: Base64URL;
  publicKey: Base64URL;       // COSE-Key
  counter: number;
  transports: AuthenticatorTransport[];
  deviceType: DeviceType;
  backedUp: boolean;
}
export type NewPasskey = Omit<StoredPasskey, 'id' | 'userId'>;

export interface AuthStore {
  createChallenge(c: ChallengeRecord): Promise<void>;
  /** Atomar: löscht und liefert die Challenge, nur wenn purpose passt und nicht abgelaufen; sonst null. */
  consumeChallenge(id: string, purpose: ChallengePurpose): Promise<ChallengeRecord | null>;
  createUserWithPasskey(user: AuthUser, pk: NewPasskey): Promise<void>;
  addPasskey(userId: string, pk: NewPasskey): Promise<void>;
  findPasskey(credentialId: Base64URL): Promise<(StoredPasskey & { username: string }) | null>;
  listCredentialIds(userId: string): Promise<Base64URL[]>;
  touchPasskey(id: string, counter: number): Promise<void>;
  createSession(userId: string, tokenHash: string, expiresAt: number): Promise<void>;
  /** Atomar: alte Session (gültig) löschen, neue anlegen; liefert den User oder null. */
  rotateSession(oldHash: string, newHash: string, expiresAt: number): Promise<AuthUser | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Wiederherstellungscode setzen oder ersetzen (ein Code pro User, nur der Hash) */
  setRecoveryCode(userId: string, codeHash: string): Promise<void>;
  findRecoveryUser(codeHash: string): Promise<AuthUser | null>;
  getRecoveryInfo(userId: string): Promise<{ createdAt: number } | null>;
}

// ---------- Server ----------
export interface ServerConfig {
  rpId: string;
  rpName: string;
  origins: string[];
  jwt: {
    key: string;              // privater JWK als JSON (ES256/RS256, mit kid) ODER HS256-Secret
    issuer: string;
    ttlSec?: number;          // Default 900
  };
  refresh?: {
    ttlSec?: number;          // Default 30 Tage
    cookieName?: string;      // Default 'mm_rt'
    cookiePath?: string;      // Default basePath
    secure?: boolean;         // Default true (lokal über http://localhost ggf. false)
  };
  challengeTtlSec?: number;   // Default 300
  basePath?: string;          // Default '/api/auth'
  /** Origins nativer App-Hüllen (z. B. 'capacitor://localhost'): Refresh-Token per Header statt Cookie,
   *  zusätzlich gilt https://<rpId> als WebAuthn-Origin (so meldet iOS native Passkeys). */
  appOrigins?: string[];
}

export interface AuthHandlerDeps {
  now?: () => number;
  randomBytes?: (n: number) => Uint8Array;
  randomUUID?: () => string;
}

export type AuthHandler = (req: Request) => Promise<Response>;
