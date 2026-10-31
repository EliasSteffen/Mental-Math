# Plan v10 – Offline-First Data-Layer mit Supabase-Sync

Ziel: Alle Trainingsdaten bleiben lokal sofort verfügbar, auch offline. Ist der Nutzer angemeldet (Passkey-Konto aus v9), synchronisiert ein Hintergrund-Sync sie mit Supabase, sodass mehrere Geräte denselben Stand haben. Die App spricht nur mit einer Repository-Fassade und kennt weder IndexedDB noch Supabase.

Leitplanken aus [PLAN-v5.md](PLAN-v5.md) und [PLAN-auth.md](PLAN-auth.md) gelten weiter: strict TS, `.ts`-Imports, kein `any`, `erasableSyntaxOnly`, kurze deutsche Kommentare.

---

## 0. Ausgangslage und Architekturentscheidungen

Vorhanden seit v7 (`src/data/`):

```
App (17 Dateien) → storage.ts (öffentliche API, synchron) → Repository (Cache + Änderungsprotokoll)
                                                           → StorageAdapter (localStorage | Memory)
                    SyncEngine + NoopSyncProvider (Stub, Last-Write-Wins über updatedAt)
```

Synchronisiert werden heute die Collections `results` (Versuche, max. 5.000) und `sessions` (Runden, max. 500). Dazu kommen die Dokumente `profile`, `settings`, `reviews`, `activity`, `dailyResults`, `chainBest` und `parallel`. Jedes Objekt in den Collections trägt `SyncMeta` (`id`, `createdAt`, `updatedAt`, `deletedAt`, `deviceId`, `rev`). Jede Änderung landet als `ChangeRecord` im Protokoll (Outbox).

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | **Weiterentwickeln statt ersetzen.** `IGameRepository` wird als Interface in `src/types.ts` festgeschrieben. `src/data/storage.ts` implementiert es (`satisfies IGameRepository`), und die 17 App-Dateien behalten ihre Importe. | Die App ist schon heute frei von Speicher-Technik: Sie kennt nur `storage.ts`. Ein Umbau aller Aufrufer brächte nur Risiko. |
| D2 | **Revidiert, siehe §6: generischer Kern als Workspace-Paket `packages/offline-sync`, Fachregeln in der App.** | Ursprünglich als App-Code geplant. Ein **statisch** importiertes Vendor-Bundle (`src/vendor/storage.ts`, mit esbuild gebündelt) funktioniert aber auch beim Start synchron. |
| D3 | **IndexedDB mit „Hydrate then Cache“.** Beim Start lädt `await initStorage()` alle Schlüssel aus IndexedDB in ein Speicherabbild, danach startet der Router. Lesen bleibt **synchron**. Schreiben aktualisiert das Abbild sofort und schreibt verzögert nach IndexedDB: 150 ms gebündelt, sofort bei `pagehide` oder `visibilitychange: hidden`. Fehlt IndexedDB (Privatmodus, Tests), dient `LocalStorageAdapter` als Fallback. | So muss keine der 17 Dateien auf `async` umgestellt werden. IndexedDB hat keine 5-MB-Grenze und blockiert nicht beim Schreiben. |
| D4 | **Einmalige Migration localStorage → IndexedDB.** Sind die IndexedDB-Daten leer und gibt es Schlüssel `mm:v3:*` in localStorage, werden alle übernommen und danach aus localStorage entfernt. Die Alt-Schlüssel `kopfrechner.v1*` bleiben unberührt, die regelt `migrate.ts`. | Bestehende Nutzer verlieren nichts. |
| D5 | **Zwischen Tabs:** Nach jedem Flush meldet `BroadcastChannel('mm-data')` die geänderten Schlüssel. Andere Tabs laden sie nach und verwerfen ihren Cache. Das ersetzt das `storage`-Event, das es bei IndexedDB nicht gibt. | |
| D6 | **Client-IDs sind endgültig, es gibt kein ID-Mapping.** Datensätze tragen ab Erzeugung eine global eindeutige ID: Versuche eine UUID, Runden `s…`. Der Server übernimmt sie als Primärschlüssel **`(user_id, id)`**. | Der zusammengesetzte Schlüssel verhindert Kollisionen zwischen Nutzern. Ein Fremder kann keine Zeile eines anderen Nutzers überschreiben, auch nicht mit derselben ID. |
| D7 | **Das `synced`-Flag ist abgeleitet statt gespeichert.** Ein Objekt gilt als synchronisiert, wenn es keinen offenen `ChangeRecord` mehr hat. Die Supabase-Tabellen haben **kein** `synced`, weil Serverzeilen per Definition synchron sind. | Ein Flag pro Zeile müsste bei jeder Bestätigung die ganze Collection neu schreiben. Die Outbox kann das schon, auch für Löschungen und Dokumente. |
| D8 | **Konflikte: Collections nach Last-Write-Wins, Dokumente per Merge.** Collections entscheiden nach `(updatedAt, rev, deviceId)`, also deterministisch, und zwar sowohl auf dem Client als auch per Trigger auf dem Server. Dokumente werden fachlich zusammengeführt (Tabelle unten): Maximum, LWW pro Schlüssel, Aktivität pro Gerät. | Mit reinem LWW würde z. B. die Tagesaktivität des einen Geräts verloren gehen, wenn auf zwei Geräten am selben Tag trainiert wird. Die Merge-Regeln sind kommutativ und idempotent, deshalb laufen alle Geräte auf denselben Stand zu. |
| D9 | **Ablauf einer Sync-Runde: erst Pull, dann Push.** Pull holt seitenweise, mit Keyset auf `(server_updated_at, id)`. Zu Beginn jeder Runde springt der Cursor 60 s zurück, damit verspätet committete Zeilen nicht durchrutschen. Das Anwenden ist idempotent. Danach pusht die Runde die offenen Änderungen in Paketen zu je 200 als Upsert. | Bei Pull vor Push werden Dokumente vor dem Hochladen zusammengeführt. Dass Zeilen doppelt ankommen, schadet durch die Idempotenz nicht. |
| D10 | **Überlauf führt zum Vollabgleich statt zu Datenverlust.** Bisher hat das Protokoll bei mehr als 2.000 Einträgen still die ältesten verworfen. Neu wird `fullPushNeeded` gesetzt: Die nächste Runde lädt alle lokalen Daten hoch, Upserts sind idempotent. Dasselbe passiert bei der ersten Anmeldung auf einem Gerät mit vorhandenen Daten. | Auch mehrere Wochen offline gehen nichts verloren. |
| D11 | **Der Sync läuft nur, solange jemand angemeldet ist.** Der Provider ist `SupabaseSyncProvider` und spricht über PostgREST mit dem Passkey-JWT (`createPasskeySupabaseClient` aus v9). RLS sichert jede Zeile mit `user_id = auth.uid()`. | Es braucht keine eigenen Server-Endpunkte, und die CSP erlaubt die Supabase-URL bereits. |
| D12 | **Kein Background Sync API im Service Worker.** „Im Hintergrund“ bedeutet, solange die Seite offen ist. Der Sync startet bei App-Start, bei `online`, bei `visibilitychange: visible`, 5 s nach dem letzten Schreiben und alle 5 min, solange die Seite sichtbar ist. Mehrere Tabs synchronisieren nie gleichzeitig: Dafür sorgt `navigator.locks` mit `ifAvailable`. | Das Access-Token liegt nur im Speicher der Seite, der Service Worker hat es nicht. Außerdem gibt es das Background Sync API nur in Chromium. |
| D13 | **Geräte-lokale Einstellungen** (`keypad`, `lastSeenVersion`) werden nicht hochgeladen. Beim Merge behält jedes Gerät seine eigenen Werte. | Handy und Desktop brauchen unterschiedliche Tastatur-Einstellungen. |
| D14 | **Das Profil-Dokument wird nicht synchronisiert.** Es ist geräte-spezifisch (Geräte-ID, `cloudUserId`). | |

### Merge-Regeln für Dokumente (`src/data/merge.ts`, reine Funktionen)

| Dokument | Remote-Name | Regel |
|---|---|---|
| `settings` | `settings` | LWW über `updatedAt` für das ganze Dokument. Geräte-lokale Schlüssel (D13) bleiben immer lokal. |
| `reviews` | `reviews` | Pro Subtyp gewinnt der Eintrag mit größerem `lastTs`. |
| `dailyResults` | `dailyResults` | Pro Datum gewinnt der Eintrag mit mehr `points`, bei Gleichstand der frühere `ts`. |
| `chainBest` | `chainBest` | Pro Level das Maximum. |
| `parallel` | `parallel` | `bestChains`, `bestCorrectStreak` und `rounds` nach Maximum. `nextStart` bleibt lokal, weil es pro Gerät adaptiv ist. |
| `activity` (eigenes Gerät) | `activity:<deviceId>` | Jedes Gerät schreibt nur seine eigene Zeile. Kommt die eigene Zeile zurück (Wiederherstellung), gilt pro Tag das Maximum. |
| `activity` fremder Geräte | `activity:<andere deviceId>` | Lokal im Dokument `activityRemote` (`{deviceId: Activity}`) abgelegt, ohne Tracking. `getActivity()` liefert die **Summe** aus eigener und fremder Aktivität. |
| `profile` | – | Wird nicht synchronisiert (D14). |

Nach einem Merge wird das Ergebnis nur dann wieder hochgeladen, wenn es sich vom Remote-Stand unterscheidet (stabiler JSON-Vergleich). So konvergiert der Stand ohne Ping-Pong.

---

## 1. Verträge (Phase 0, Architekt) – `src/types.ts`, Abschnitt „Data-Layer & Cloud-Sync (v10)“

```ts
export type SyncTarget = SyncCollection | SyncDocument;
export type SyncRecord = SyncMeta & Record<string, unknown>;      // GameResult | SessionStats

/** Fassade, über die die App mit Daten spricht (Implementierung: src/data/storage.ts). */
export interface IGameRepository { /* alle heutigen Lese-/Schreibfunktionen von storage.ts + onChange */ }

/** Persistenter Adapter: liest synchron aus dem Speicherabbild, schreibt verzögert. */
export interface PersistentAdapter extends StorageAdapter {
  flush(): Promise<void>;
  onExternalChange(cb: (keys: string[]) => void): () => void;
  close(): void;
}

export interface RemoteDoc { name: string; data: Record<string, unknown>; updatedAt: number; deviceId: string }
export interface PullPage {
  records: Array<{ collection: SyncCollection; item: SyncRecord }>;
  docs: RemoteDoc[];
  cursor: string | null;   // opak, gehört dem Provider
  hasMore: boolean;
}
export type SyncErrorKind = 'offline' | 'auth' | 'invalid' | 'server';

export interface RemoteSyncProvider {
  readonly name: string;
  upsertRecords(collection: SyncCollection, items: readonly SyncRecord[]): Promise<void>;
  upsertDocs(docs: readonly RemoteDoc[]): Promise<void>;
  pull(cursor: string | null, o: { limit: number; rewind: boolean }): Promise<PullPage>;
  deleteAll(): Promise<void>;
}

export type SyncPhase = 'disabled' | 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  phase: SyncPhase; lastSyncAt: number | null; lastError: SyncErrorKind | null;
  pending: number; pushed: number; pulled: number; rejected: number;
}

// SyncState bekommt zusätzlich: cursor: string | null; fullPushNeeded: boolean
```

Dazu `src/data/sync-error.ts`: `class SyncError extends Error { readonly kind: SyncErrorKind }`. Provider werfen ausschließlich `SyncError`.

---

## 2. Supabase-Schema – `sql/002_training_data.sql` (Sub-Agent B)

Setzt `packages/passkey-auth/sql/001_passkey_auth.sql` voraus (FK auf `public.users`). Idempotent wie 001.

```sql
create table public.training_sessions (           -- Session (Runde), Spalten nach Vorgabe
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  mode text not null check (char_length(mode) <= 64),
  score integer not null,                          -- Session.points
  correct_answers integer not null check (correct_answers >= 0),
  total_questions integer not null check (total_questions >= 0 and correct_answers <= total_questions),
  duration_ms bigint not null check (duration_ms >= 0),   -- round(avgTimeMs × n)
  avg_time_ms integer not null check (avg_time_ms >= 0),  -- verlustfreie Rückwandlung
  created_at timestamptz not null,                 -- Session.ts
  updated_at bigint not null, deleted_at bigint, device_id text not null, rev integer not null,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create table public.training_results (             -- Attempt (Versuch)
  user_id …, id text …, session_id text not null, created_at timestamptz not null,
  mode text, category text, subtype text, correct boolean not null,
  error_type text check (error_type in ('nullen','knapp','falsch','skip')),
  time_ms integer not null, target_ms integer not null, points integer not null, level smallint,
  payload jsonb not null check (pg_column_size(payload) <= 16384),   -- übrige Attempt-Felder verlustfrei
  updated_at …, deleted_at …, device_id …, rev …, server_updated_at …,
  primary key (user_id, id)
);
create table public.user_documents (
  user_id …, name text not null check (name ~ '^(settings|reviews|dailyResults|chainBest|parallel|activity:[0-9a-f-]{36})$'),
  data jsonb not null check (pg_column_size(data) <= 262144),
  updated_at bigint not null, device_id text not null, server_updated_at timestamptz not null default now(),
  primary key (user_id, name)
);
-- Index je Tabelle: (user_id, server_updated_at, id|name) für den Keyset-Pull
```

- **Trigger `mm_sync_guard()`** (`before insert or update`, alle drei Tabellen):
  - Bei UPDATE mit `new.updated_at < old.updated_at`: `return null`. Ältere Stände werden still verworfen, das ist LWW auf dem Server.
  - Bei Gleichstand gilt `(rev, device_id)` als Tie-Break.
  - `user_id` und `id` sind unveränderlich.
  - Setzt `server_updated_at = now()`.
- **RLS:**
  - Zuerst alles von `anon` und `authenticated` entziehen.
  - `authenticated` bekommt `select`, `insert` und `update`, jeweils mit der Policy `user_id = (select auth.uid())`, bei Insert und Update auch als `with check`.
  - **Kein** `delete`, gelöscht wird per Soft-Delete über `deleted_at`.
- **`mm_delete_my_data()`:** `security definer`, `search_path = ''`, nur für `authenticated`. Löscht alle Zeilen von `auth.uid()` aus den drei Tabellen. Gebraucht wird das für „Alle Daten löschen“ im angemeldeten Zustand.
- **Konto löschen:** Über `pa_delete_account` greift der FK mit `on delete cascade` und entfernt auch alle Trainingsdaten.

**Tests:** `tests/data-sql.test.ts` mit PGlite. Als Vorspann laufen `packages/passkey-auth/tests/helpers/supabase-sim.sql` und das passkey-Schema 001. Geprüft werden:
- RLS: fremde Zeilen sind unsichtbar, fremde `user_id` wird beim Insert abgewiesen.
- `anon` hat keinen Zugriff.
- LWW-Trigger: eine ältere `updated_at` verändert nichts, `server_updated_at` steigt.
- Die Namensregel für Dokumente.
- `mm_delete_my_data`.
- Kaskade beim Löschen des Kontos.
- Das Schema lässt sich zweimal hintereinander ausführen.

---

## 3. Module und Abläufe

### A – Lokaler Adapter (`src/data/idb.ts`, `adapters.ts`, `ids.ts`, `storage.ts`, `app.ts`)

```ts
export class IndexedDbAdapter implements PersistentAdapter {
  static open(o?: { dbName?: string; idb?: IDBFactory; channel?: (name: string) => BroadcastChannelLike | null;
                    migrateFrom?: StorageAdapter | null; debounceMs?: number }): Promise<IndexedDbAdapter>;
  readonly name: 'indexedDB';
  get / set / remove / keys   // synchron auf dem Speicherabbild; set/remove markieren den Schlüssel als dirty
  flush(): Promise<void>      // alle dirty-Schlüssel in EINER readwrite-Transaktion, danach Broadcast der Schlüssel
  onExternalChange(cb)        // Broadcast aus anderen Tabs → betroffene Schlüssel aus IDB nachladen → cb(keys)
  close(): void
}
export async function initStorageAdapter(): Promise<StorageAdapter>   // IDB oder Fallback localStorage, inkl. Migration D4
```

- **DB und Store:** DB `mental-math`, Version 1, Object Store `kv` (Schlüssel: String, Wert: String). Jeder `set` wird gebündelt (150 ms), bei `pagehide` bzw. `visibilitychange: hidden` sofort geflusht. Schlägt ein Schreiben fehl, bleiben die Schlüssel dirty und der nächste Flush versucht es erneut. Die App blockiert dabei nie.
- **`ids.ts`:** `setDefaultAdapter(a)`.
- **`storage.ts`:**
  - `export async function initStorage(): Promise<void>` setzt Adapter und Repository und registriert `onExternalChange` → `invalidateCache()`.
  - Das `storage`-Event bleibt nur für den localStorage-Fallback.
- **`app.ts`:** `await initStorage()` vor `startRouter()`. Top-Level-Await ist im ES-Modul erlaubt.
- **Tests:** `tests/idb.test.ts` mit `fake-indexeddb` deckt ab:
  - Roundtrip
  - Bündelung, also eine Transaktion für viele `set`
  - Flush bei `pagehide`
  - Migration aus localStorage (Quelle danach leer)
  - Broadcast zwischen zwei Adapter-Instanzen
  - Fallback, wenn `indexedDB` fehlt
  - Wiederholung nach fehlgeschlagener Transaktion

### B – Remote-Adapter (`sql/002_training_data.sql`, `src/data/remote/{mappers,supabase-provider}.ts`)

```ts
export function createSupabaseSyncProvider(client: SupabaseClient, userId: string): RemoteSyncProvider;
// mappers.ts: sessionToRow / rowToSession, resultToRow / rowToResult, docToRow / rowToDoc (reine Funktionen, verlustfrei)
```

- **Import:** `SupabaseClient` nur als `import type`. Den Client erzeugt die App aus dem Vendor-Bundle.
- **Upserts:** `.upsert(rows, { onConflict: 'user_id,id' })` bzw. `'user_id,name'`, jeweils höchstens 200 Zeilen.
- **Pull:**
  - Die drei Tabellen werden parallel abgefragt, Keyset `(server_updated_at, id|name)`, sortiert aufsteigend mit `limit`.
  - Der Cursor ist ein JSON-String mit je einer Position pro Tabelle. `rewind: true` setzt jede Position 60 s zurück.
  - Beim ersten Pull (Cursor `null`) kommen bei `training_results` nur Zeilen der letzten 365 Tage.
  - `hasMore` ist wahr, sobald eine Tabelle `limit` Zeilen geliefert hat.
- **Fehler werden auf `SyncError` abgebildet:**
  - Fetch-`TypeError` bzw. Status 0 → `offline`
  - 401, PGRST301 oder PGRST303 → `auth`
  - 400, 409 oder 422 sowie Postgres-Codes 22xxx/23xxx → `invalid`
  - sonst `server`
- **Tests:** `tests/supabase-provider.test.ts` (Fake-Builder wie in v9) und `tests/mappers.test.ts` (Roundtrip Attempt/Session/Doc, inklusive alter Versuche ohne optionale Felder).

### C – Sync (`src/data/{repository,sync,merge,sync-manager}.ts`)

**Repository:**
- `SyncState` bekommt `cursor` und `fullPushNeeded`; fehlen sie in alten Daten, gelten Defaults.
- Überlauf setzt nach D10 `fullPushNeeded` und leert `pending`.
- Neu sind `markFullPush()`, `setCursor(c)` und `onTrackedChange(cb)`. `onTrackedChange` meldet nur protokollierte Änderungen, also keine angewendeten Remote-Daten.

**`SyncEngine`:**

```ts
new SyncEngine(repo, { deviceId: () => string, now?, pageSize = 500, chunkSize = 200 })
setProvider(p | null); syncNow(): Promise<SyncStatus>; wipeRemote(): Promise<void>
```

Eine Runde `syncNow`:
1. **Pull-Schleife:** Die erste Seite läuft mit `rewind: true`.
   - Records: LWW nach D8, angewendet mit `track = false`.
   - Docs: über `mergeDoc` nach der Merge-Tabelle. Fremde `activity:*` landen in `activityRemote`.
   - Danach wird der Cursor gespeichert.
2. **Push:** Basis ist eine Momentaufnahme von `pending`, oder bei `fullPushNeeded` alles lokal Vorhandene.
   - Records gehen pro Collection in Paketen hoch, Dokumente als `RemoteDoc`. `activity` heißt dabei `activity:<deviceId>`, `profile` wird übersprungen und sofort bestätigt (ack), Einstellungen ohne die geräte-lokalen Schlüssel.
   - Nach jedem erfolgreichen Paket werden dessen Einträge bestätigt (ack).
   - Bei `invalid` wird das Paket einzeln wiederholt. Was dann immer noch `invalid` ist, wird bestätigt und als `rejected` gezählt, damit der Sync nicht ewig hängt.
3. **Fehler:** `offline` und `auth` beenden die Runde ohne Datenverlust, `pending` bleibt.

**`SyncManager`:**

```ts
new SyncManager(engine, env?: SyncEnv)   // env injizierbar: isOnline, on('online'|'offline'|'visible'|'hidden'), timer, now, lock
enable(provider); disable(); request(reason: 'start'|'online'|'visible'|'write'|'manual'|'interval'); syncNow(); getStatus(); onStatus(cb)
```

- **Single-Flight:** Kommt während einer laufenden Runde eine neue Anfrage, startet danach genau eine weitere.
- **Taktung:**
  - `write` wartet nach dem letzten Schreiben 5 s (Debounce).
  - `interval` läuft alle 5 min, solange die Seite sichtbar ist.
  - Backoff: 5 s · 2ⁿ, höchstens 5 min, ±20 % Jitter.
- **Fehlerzustände:**
  - Bei `auth` geht der Status auf `error` und es gibt keine automatischen Wiederholungen, bis `enable` oder `manual` kommt.
  - Bei `offline` geht er auf `offline` und wartet auf das Event `online`.
- **Mehrere Tabs:** Der Lock heißt `mm-sync` (`navigator.locks`, `ifAvailable`). Ohne Locks läuft der Sync einfach.

**`merge.ts`:** `mergeDoc(name, local, remote, o)` und `stableEqual(a, b)` nach der Merge-Tabelle. Die Tests prüfen Kommutativität, Idempotenz und die Fälle der Tabelle.

---

## 4. Integration (Phase 3, Architekt)

- **Konto ↔ Sync** (`features/account.ts`):
  - Bei `signed-in` wird `createSupabaseSyncProvider(db, user.id)` erzeugt, dann folgen `syncManager.enable` und `navigator.storage.persist()`.
  - Bei `signed-out` folgt `disable`.
  - Die erste Anmeldung auf diesem Gerät setzt `profile.cloudUserId = user.id` und `markFullPush()`.
- **Kontowechsel:**
  - Ist das lokale Profil schon mit einem **anderen** Konto verknüpft, erscheint ein Dialog „Lokale Daten gehören zu einem anderen Konto“.
  - Wahl 1: „Lokale Daten ersetzen“ führt zu `resetAll` und Pull.
  - Wahl 2: „Abbrechen“ führt zur Abmeldung.
  - Niemals werden fremde Daten still in ein Konto hochgeladen.
- **„Alle Daten löschen“ im angemeldeten Zustand** löscht auch die Cloud (`wipeRemote` über `mm_delete_my_data`), mit angepasstem Text im Bestätigungsdialog. Abgemeldet wird nur lokal gelöscht.
- **`storage.ts`:**
  - `getActivity()` summiert `activity` und `activityRemote`.
  - `onChange` für das Interface.
  - `satisfies IGameRepository`.
- **Nach einem Pull mit Änderungen** wird die Ansicht neu gerendert, aber nicht mitten im Training (Routen `train`, `parallel`, `chain` ausgenommen).
- **UI in der Konto-Karte:**
  - Statuszeile, z. B. „Synchronisiert vor 2 Min“, „3 Änderungen ausstehend“, „Offline – wird später synchronisiert“ oder „Anmeldung abgelaufen“.
  - Button „Jetzt synchronisieren“.
  - Texte in Deutsch und Englisch.
- **Release** 1.10.0, `CHANGELOG.md`.
- **Abnahme:**
  - Das SQL läuft im Supabase-Projekt (Schritt für den Nutzer).
  - Live-Test mit zwei Browser-Profilen: offline trainieren, wieder online gehen, Daten erscheinen auf dem zweiten Gerät.
  - RLS live gegen das Projekt prüfen.

---

## 5. Delegation (Phase 2, parallel)

| Agent | Modell | Dateien (exklusiv) | Abnahme |
|---|---|---|---|
| **A** Lokaler Speicher | Sonnet, low | `src/data/idb.ts` (neu), `src/data/adapters.ts`, `src/data/ids.ts`, `src/data/storage.ts` (nur Init und Tab-Abgleich), `src/app.ts` (nur `await initStorage()`), `tests/idb.test.ts` | Tests aus Abschnitt 3A grün. Alle bestehenden Storage-Tests bleiben grün. Typecheck ohne Fehler. |
| **B** Remote + SQL | Sonnet, low | `sql/002_training_data.sql`, `src/data/remote/{mappers,supabase-provider}.ts`, `tests/{data-sql,supabase-provider,mappers}.test.ts` | Abschnitt 2 genau umgesetzt, PGlite-Tests grün, Mapper verlustfrei |
| **C** Sync | Sonnet, low | `src/data/{repository,sync,merge,sync-manager}.ts`, `tests/{merge,sync-engine,sync-manager}.test.ts`, `tests/storage-v3.test.ts` (nur die Sync- und Überlauf-Tests an den neuen Vertrag anpassen) | Abschnitt 3C. Engine-Tests mit einem In-Memory-Fake-Provider: zwei Geräte konvergieren, offline → online, Überlauf, `invalid`-Paket, Merge-Fälle. |

Phase 0 (Architekt, vor dem Start): Verträge in `src/types.ts`, `src/data/sync-error.ts` und `fake-indexeddb` (6.2.6, gepinnt) als devDependency.

---

## 6. Paket `packages/offline-sync` (Umbau nach A/B/C)

Auf Wunsch des Nutzers wird der generische Teil zu einem wiederverwendbaren Workspace-Paket, analog zu `passkey-auth`. Der Vertrag steht in `packages/offline-sync/src/types.ts` und ist verbindlich. Die Fachregeln kommen per Konfiguration aus der App.

| Paket `offline-sync` | App `src/data/` |
|---|---|
| `SyncMeta`, `ChangeRecord`, `SyncState`, Adapter-, Provider- und Status-Typen | `src/types.ts` re-exportiert sie mit `export type { … } from 'offline-sync'`. App-Typen wie `GameResult`, `UserProfile` und `IGameRepository` bleiben in der App. |
| `Repository` (generisch, ID-Index statt O(n)-Suche), `MemoryAdapter`, `LocalStorageAdapter(prefix)`, `IndexedDbAdapter`, `initStorageAdapter`, `newId`, `getDeviceId`, `createMeta`/`touch`/`tombstone` | `storage.ts` als Fassade, die `IGameRepository` erfüllt; dazu `schema.ts`, `migrate.ts` (inkl. LegacyStore) und `transfer.ts` |
| `SyncEngine({ schema: SyncSchema, … })`, `SyncManager`, `browserSyncEnv` | `sync-schema.ts`: Collections `results` (5.000) und `sessions` (500) sowie die Dokumente mit den Merge-Regeln aus §0. `activity` ist dabei `perDevice`, `settings` bekommt `toRemote` (ohne geräte-lokale Felder) und `updatedAt`. |
| Merge-Bausteine: `stableEqual`, `compareMeta`, `maxByKey`, `lwwByKey(field)`, `lwwDoc` | Fachliche Merge-Funktionen auf Basis dieser Bausteine (`dailyResults`, `parallel` usw.) |
| `offline-sync/supabase`: `createSupabaseSyncProvider(client, userId, schema: SupabaseSyncSchema)` mit Keyset-Pull, Paketen, Fehlerabbildung und Mapping der Dokumenttabelle | `remote/mappers.ts` und `remote/supabase-schema.ts` (Collection → Tabelle + Mapper) |
| `sql/offline_sync_guard.sql`: generischer Trigger `public.offline_sync_guard()`, gesteuert über `TG_ARGV` (Schlüsselspalte, Vergleich mit/ohne `rev`) | `sql/002_training_data.sql`: typisierte Tabellen, RLS, `mm_delete_my_data`, Trigger mit `execute function public.offline_sync_guard('id','rev')` |

**Laufzeit in der App:**
- Code aus npm-Paketen landet nur in den beiden Vendor-Bundles.
- `src/vendor/storage.ts` (`export * from 'offline-sync'`) wird **statisch** importiert und im Precache vorgehalten.
- `offline-sync/supabase` liegt im lazy geladenen `src/vendor/auth.ts`, weil es erst nach der Anmeldung gebraucht wird.
- Fehler werden über `isSyncError` per Name erkannt, nicht per `instanceof`, weil Provider und Engine in getrennten Bundles liegen.

**Ablauf:**
- **Phase 2b (parallel):** Agent P1 übernimmt Kern und Sync, Agent P2 Supabase und SQL. Beide ziehen die Dateien von A, B und C in das Paket um, machen sie generisch und nehmen ihre Tests mit.
- **Phase 2c:** Agent P3 stellt die App auf das Paket um und löscht die umgezogenen Dateien. Alle 455 App-Tests müssen grün bleiben, angepasst nur dort, wo Importe umziehen.
- **Phase 3:** Integration nach §4.

---

## 7. Löschen auf allen Geräten (Lösch-Markierung)

**Problem:** `mm_delete_my_data` löscht die Zeilen hart. Andere Geräte erfahren davon beim Pull nichts. Sie behalten ihre lokale Kopie und laden noch ausstehende alte Änderungen wieder hoch.

**Lösung, generisch im Paket:**
- **Reserviertes Dokument `wipe`** (`WIPE_DOC`) mit `{ at: number }` (Epoch-ms). Es gehört nicht ins App-Schema, die Engine behandelt es selbst.
- **`Repository`:**
  - `getAppliedWipe(): number` liefert 0, wenn nichts gesetzt ist; dazu `setAppliedWipe(at)`. Beides liegt unter dem Adapter-Schlüssel `wipeAt`.
  - `clear(keep)` behält **immer** `deviceId` und `wipeAt`.
- **`SyncEngine.wipeRemote()`:**
  1. `provider.deleteAll()`
  2. `upsertDocs([{ name: 'wipe', data: { at }, updatedAt: at, deviceId }])`
  3. `setAppliedWipe(at)` und `setCursor(null)`
- **Pull:**
  - Enthält eine Seite `wipe` mit `at > getAppliedWipe()`, ruft die Engine `onRemoteWipe()` auf. Default ist `repo.clear()`, die App übergibt `resetAll`.
  - Danach folgen `setAppliedWipe(at)` und `setCursor(null)`, und der Pull startet neu, höchstens einmal pro Runde.
  - Ausstehende Änderungen von vor dem Löschen werden **nicht** hochgeladen, `resetAll` leert die Warteschlange.
  - Ist `at` nicht größer, wird die Markierung ignoriert.
- **Neue Geräte:** Verknüpft ein Gerät sich zum ersten Mal mit dem Konto oder ersetzt es fremde Daten, setzt die App `setAppliedWipe(now)`. Frühere Löschungen betreffen dieses Gerät nicht.

**App:**
- Die Namensregel in `user_documents` erlaubt zusätzlich `wipe`. Das SQL ändert den Constraint idempotent mit `drop constraint if exists` und `add constraint`.
- `features/sync.ts`: `onRemoteWipe` ruft `resetAll()` auf, dann `emitDataChange('remote')` und einen Toast „Deine Daten wurden auf einem anderen Gerät gelöscht“.
- Der Bestätigungstext verspricht wieder das Löschen auf allen Geräten, ab dem nächsten Sync.
