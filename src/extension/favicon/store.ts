import type { FaviconRecord, FaviconStoreStats } from "./types";

const DATABASE_NAME = "fdial/assets";
const DATABASE_VERSION = 1;
const FAVICON_STORE = "favicons";

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
