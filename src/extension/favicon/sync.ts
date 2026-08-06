import { base64ToBlob, blobToBase64 } from "../../lib/blob";
import { deleteFavicon, getFavicons, putFavicon } from "./store";
import type { FaviconRecord } from "./types";

const SYNC_PREFIX = "fdial/sync/favicon/";
const SYNC_VERSION = 1 as const;

// Both Chromium and Firefox currently expose 100 KiB total and 8 KiB/item.
// Reserve over half for normal settings and future schema migrations.
export const FAVICON_SYNC_BUDGET_BYTES = 48 * 1024;
export const FAVICON_SYNC_MAX_BINARY_BYTES = 5 * 1024;
const SYNC_TOTAL_SAFETY_LIMIT_BYTES = 94 * 1024;
const SYNC_ITEM_SAFETY_LIMIT_BYTES = 8_000;

export type SyncedFavicon =
  | {
      version: typeof SYNC_VERSION;
      updatedAt: number;
      deleted: true;
    }
  | {
      version: typeof SYNC_VERSION;
      updatedAt: number;
      deleted?: false;
      mimeType: string;
      data: string;
    };

export type SyncedFaviconTarget = {
  bookmarkId: string;
  pageUrl: string;
  portableKey: string;
};

export class FaviconSyncError extends Error {
  constructor(readonly code: "too-large" | "quota") {
    super(code);
    this.name = "FaviconSyncError";
  }
}

export function syncedFaviconStorageKey(portableKey: string): string {
  return `${SYNC_PREFIX}${portableKey}`;
}

function isSyncedFavicon(value: unknown): value is SyncedFavicon {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== SYNC_VERSION ||
    typeof candidate.updatedAt !== "number"
  ) {
    return false;
  }
  return candidate.deleted === true
    ? true
    : typeof candidate.mimeType === "string" &&
        typeof candidate.data === "string";
}

export function syncedItemBytes(key: string, value: SyncedFavicon): number {
  return (
    new TextEncoder().encode(key).byteLength +
    new TextEncoder().encode(JSON.stringify(value)).byteLength
  );
}

function syncedEntries(
  stored: Record<string, unknown>,
): Map<string, SyncedFavicon> {
  const entries = new Map<string, SyncedFavicon>();
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith(SYNC_PREFIX) && isSyncedFavicon(value)) {
      entries.set(key, value);
    }
  }
  return entries;
}

async function writeSyncedItem(
  portableKey: string,
  value: SyncedFavicon,
): Promise<void> {
  const key = syncedFaviconStorageKey(portableKey);
  const itemBytes = syncedItemBytes(key, value);
  if (itemBytes > SYNC_ITEM_SAFETY_LIMIT_BYTES) {
    throw new FaviconSyncError("too-large");
  }

  const stored = (await browser.storage.sync.get()) as Record<string, unknown>;
  const entries = syncedEntries(stored);
  const previous = entries.get(key);
  const assetBytes = [...entries].reduce(
    (total, [entryKey, entry]) => total + syncedItemBytes(entryKey, entry),
    0,
  );
  const nextAssetBytes =
    assetBytes - (previous ? syncedItemBytes(key, previous) : 0) + itemBytes;
  const totalBytes = await browser.storage.sync.getBytesInUse();
  const nextTotalBytes =
    totalBytes - (previous ? syncedItemBytes(key, previous) : 0) + itemBytes;
  if (
    nextAssetBytes > FAVICON_SYNC_BUDGET_BYTES ||
    nextTotalBytes > SYNC_TOTAL_SAFETY_LIMIT_BYTES
  ) {
    throw new FaviconSyncError("quota");
  }

  await browser.storage.sync.set({ [key]: value });
}

export async function saveSyncedFavicon(
  portableKey: string,
  blob: Blob,
  updatedAt = Date.now(),
): Promise<void> {
  if (!blob.size || blob.size > FAVICON_SYNC_MAX_BINARY_BYTES) {
    throw new FaviconSyncError("too-large");
  }
  await writeSyncedItem(portableKey, {
    version: SYNC_VERSION,
    updatedAt,
    mimeType: blob.type || "application/octet-stream",
    data: await blobToBase64(blob),
  });
}

export async function deleteSyncedFavicon(
  portableKey: string,
  updatedAt = Date.now(),
): Promise<void> {
  await writeSyncedItem(portableKey, {
    version: SYNC_VERSION,
    updatedAt,
    deleted: true,
  });
}

export async function getSyncedFavicons(): Promise<
  ReadonlyMap<string, SyncedFavicon>
> {
  return syncedEntries(
    (await browser.storage.sync.get()) as Record<string, unknown>,
  );
}

function isManual(record?: FaviconRecord): boolean {
  return record?.source === "manual-upload" || record?.source === "manual-url";
}

/** Apply remote LWW state to the local IndexedDB cache in one reconciliation. */
export async function restoreSyncedFavicons(
  targets: readonly SyncedFaviconTarget[],
): Promise<void> {
  if (targets.length === 0) return;
  const synced = await getSyncedFavicons();
  const local = await getFavicons(targets.map(({ bookmarkId }) => bookmarkId));

  await Promise.all(
    targets.map(async ({ bookmarkId, pageUrl, portableKey }) => {
      const remote = synced.get(syncedFaviconStorageKey(portableKey));
      if (!remote) return;
      const current = local.get(bookmarkId);
      if (remote.deleted) {
        if (isManual(current) && current!.fetchedAt <= remote.updatedAt) {
          await deleteFavicon(bookmarkId);
        }
        return;
      }
      if (isManual(current) && current!.fetchedAt >= remote.updatedAt) return;

      await putFavicon({
        bookmarkId,
        pageUrl,
        source: "manual-upload",
        sourceUrl: "Synced icon",
        status: "ready",
        blob: base64ToBlob(remote.data, remote.mimeType),
        fetchedAt: remote.updatedAt,
      });
    }),
  );
}

export function isSyncedFaviconStorageChange(
  changes: Readonly<Record<string, unknown>>,
): boolean {
  return Object.keys(changes).some((key) => key.startsWith(SYNC_PREFIX));
}
