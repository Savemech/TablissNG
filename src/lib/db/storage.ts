import type Browser from "webextension-polyfill";

import * as DB from "./db";
import * as Stream from "./stream";

/** IndexedDB storage provider */
// TODO: clean up indexeddb usage, convert to promises and double check error handling

const SAVE_BATCH_TIMEOUT = 1000; // 1s

export const indexeddb = (
  db: DB.Database,
  name: string,
): Promise<Stream.Stream<StorageError>> => {
  // Map idb errors to a standard format
  const mapError = (message: string, err: unknown): StorageError => {
    const cause =
      err instanceof Event &&
      err.target instanceof IDBRequest &&
      err.target.error instanceof Error
        ? err.target.error
        : undefined;
    return new StorageError(`IndexedDB: ${name}: ${message}`, { cause });
  };

  return new Promise((resolve, reject) => {
    const rejectError = (message: string) => (err: unknown) => {
      reject(mapError(message, err));
    };

    const open = indexedDB.open(name, 1);
    open.onerror = rejectError("Cannot open database");
    open.onupgradeneeded = () => {
      open.result.createObjectStore("changes");
    };
    open.onsuccess = () => {
      const conn = open.result;

      const trx = conn.transaction("changes", "readonly");
      trx.onerror = rejectError("Cannot read changes from store");

      const changes: DB.Change[] = [];
      const cursor = trx.objectStore("changes").openCursor();
      cursor.onsuccess = () => {
        if (cursor.result) {
          if (typeof cursor.result.key === "string")
            changes.push([cursor.result.key, cursor.result.value]);
          cursor.result.continue();
        } else {
          // Finished loading
          DB.atomic(db, (trx) => {
            changes.forEach(([key, val]) => DB.put(trx, key, val));
          });

          // Write
          const errors = Stream.init<StorageError>();
          DB.listen(
            db,
            batch((changes) => {
              if (DEV) console.log("Storage: saving changes:", changes);

              const trx = conn.transaction("changes", "readwrite");
              trx.oncomplete = () => {}; // nice
              trx.onerror = (error) =>
                Stream.publish(
                  errors,
                  mapError("Cannot write changes to store", error),
                );

              const store = trx.objectStore("changes");
              // TODO: iterator helpers
              for (const [key, val] of changes) {
                if (val === undefined) store.delete(key);
                else store.put(val, key);
              }
            }, SAVE_BATCH_TIMEOUT),
          );
          resolve(errors);
        }
      };
    };
  });
};

/** Web Extension storage provider */
export const extension = async (
  db: DB.Database,
  name: string,
  area: "local" | "sync" | "managed",
): Promise<Stream.Stream<StorageError>> => {
  // Map errors to a standard format
  const mapError = (message: string, err: unknown) =>
    new StorageError(`Extension[${area}]: ${name}: ${message}`, {
      cause: err instanceof Error ? err : undefined,
    });

  const storageArea = browser.storage[area];
  const storagePrefix = `${name}/`;

  // Pull
  await storageArea
    .get()
    .then((stored) =>
      Object.keys(stored)
        .filter((key) => key.startsWith(storagePrefix))
        .forEach((key) =>
          DB.put(db, key.substring(storagePrefix.length), stored[key]),
        ),
    )
    .catch((error) => {
      throw mapError("Cannot read from storage", error);
    });

  // Push
  const errors = Stream.init<StorageError>();
  const handleError = (message: string) => (err: unknown) => {
    Stream.publish(errors, mapError(message, err));
  };
  const pendingWrites = batch((changes) => {
    if (DEV) console.log("Storage: saving changes:", changes);

    // TODO: test for both updates and deletes for the same key
    // TODO: iterator helpers
    const changesArray = Array.from(changes);
    const updates = Object.fromEntries(
      changesArray
        .filter(([, val]) => val !== undefined)
        .map(([key, val]) => [`${name}/${key}`, val]),
    );
    const deletes = changesArray
      .filter(([, val]) => val === undefined)
      .map(([key]) => `${name}/${key}`);

    storageArea
      .set(updates)
      .catch(handleError("Cannot write updates to storage"));
    storageArea
      .remove(deletes)
      .catch(handleError("Cannot write deletes to storage"));
  }, SAVE_BATCH_TIMEOUT);
  let applyingRemote = false;
  DB.listen(db, (change) => {
    if (!applyingRemote) pendingWrites(change);
  });

  const sameValue = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch {
      return false;
    }
  };
  const handleStorageChange = (
    changes: Record<string, Browser.Storage.StorageChange>,
    changedArea: string,
  ) => {
    if (changedArea !== area) return;

    for (const [storageKey, change] of Object.entries(changes)) {
      if (!storageKey.startsWith(storagePrefix)) continue;
      const key = storageKey.substring(storagePrefix.length);
      if (sameValue(DB.get(db, key), change.newValue)) continue;

      // The browser has already resolved its sync conflict. A later remote
      // event wins over an older local write still waiting in our 1s batch.
      pendingWrites.discard(key);
      applyingRemote = true;
      try {
        if (change.newValue === undefined) DB.del(db, key);
        else DB.put(db, key, change.newValue);
      } finally {
        applyingRemote = false;
      }
    }
  };
  browser.storage.onChanged.addListener(handleStorageChange);

  return errors;
};

export type BatchListener = DB.Listener & {
  discard: (key: string) => void;
  dispose: () => void;
  flush: () => void;
};

export const batch = (
  flush: (batch: Iterable<DB.Change>) => void,
  timeout = 0,
): BatchListener => {
  const changes = new Map<string, DB.Val>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    if (changes.size === 0) {
      timer = null;
      return;
    }
    flush(changes);
    changes.clear();
    timer = null;
  };

  const flushNow = () => {
    if (timer) clearTimeout(timer);
    run();
  };

  // If there are pending changes on browser close, flush immediately
  const handleBeforeUnload = () => flushNow();
  const windowTarget = typeof window === "undefined" ? undefined : window;
  windowTarget?.addEventListener("beforeunload", handleBeforeUnload);

  const listener = (([key, val]: DB.Change) => {
    changes.set(key, val);
    if (!timer) timer = setTimeout(run, timeout);
  }) as BatchListener;
  listener.discard = (key) => changes.delete(key);
  listener.flush = flushNow;
  listener.dispose = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    changes.clear();
    windowTarget?.removeEventListener("beforeunload", handleBeforeUnload);
  };
  return listener;
};

/** Storage Error */
class StorageError extends Error {
  override name = "StorageError";
}
