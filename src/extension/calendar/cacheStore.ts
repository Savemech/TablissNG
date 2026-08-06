import type { CalendarFeedCache } from "./types";

const DATABASE_NAME = "fdial/calendar";
const DATABASE_VERSION = 1;
const CACHE_STORE = "feedCaches";

let databasePromise: Promise<IDBDatabase> | undefined;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Calendar database request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Calendar transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Calendar transaction aborted"));
  });
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
        request.result.createObjectStore(CACHE_STORE, { keyPath: "feedId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("Could not open calendar database"));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error("Calendar database upgrade was blocked"));
    };
  });
  return databasePromise;
}

export async function getCalendarFeedCache(
  feedId: string,
): Promise<CalendarFeedCache | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readonly");
  return requestResult<CalendarFeedCache | undefined>(
    transaction.objectStore(CACHE_STORE).get(feedId),
  );
}

export async function getCalendarFeedCaches(): Promise<CalendarFeedCache[]> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readonly");
  return requestResult<CalendarFeedCache[]>(
    transaction.objectStore(CACHE_STORE).getAll(),
  );
}

export async function putCalendarFeedCache(
  cache: CalendarFeedCache,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  transaction.objectStore(CACHE_STORE).put(cache);
  await transactionDone(transaction);
}

export async function deleteCalendarFeedCache(feedId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(CACHE_STORE, "readwrite");
  transaction.objectStore(CACHE_STORE).delete(feedId);
  await transactionDone(transaction);
}
