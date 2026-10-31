// Generisches Test-Schema, das die App nachbildet: Collections a (limit 50) und b; Dokumente prefs, best, log, time (perDevice)
import { keepKeys, lwwByKey, lwwDoc, maxByKey } from '../src/merge.ts';
import type { SyncSchema } from '../src/types.ts';

export const LOCAL_KEYS = ['keypad', 'ver'] as const;

export const testSchema: SyncSchema = {
  collections: [{ name: 'a', limit: 50 }, { name: 'b' }],
  docs: [
    {
      name: 'prefs',
      merge: (l, r, ctx) => keepKeys(lwwDoc(l, r, ctx), l, LOCAL_KEYS),
      toRemote: (l) => {
        const o = { ...l };
        for (const k of LOCAL_KEYS) delete o[k];
        return o;
      },
      updatedAt: (l) => (typeof l.updatedAt === 'number' ? l.updatedAt : null),
    },
    { name: 'best', merge: (l, r) => maxByKey(l, r) },
    { name: 'log', merge: (l, r) => lwwByKey(l, r, 'ts') },
    { name: 'time', merge: (l, r) => maxByKey(l, r), perDevice: true },
  ],
};
