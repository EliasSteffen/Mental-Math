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

- `Repository`: `getDoc`/`putDoc` (Dokumente), `list`/`getById`/`upsert`/`remove`/`replaceCollection`/`trim` (Collections mit `SyncMeta`), `getSyncState`, `ackChanges`, `onTrackedChange`. `getById`, Upsert und Remove nutzen einen ID-Index pro Collection (kein O(n)-Suchlauf); `getById` liefert auch Tombstones.
- Speicherschlüssel: `doc:<name>`, `rec:<collection>:<id>` (ein Schlüssel je Datensatz, Wert `[ord, record]`; `ord` hält die Reihenfolge von `list()`, der Collection-Name ist per `encodeURIComponent` kodiert), `out:<seq>` (ein Schlüssel je Outbox-Eintrag, Wert `ChangeRecord`), `sync` (nur skalare Felder: Cursor, Vollabgleich-Flag samt `fullPushGen`, Dokument-Uhr `docClock`, `nextSeq`, `lastPushedSeq`, `lastPulledAt`; dazu `pending: []`, damit eine ältere Version den Wert weiter liest), `deviceId`, `wipeAt`. Ein Upsert serialisiert und schreibt nur seinen Datensatz, getrackt zusätzlich seinen Outbox-Eintrag (und entfernt den bisherigen derselben target+id). `sync` folgt nur, wenn Einträge ohne Nachfolger wegfallen (Quittung, Überlauf); `nextSeq` leitet das Laden aus dem höchsten `out:`-Schlüssel ab. `getSyncState()` liefert unverändert einen `SyncState` mit `pending[]`. `trim` entfernt nur die Opfer-Schlüssel.
- Altformat `col:<name>` (ganze Collection als ein Wert): Das Repository migriert es beim ersten Laden der Collection, idempotent und abbruchsicher. Es schreibt rückwärts in Blöcken zu 500 und kürzt `col:` nach jedem dauerhaft geschriebenen Block, am Ende ist der Schlüssel weg. Nach jedem Adapter-Aufruf liegt jeder Eintrag in `col:` oder mindestens so neu unter `rec:`. Ein Abbruch an beliebiger Stelle wird beim nächsten Laden zu Ende geführt, doppelte Stände entscheidet `compareMeta`; das gilt auch, wenn ein Tab mit alter Version `col:` erneut schreibt. `StorageAdapter.set` liefert `false`, wenn ein Wert nur flüchtig liegt (localStorage voll → Memory-Fallback); dann kürzt die Migration die Quelle nicht.
- Altformat `sync.pending` (ganze Outbox in `sync`): gleiches Muster beim ersten `getSyncState()`. Rückwärts in Blöcken zu 500 nach `out:<seq>`, nach jedem dauerhaft geschriebenen Block wird `pending` gekürzt, am Ende bleibt `pending: []`. Nach jedem Adapter-Aufruf liegt jeder Eintrag in `sync.pending` oder mit derselben target+id unter `out:`. Schreibt ein Tab mit alter Version `sync.pending` erneut, wird zusammengeführt; eine vergebene Folgenummer wird neu vergeben. Ein unlesbarer `out:`-Eintrag wird entfernt und fordert einen Vollabgleich an.
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
- `limit`: nach jedem Pull wird lokal auf so viele Einträge gekürzt (physisch, kein Sync-Delete). Weg fallen genau `length − limit` Einträge in dieser Reihenfolge: Tombstones, dann bereits hochgeladene, dann noch ausstehende – jeweils die ältesten (`createdAt`) zuerst. Ausstehend heißt: in der Outbox oder, solange ein Vollabgleich aussteht, vom eigenen Gerät. So verdrängen ältere fremde Datensätze, die der Pull hinten anhängt, keine noch nicht hochgeladenen eigenen. Die Reihenfolge der übrigen bleibt.
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

`await initStorageAdapter({ prefix })` lädt beim Start alle Schlüssel in ein Speicherabbild. Danach bleibt jeder Zugriff synchron, auch im Repository. Schreiben aktualisiert das Abbild sofort und persistiert gebündelt (150 ms Debounce, eine Transaktion; sofort bei `pagehide` bzw. `visibilitychange: hidden`). Schlägt ein Schreiben fehl, bleiben die Schlüssel dirty und werden mit Backoff wiederholt. Andere Tabs melden Änderungen per `BroadcastChannel('mm-data')`; dann `adapter.onExternalChange(() => repo.invalidate())`. Weil jeder Datensatz ein eigener Schlüssel ist, überschreiben sich zwei Tabs, die gleichzeitig verschiedene Datensätze anlegen, nicht mehr gegenseitig. Ohne IndexedDB gilt `LocalStorageAdapter(prefix)` (mit Memory-Fallback bei Quota/Privatmodus). Beim ersten Start wird `prefix*` aus localStorage einmalig nach IndexedDB übernommen.

## Sync-Auslöser (SyncManager)

`new SyncManager(engine, { subscribeWrites: (cb) => repo.onTrackedChange(cb) })`, dann `enable(provider)` / `disable()`.

- Start, `online`, `visibilitychange: visible`, 5 s nach dem letzten Schreiben (Debounce), alle 5 min bei sichtbarer Seite, `syncNow()` manuell.
- Single-Flight: Anfragen während einer Runde ergeben genau eine Folgerunde.
- Backoff bei Fehlern: 5 s · 2ⁿ, höchstens 300 s (inkl. ±20 % Jitter, nie darüber).
- `auth`: Status `error`, keine automatischen Wiederholungen bis `enable` oder `manual`. `offline`: wartet auf `online`.
- Mehrere Tabs: `navigator.locks` (`mm-sync`, `ifAvailable`); ohne Locks läuft der Sync einfach.

## Konfliktregeln

- Collections: höchstes `(updatedAt, rev, deviceId)` gewinnt, auf Client und (Supabase) im Trigger. Löschen ist ein Tombstone (`deletedAt`).
- Dokumente: `DocSpec.merge`, siehe oben. Der Server-Trigger verwirft Dokumente, deren `(updatedAt, deviceId)` nicht größer ist. Damit ein Gerät mit nachgehender Uhr ein gemergtes Dokument nicht still verliert, gilt für Specs **ohne** eigene `updatedAt`-Funktion eine hybride Uhr: Die Engine merkt sich pro Dokument den höchsten gesehenen Remote-`updatedAt` (`docClock` im SyncState, auch wenn `merge` nichts ändert; bei `perDevice` nur das eigene Dokument) und sendet `max(jetzt, docClock + 1)`. Specs mit eigener `updatedAt`-Funktion (z. B. Einstellungen, LWW über ein Feld) senden weiterhin deren Wert. `clear()` setzt die Uhr mit zurück.
- Überlauf der Outbox (> 2000, `maxPending`) setzt `fullPushNeeded`: die nächste Runde lädt alle Schema-Daten hoch (idempotent). Das Flag wird erst gelöscht, wenn alle Pakete gesendet sind, und nur, wenn währenddessen kein neuer Vollabgleich angefordert wurde (`markFullPush()` oder Überlauf erhöhen `fullPushGen`; der Push löscht per `clearFullPushIf(gen)`). Fehler oder ein beendeter Tab mitten im Push lassen den Vollabgleich also stehen.

## Push

- Basis ist eine Momentaufnahme der Outbox (bzw. bei `fullPushNeeded` alles lokal Vorhandene). Jeder Outbox-Eintrag wird per `getById` aufgelöst; verwaiste Einträge (Ziel nicht im Schema oder nicht mehr vorhanden) werden quittiert.
- Push in Paketen (`chunkSize` 200), je Collection bzw. für Dokumente getrennt. Normale Pakete werden nach Erfolg sofort quittiert, beim Vollabgleich die Momentaufnahme am Ende.
- Bei `invalid` wird das Paket einzeln wiederholt; was weiter abgelehnt wird, zählt als `rejected` und wird quittiert. Ein Datensatz, den der Mapper nicht umsetzen kann (Fehler in `toRow`/`docToRow`), gilt ebenfalls als `invalid` – er blockiert den Push nicht (sonst endloser Backoff wegen `server`).

## Eigener Provider

`RemoteSyncProvider` implementiert `upsertRecords`, `upsertDocs`, `pull(cursor, { limit, rewind })` und `deleteAll` (`Promise<number | void>`, siehe unten). Er wirft **ausschließlich** `SyncError(kind)` mit `offline | auth | invalid | server`; die Engine bildet alles andere auf `server` ab. Erkannt wird per `isSyncError` (Name, nicht `instanceof`), damit Provider und Engine in getrennten Bundles liegen dürfen. `pull` liefert `cursor` (opak, nur der Provider versteht ihn) und `hasMore`. `rewind: true` (erste Seite einer Runde) setzt die Position um ca. 60 s zurück; das Anwenden ist idempotent.

## Löschen auf allen Geräten

`engine.wipeRemote()` löscht die Cloud-Daten und legt das reservierte Dokument `WIPE_DOC` (`{ at }`) ab. Bevorzugt geschieht beides atomar auf dem Server: Liefert `provider.deleteAll()` eine Zahl, hat der Server die Markierung im selben Aufruf geschrieben, und diese Zahl ist `at` (Serveruhr); die Engine sendet dann nichts weiter. Sonst (Provider ohne Rückgabe) folgt die Markierung per `upsertDocs` als zweiter Aufruf – scheitert der, bleibt ein Zustand „gelöscht ohne Markierung“, in dem andere Geräte ihre Daten wieder hochladen. Der Supabase-Provider gibt den Rückgabewert der `deleteAllRpc` als Zahl zurück (bigint als Zahl oder String). Findet ein anderes Gerät beim Pull eine Markierung mit `at > repo.getAppliedWipe()`, ruft die Engine `onRemoteWipe(at)` auf (Default: `repo.clear()`), merkt sich `at` und lädt komplett neu; Ausstehendes von vor dem Löschen wird nicht hochgeladen. Neue Geräte setzen vor dem ersten Sync `repo.setAppliedWipe(Date.now())`, damit ältere Markierungen sie nicht treffen. `clear()` behält `deviceId` und `wipeAt` immer.

## Supabase

Der Provider für Supabase/PostgREST samt SQL (`sql/offline_sync_guard.sql`) liegt im Subpfad `offline-sync/supabase`. Details: `src/supabase/`. Die `deleteAllRpc` (`SupabaseSyncSchema`) löscht alle Zeilen des Nutzers und fügt im selben Aufruf die Markierung in `docsTable` ein (`name 'wipe'`, `data { at }`, `updated_at at`); sie gibt `at` (Epoch-ms, bigint) zurück. Beispiel: `mm_delete_my_data` in `sql/002_training_data.sql` der App.

## Entwicklung

```
npm run typecheck -w offline-sync
npm test -w offline-sync
npm run build -w offline-sync
```
