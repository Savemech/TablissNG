import type {
  FaviconRecord,
  FaviconStoreStats,
  PortableFaviconAsset,
} from "./types";

const DATABASE_NAME = "fdial/assets";
const DATABASE_VERSION = 2;
const FAVICON_STORE = "favicons";
const PORTABLE_FAVICON_STORE = "portable-favicons";
export const FAVICON_LIBRARY_CHANGED_EVENT = "fdial:favicon-library-changed";

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(FAVICON_STORE)) {
        request.result.createObjectStore(FAVICON_STORE, {
          keyPath: "bookmarkId",
        });
      }
      if (!request.result.objectStoreNames.contains(PORTABLE_FAVICON_STORE)) {
        request.result.createObjectStore(PORTABLE_FAVICON_STORE, {
          keyPath: "portableKey",
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("Could not open the asset database"));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error("Asset database upgrade was blocked"));
    };
  });

  return databasePromise;
}

export function announceFaviconLibraryChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FAVICON_LIBRARY_CHANGED_EVENT));
  }
}

export async function getFavicon(
  bookmarkId: string,
): Promise<FaviconRecord | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(FAVICON_STORE, "readonly");
  return requestResult<FaviconRecord | undefined>(
    transaction.objectStore(FAVICON_STORE).get(bookmarkId),
  );
}

export async function getFavicons(
  bookmarkIds: readonly string[],
): Promise<Map<string, FaviconRecord>> {
  const database = await openDatabase();
  const transaction = database.transaction(FAVICON_STORE, "readonly");
  const store = transaction.objectStore(FAVICON_STORE);
  const records = await Promise.all(
    bookmarkIds.map((id) =>
      requestResult<FaviconRecord | undefined>(store.get(id)),
    ),
  );
  const result = new Map<string, FaviconRecord>();
  records.forEach((record) => {
    if (record) result.set(record.bookmarkId, record);
  });
  return result;
}

export async function putFavicon(record: FaviconRecord): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(FAVICON_STORE, "readwrite");
  transaction.objectStore(FAVICON_STORE).put(record);
  await transactionDone(transaction);
}

export async function deleteFavicon(bookmarkId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(FAVICON_STORE, "readwrite");
  transaction.objectStore(FAVICON_STORE).delete(bookmarkId);
  await transactionDone(transaction);
}

export async function clearGeneratedFavicons(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(FAVICON_STORE, "readwrite");
  const store = transaction.objectStore(FAVICON_STORE);
  const cursor = store.openCursor();
  cursor.onerror = () => transaction.abort();
  cursor.onsuccess = () => {
    const result = cursor.result;
    if (!result) return;
    const record = result.value as FaviconRecord;
    if (record.source !== "manual-upload" && record.source !== "manual-url") {
      result.delete();
    }
    result.continue();
  };
  await transactionDone(transaction);
}

export async function clearManualFavicons(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(FAVICON_STORE, "readwrite");
  const store = transaction.objectStore(FAVICON_STORE);
  const cursor = store.openCursor();
  cursor.onerror = () => transaction.abort();
  cursor.onsuccess = () => {
    const result = cursor.result;
    if (!result) return;
    const record = result.value as FaviconRecord;
    if (record.source === "manual-upload" || record.source === "manual-url") {
      result.delete();
    }
    result.continue();
  };
  await transactionDone(transaction);
}

export async function getPortableFavicons(
  portableKeys: readonly string[],
): Promise<Map<string, PortableFaviconAsset>> {
  const database = await openDatabase();
  const transaction = database.transaction(PORTABLE_FAVICON_STORE, "readonly");
  const store = transaction.objectStore(PORTABLE_FAVICON_STORE);
  const records = await Promise.all(
    portableKeys.map((key) =>
      requestResult<PortableFaviconAsset | undefined>(store.get(key)),
    ),
  );
  const result = new Map<string, PortableFaviconAsset>();
  records.forEach((record) => {
    if (record) result.set(record.portableKey, record);
  });
  return result;
}

export async function listPortableFavicons(): Promise<PortableFaviconAsset[]> {
  const database = await openDatabase();
  const transaction = database.transaction(PORTABLE_FAVICON_STORE, "readonly");
  return requestResult<PortableFaviconAsset[]>(
    transaction.objectStore(PORTABLE_FAVICON_STORE).getAll(),
  );
}

export async function putPortableFavicon(
  asset: PortableFaviconAsset,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PORTABLE_FAVICON_STORE, "readwrite");
  transaction.objectStore(PORTABLE_FAVICON_STORE).put(asset);
  await transactionDone(transaction);
}

export async function deletePortableFavicon(
  portableKey: string,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PORTABLE_FAVICON_STORE, "readwrite");
  transaction.objectStore(PORTABLE_FAVICON_STORE).delete(portableKey);
  await transactionDone(transaction);
}

export async function clearPortableFavicons(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PORTABLE_FAVICON_STORE, "readwrite");
  transaction.objectStore(PORTABLE_FAVICON_STORE).clear();
  await transactionDone(transaction);
}

/** Rebind imported originals to the bookmark ids in this browser profile. */
export async function restorePortableFavicons(
  targets: readonly {
    bookmarkId: string;
    pageUrl: string;
    portableKey: string;
  }[],
): Promise<void> {
  if (targets.length === 0) return;
  const [portable, local] = await Promise.all([
    getPortableFavicons(targets.map(({ portableKey }) => portableKey)),
    getFavicons(targets.map(({ bookmarkId }) => bookmarkId)),
  ]);
  await Promise.all(
    targets.map(async ({ bookmarkId, pageUrl, portableKey }) => {
      const asset = portable.get(portableKey);
      const current = local.get(bookmarkId);
      if (!asset || (current && current.fetchedAt > asset.updatedAt)) return;
      await putFavicon({
        bookmarkId,
        pageUrl,
        source: asset.source,
        sourceUrl: asset.sourceUrl,
        status: "ready",
        blob: asset.blob,
        fetchedAt: asset.updatedAt,
      });
    }),
  );
}

export async function getFaviconStoreStats(): Promise<FaviconStoreStats> {
  const database = await openDatabase();
  const transaction = database.transaction(FAVICON_STORE, "readonly");
  const records = await requestResult<FaviconRecord[]>(
    transaction.objectStore(FAVICON_STORE).getAll(),
  );
  return {
    entries: records.length,
    ready: records.filter(({ status }) => status === "ready").length,
    bytes: records.reduce(
      (bytes, record) => bytes + (record.blob?.size ?? 0),
      0,
    ),
  };
}
