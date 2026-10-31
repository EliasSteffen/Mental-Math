# offline-sync

Offline-first Datenschicht ohne Framework: synchrones Repository über IndexedDB/localStorage, Outbox (Änderungsprotokoll), Merge-Regeln per Schema und Hintergrund-Sync gegen einen beliebigen Provider. Die Fachregeln (welche Collections und Dokumente, wie zusammengeführt wird) liefert die App als `SyncSchema`; das Paket kennt keine App-Begriffe.

## Architektur

```
App ── Repository (sync. Cache + Outbox) ── StorageAdapter ── IndexedDbAdapter | LocalStorageAdapter | MemoryAdapter
          │
          └─ SyncEngine(schema) ── RemoteSyncProvider (z. B. offline-sync/supabase)
                  ▲
             SyncManager (Trigger, Backoff, Lock, Status)
```

- `Repository`: `getDoc`/`putDoc` (Dokumente), `list`/`upsert`/`remove`/`replaceCollection`/`trim` (Collections mit `SyncMeta`), `getSyncState`, `ackChanges`, `onTrackedChange`. Upsert und Remove nutzen einen ID-Index pro Collection (kein O(n)-Suchlauf).
- Speicherschlüssel: `doc:<name>`, `col:<name>`, `sync`, `deviceId`.
- `SyncEngine`: pro Runde erst Pull (Merge), dann Push (Outbox). `syncNow()` wirft nie.
- `SyncManager`: plant die Runden und hält den `SyncStatus`.

## Schema

```ts
import { keepKeys, lwwDoc, maxByKey, SyncEngine, Repository, initStorageAdapter } from 'offline-sync';
import type { SyncSchema } from 'offline-sync';

const schema: SyncSchema = {
  collections: [{ name: 'results', limit: 5000 }, { name: 'sessions', limit: 500 }],
  docs: [
    {
      name: 'settings',
      merge: (l, r, ctx) => keepKeys(lwwDoc(l, r, ctx), l, ['keypad']), // 'keypad' bleibt geräte-lokal
      toRemote: ({ keypad, ...rest }) => rest,
      updatedAt: (l) => (typeof l.updatedAt === 'number' ? l.updatedAt : null),
    },
    { name: 'chainBest', merge: (l, r) => maxByKey(l, r) },
    { name: 'activity', merge: (l, r) => maxByKey(l, r), perDevice: true },
  ],
};

const adapter = await initStorageAdapter({ prefix: 'app:v3:' }); // einmal beim Start
const repo = new Repository(adapter);
const engine = new SyncEngine(repo, { schema, deviceId: () => repo.deviceId });
```

- Nur Collections und Dokumente aus dem Schema werden synchronisiert. Änderungen anderer Ziele (z. B. `profile`) werden sofort quittiert und nie hochgeladen.
- `limit`: nach jedem Pull wird lokal auf so viele Einträge gekürzt (Tombstones zuerst, dann die ältesten; kein Sync-Delete).
- `perDevice`: Remote-Name `${name}:${deviceId}`. Das eigene Dokument wird per `merge` zurückgeführt, Dokumente anderer Geräte landen ohne Tracking in `${name}Remote` als `{ [deviceId]: data }`.
- Nach einem Merge wird nur hochgeladen, wenn `toRemote(merged)` vom Remote-Stand abweicht (stabiler JSON-Vergleich). So gibt es kein Ping-Pong.

## Merge-Bausteine

Reine, kommutative bzw. idempotente Funktionen; kaputte Eingaben zählen als `{}`.

| Funktion | Regel |
|---|---|
| `maxByKey(l, r)` | pro Schlüssel das numerische Maximum |
| `lwwByKey(l, r, field)` | pro Schlüssel gewinnt das Objekt mit größerem `field`; Gleichstand: links |
| `lwwDoc(l, r, ctx)` | ganzes Dokument; Remote gewinnt nur, wenn `remoteUpdatedAt > localUpdatedAt` |
| `keepKeys(merged, local, keys)` | listete Schlüssel kommen aus `local` (fehlen sie dort, entfallen sie) |
| `sumByKey(...maps)` | pro Schlüssel die Summe (z. B. eigene plus fremde Aktivität) |
| `stableEqual`, `compareMeta` | Tiefenvergleich ohne Schlüsselreihenfolge; Ordnung nach `(updatedAt, rev, deviceId)` |

## IndexedDB: Hydrate then Cache

`await initStorageAdapter({ prefix })` lädt beim Start alle Schlüssel in ein Speicherabbild. Danach bleibt jeder Zugriff synchron, auch im Repository. Schreiben aktualisiert das Abbild sofort und persistiert gebündelt (150 ms Debounce, eine Transaktion; sofort bei `pagehide` bzw. `visibilitychange: hidden`). Schlägt ein Schreiben fehl, bleiben die Schlüssel dirty und werden mit Backoff wiederholt. Andere Tabs melden Änderungen per `BroadcastChannel('mm-data')`; dann `adapter.onExternalChange(() => repo.invalidate())`. Ohne IndexedDB gilt `LocalStorageAdapter(prefix)` (mit Memory-Fallback bei Quota/Privatmodus). Beim ersten Start wird `prefix*` aus localStorage einmalig nach IndexedDB übernommen.

## Sync-Auslöser (SyncManager)

`new SyncManager(engine, { subscribeWrites: (cb) => repo.onTrackedChange(cb) })`, dann `enable(provider)` / `disable()`.

- Start, `online`, `visibilitychange: visible`, 5 s nach dem letzten Schreiben (Debounce), alle 5 min bei sichtbarer Seite, `syncNow()` manuell.
- Single-Flight: Anfragen während einer Runde ergeben genau eine Folgerunde.
- Backoff bei Fehlern: 5 s · 2ⁿ, höchstens 300 s (inkl. ±20 % Jitter, nie darüber).
- `auth`: Status `error`, keine automatischen Wiederholungen bis `enable` oder `manual`. `offline`: wartet auf `online`.
- Mehrere Tabs: `navigator.locks` (`mm-sync`, `ifAvailable`); ohne Locks läuft der Sync einfach.

## Konfliktregeln

- Collections: höchstes `(updatedAt, rev, deviceId)` gewinnt, auf Client und (Supabase) im Trigger. Löschen ist ein Tombstone (`deletedAt`).
- Dokumente: `DocSpec.merge`, siehe oben.
- Überlauf der Outbox (> 2000, `maxPending`) setzt `fullPushNeeded`: die nächste Runde lädt alle Schema-Daten hoch (idempotent). Bei Fehler bleibt der Vollabgleich erhalten.
- Push in Paketen (`chunkSize` 200). Bei `invalid` wird das Paket einzeln wiederholt; was weiter abgelehnt wird, zählt als `rejected` und wird quittiert.

## Eigener Provider

`RemoteSyncProvider` implementiert `upsertRecords`, `upsertDocs`, `pull(cursor, { limit, rewind })` und `deleteAll`. Er wirft **ausschließlich** `SyncError(kind)` mit `offline | auth | invalid | server`; die Engine bildet alles andere auf `server` ab. Erkannt wird per `isSyncError` (Name, nicht `instanceof`), damit Provider und Engine in getrennten Bundles liegen dürfen. `pull` liefert `cursor` (opak, nur der Provider versteht ihn) und `hasMore`. `rewind: true` (erste Seite einer Runde) setzt die Position um ca. 60 s zurück; das Anwenden ist idempotent.

## Löschen auf allen Geräten

`engine.wipeRemote()` löscht die Cloud-Daten und legt das reservierte Dokument `WIPE_DOC` (`{ at }`) ab. Findet ein anderes Gerät beim Pull eine Markierung mit `at > repo.getAppliedWipe()`, ruft die Engine `onRemoteWipe(at)` auf (Default: `repo.clear()`), merkt sich `at` und lädt komplett neu; Ausstehendes von vor dem Löschen wird nicht hochgeladen. Neue Geräte setzen vor dem ersten Sync `repo.setAppliedWipe(Date.now())`, damit ältere Markierungen sie nicht treffen. `clear()` behält `deviceId` und `wipeAt` immer.

## Supabase

Der Provider für Supabase/PostgREST samt SQL (`sql/offline_sync_guard.sql`) liegt im Subpfad `offline-sync/supabase`. Details: siehe Abschnitt „Supabase“ weiter unten bzw. `src/supabase/`.

## Entwicklung

```
npm run typecheck -w offline-sync
npm test -w offline-sync
npm run build -w offline-sync
```
