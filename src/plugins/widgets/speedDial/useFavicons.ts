import { useCallback, useEffect, useRef, useState } from "react";
import type Browser from "webextension-polyfill";

import {
  deleteFavicon,
  getFavicon,
  getFavicons,
  putFavicon,
} from "../../../extension/favicon/store";
import { normaliseFaviconForSync } from "../../../extension/favicon/normalise";
import {
  deleteSyncedFavicon,
  getSyncedFavicons,
  isSyncedFaviconStorageChange,
  restoreSyncedFavicons,
  saveSyncedFavicon,
  syncedFaviconStorageKey,
  type SyncedFaviconTarget,
} from "../../../extension/favicon/sync";
import type { FaviconRecord } from "../../../extension/favicon/types";
import {
  type BackgroundResponse,
  FETCH_FAVICON,
  FETCH_FAVICON_BATCH,
} from "../../../extension/messages";
import type { FaviconTarget } from "./faviconPolicy";
import type { FaviconSettings } from "./types";

type FaviconState = {
  fetching: boolean;
  error?: Error;
  iconUrls: ReadonlyMap<string, string>;
  records: ReadonlyMap<string, FaviconRecord>;
  refreshAll: (force?: boolean) => Promise<BackgroundResponse>;
  refreshOne: (target: FaviconTarget) => Promise<BackgroundResponse>;
  setFromUrl: (
    target: FaviconTarget,
    iconUrl: string,
  ) => Promise<BackgroundResponse>;
  setFromUpload: (target: FaviconTarget, file: File) => Promise<void>;
  removeIcon: (bookmarkId: string) => Promise<void>;
  reload: () => Promise<void>;
};

const BATCH_SIZE = 500;
export const MAX_MANUAL_ICON_BYTES = 512 * 1024;
const EMPTY_PORTABLE_KEYS = new Map<string, string>();

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error("Could not update icons");
}

function canonicalUrl(value: string): string {
  try {
    return new URL(value).href;
  } catch {
    return value;
  }
}

async function ensureRenderableImage(blob: Blob): Promise<void> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("The selected file cannot be decoded"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function useFavicons(
  targets: readonly FaviconTarget[],
  settings: FaviconSettings,
  automaticTargets: readonly FaviconTarget[] = targets,
  portableKeys: ReadonlyMap<string, string> = EMPTY_PORTABLE_KEYS,
): FaviconState {
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<Error>();
  const [records, setRecords] = useState<ReadonlyMap<string, FaviconRecord>>(
    new Map(),
  );
  const [iconUrls, setIconUrls] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );
  const objectUrlsRef = useRef<string[]>([]);
  const automaticRequestRef = useRef<string | undefined>(undefined);
  const targetsRef = useRef(targets);
  const automaticTargetsRef = useRef(automaticTargets);
  targetsRef.current = targets;
  automaticTargetsRef.current = automaticTargets;
  const targetsKey = targets
    .map(({ bookmarkId, pageUrl }) => `${bookmarkId}\u0000${pageUrl}`)
    .join("\u0001");
  const automaticTargetsKey = automaticTargets
    .map(({ bookmarkId, pageUrl }) => `${bookmarkId}\u0000${pageUrl}`)
    .join("\u0001");
  const syncedTargets = targets
    .map((target): SyncedFaviconTarget | undefined => {
      const portableKey = portableKeys.get(target.bookmarkId);
      return portableKey ? { ...target, portableKey } : undefined;
    })
    .filter((target): target is SyncedFaviconTarget => Boolean(target));
  const syncedTargetsKey = syncedTargets
    .map(
      ({ bookmarkId, pageUrl, portableKey }) =>
        `${bookmarkId}\u0000${pageUrl}\u0000${portableKey}`,
    )
    .join("\u0001");

  const replaceRecords = useCallback(
    (nextRecords: ReadonlyMap<string, FaviconRecord>) => {
      objectUrlsRef.current.forEach(URL.revokeObjectURL);
      objectUrlsRef.current = [];
      const nextUrls = new Map<string, string>();
      const targetById = new Map(
        targetsRef.current.map((target) => [target.bookmarkId, target]),
      );
      for (const [bookmarkId, record] of nextRecords) {
        const target = targetById.get(bookmarkId);
        const manual =
          record.source === "manual-upload" || record.source === "manual-url";
        if (
          record.status !== "ready" ||
          !record.blob ||
          !target ||
          (!manual &&
            canonicalUrl(record.pageUrl) !== canonicalUrl(target.pageUrl))
        ) {
          continue;
        }
        const objectUrl = URL.createObjectURL(record.blob);
        objectUrlsRef.current.push(objectUrl);
        nextUrls.set(bookmarkId, objectUrl);
      }
      setRecords(nextRecords);
      setIconUrls(nextUrls);
    },
    [],
  );

  const reload = useCallback(async (): Promise<void> => {
    replaceRecords(
      await getFavicons(targetsRef.current.map(({ bookmarkId }) => bookmarkId)),
    );
  }, [replaceRecords]);

  const refreshAll = useCallback(
    async (force = true): Promise<BackgroundResponse> => {
      setFetching(true);
      setError(undefined);
      try {
        let completed = 0;
        let failed = 0;
        for (
          let index = 0;
          index < automaticTargetsRef.current.length;
          index += BATCH_SIZE
        ) {
          const response = (await browser.runtime.sendMessage({
            type: FETCH_FAVICON_BATCH,
            items: automaticTargetsRef.current.slice(index, index + BATCH_SIZE),
            source: settings.source,
            ttlDays: settings.ttlDays,
            concurrency: settings.concurrency,
            force,
          })) as BackgroundResponse;
          if (!response?.ok) {
            throw new Error(
              response?.error ?? "The icon worker did not respond",
            );
          }
          if (response.status === "complete") {
            completed += response.completed;
            failed += response.failed;
          }
        }
        await reload();
        return { ok: true, status: "complete", completed, failed };
      } catch (cause) {
        const nextError = asError(cause);
        setError(nextError);
        return { ok: false, error: nextError.message };
      } finally {
        setFetching(false);
      }
    },
    [reload, settings.concurrency, settings.source, settings.ttlDays],
  );

  const refreshOne = useCallback(
    async (target: FaviconTarget): Promise<BackgroundResponse> => {
      setError(undefined);
      try {
        const response = (await browser.runtime.sendMessage({
          type: FETCH_FAVICON,
          bookmarkId: target.bookmarkId,
          pageUrl: target.pageUrl,
          source: settings.source,
          ttlDays: settings.ttlDays,
          force: true,
        })) as BackgroundResponse;
        await reload();
        return response;
      } catch (cause) {
        const nextError = asError(cause);
        setError(nextError);
        return { ok: false, error: nextError.message };
      }
    },
    [reload, settings.source, settings.ttlDays],
  );

  const setFromUrl = useCallback(
    async (
      target: FaviconTarget,
      iconUrl: string,
    ): Promise<BackgroundResponse> => {
      setError(undefined);
      try {
        const response = (await browser.runtime.sendMessage({
          type: FETCH_FAVICON,
          bookmarkId: target.bookmarkId,
          pageUrl: target.pageUrl,
          source: "manual-url",
          manualUrl: iconUrl,
          ttlDays: settings.ttlDays,
          force: true,
        })) as BackgroundResponse;
        if (!response?.ok) {
          throw new Error(response?.error ?? "Could not fetch the custom icon");
        }
        await reload();
        const portableKey = portableKeys.get(target.bookmarkId);
        const record = await getFavicon(target.bookmarkId);
        if (portableKey && record?.blob) {
          try {
            await saveSyncedFavicon(
              portableKey,
              await normaliseFaviconForSync(record.blob),
              record.fetchedAt,
            );
          } catch (cause) {
            setError(asError(cause));
          }
        }
        return response;
      } catch (cause) {
        const nextError = asError(cause);
        setError(nextError);
        return { ok: false, error: nextError.message };
      }
    },
    [portableKeys, reload, settings.ttlDays],
  );

  const setFromUpload = useCallback(
    async (target: FaviconTarget, file: File): Promise<void> => {
      if (!file.size || file.size > MAX_MANUAL_ICON_BYTES) {
        throw new Error("The icon must be between 1 byte and 512 KiB");
      }
      if (
        file.type &&
        !file.type.startsWith("image/") &&
        file.type !== "application/octet-stream"
      ) {
        throw new Error("The selected file is not an image");
      }
      await ensureRenderableImage(file);
      const fetchedAt = Date.now();
      await putFavicon({
        bookmarkId: target.bookmarkId,
        pageUrl: canonicalUrl(target.pageUrl),
        source: "manual-upload",
        sourceUrl: file.name,
        status: "ready",
        blob: file.slice(0, file.size, file.type || "application/octet-stream"),
        fetchedAt,
      });
      await reload();
      const portableKey = portableKeys.get(target.bookmarkId);
      if (portableKey) {
        try {
          await saveSyncedFavicon(
            portableKey,
            await normaliseFaviconForSync(file),
            fetchedAt,
          );
        } catch (cause) {
          setError(asError(cause));
        }
      }
    },
    [portableKeys, reload],
  );

  const removeIcon = useCallback(
    async (bookmarkId: string): Promise<void> => {
      const deletedAt = Date.now();
      await deleteFavicon(bookmarkId);
      await reload();
      const portableKey = portableKeys.get(bookmarkId);
      if (portableKey) {
        try {
          await deleteSyncedFavicon(portableKey, deletedAt);
        } catch (cause) {
          setError(asError(cause));
        }
      }
    },
    [portableKeys, reload],
  );

  useEffect(() => {
    let active = true;
    const reconcile = async () => {
      await restoreSyncedFavicons(syncedTargets);
      const stored = await getFavicons(
        targetsRef.current.map(({ bookmarkId }) => bookmarkId),
      );
      if (active) replaceRecords(stored);

      // One-time migration for manual icons created before asset sync existed.
      const remote = await getSyncedFavicons();
      await Promise.all(
        syncedTargets.map(async ({ bookmarkId, portableKey }) => {
          const record = stored.get(bookmarkId);
          if (
            !record?.blob ||
            (record.source !== "manual-upload" &&
              record.source !== "manual-url")
          ) {
            return;
          }
          const synced = remote.get(syncedFaviconStorageKey(portableKey));
          if (synced && synced.updatedAt >= record.fetchedAt) return;
          await saveSyncedFavicon(
            portableKey,
            await normaliseFaviconForSync(record.blob),
            record.fetchedAt,
          );
        }),
      );
    };

    void reconcile().catch((cause: unknown) => {
      if (active) setError(asError(cause));
    });

    const handleStorageChange = (
      changes: Record<string, Browser.Storage.StorageChange>,
      area: string,
    ) => {
      if (area === "sync" && isSyncedFaviconStorageChange(changes)) {
        void reconcile().catch((cause: unknown) => {
          if (active) setError(asError(cause));
        });
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      active = false;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [replaceRecords, syncedTargetsKey, targetsKey]);

  useEffect(() => {
    if (settings.consent !== "enabled" || automaticTargets.length === 0) return;
    const requestKey = [
      settings.source,
      settings.ttlDays,
      settings.concurrency,
      automaticTargetsKey,
    ].join("\u0002");
    if (automaticRequestRef.current === requestKey) return;
    automaticRequestRef.current = requestKey;
    void refreshAll(false);
  }, [
    refreshAll,
    settings.concurrency,
    settings.consent,
    settings.source,
    settings.ttlDays,
    automaticTargets.length,
    automaticTargetsKey,
  ]);

  useEffect(
    () => () => {
      objectUrlsRef.current.forEach(URL.revokeObjectURL);
      objectUrlsRef.current = [];
    },
    [],
  );

  return {
    fetching,
    error,
    iconUrls,
    records,
    refreshAll,
    refreshOne,
    setFromUrl,
    setFromUpload,
    removeIcon,
    reload,
  };
}
