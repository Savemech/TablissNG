import {
  fontMimeType,
  fontNameFromFileName,
  localFontFamily,
  MAX_LOCAL_FONTS,
  validateLocalFont,
} from "./model";
import type { LocalFontRecord } from "./types";

const DATABASE_NAME = "fdial/fonts";
const DATABASE_VERSION = 1;
const STORE_NAME = "fonts";
export const FONT_LIBRARY_CHANGED_EVENT = "fdial:font-library-changed";

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Font DB failed"));
    request.onblocked = () => reject(new Error("Font DB upgrade was blocked"));
  });
  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Font DB failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Font DB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Font DB transaction aborted"));
  });
}

function announceChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(FONT_LIBRARY_CHANGED_EVENT));
  }
}

function fontId(): string {
  return [...crypto.getRandomValues(new Uint32Array(3))]
    .map((value) => value.toString(36))
    .join("");
}

export async function listLocalFonts(): Promise<LocalFontRecord[]> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const records = await requestResult<LocalFontRecord[]>(
    transaction.objectStore(STORE_NAME).getAll(),
  );
  return records.toSorted(
    (left, right) =>
      left.name.localeCompare(right.name) || left.createdAt - right.createdAt,
  );
}

export async function addLocalFont(file: File): Promise<LocalFontRecord> {
  const validation = validateLocalFont(file);
  if (validation === "invalid-type") {
    throw new Error("Choose a WOFF2, WOFF, TTF or OTF font file");
  }
  if (validation === "too-large") {
    throw new Error("Font files must be 6 MiB or smaller");
  }
  const existing = await listLocalFonts();
  if (existing.length >= MAX_LOCAL_FONTS) {
    throw new Error(`Up to ${MAX_LOCAL_FONTS} local fonts can be stored`);
  }
  const id = fontId();
  const mimeType = fontMimeType(file.name, file.type);
  const record: LocalFontRecord = {
    id,
    family: localFontFamily(id),
    name: fontNameFromFileName(file.name),
    fileName: file.name.slice(0, 160),
    mimeType,
    blob: file.slice(0, file.size, mimeType),
    createdAt: Date.now(),
  };
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(record);
  await transactionDone(transaction);
  announceChange();
  return record;
}

export async function removeLocalFont(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionDone(transaction);
  announceChange();
}
