import { useCallback, useEffect, useRef, useState } from "react";

import { deleteFavicon, getFavicons } from "../../../extension/favicon/store";
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
  removeIcon: (bookmarkId: string) => Promise<void>;
  reload: () => Promise<void>;
};

const BATCH_SIZE = 500;

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

export function useFavicons(
  targets: readonly FaviconTarget[],
  settings: FaviconSettings,
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
  targetsRef.current = targets;
  const targetsKey = targets
    .map(({ bookmarkId, pageUrl }) => `${bookmarkId}\u0000${pageUrl}`)
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
          index < targetsRef.current.length;
          index += BATCH_SIZE
        ) {
          const response = (await browser.runtime.sendMessage({
            type: FETCH_FAVICON_BATCH,
            items: targetsRef.current.slice(index, index + BATCH_SIZE),
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

  const removeIcon = useCallback(
    async (bookmarkId: string): Promise<void> => {
      await deleteFavicon(bookmarkId);
      await reload();
    },
    [reload],
  );

  useEffect(() => {
    let active = true;
    getFavicons(targetsRef.current.map(({ bookmarkId }) => bookmarkId))
      .then((stored) => {
        if (active) replaceRecords(stored);
      })
      .catch((cause: unknown) => {
        if (active) setError(asError(cause));
      });
    return () => {
      active = false;
    };
  }, [replaceRecords, targetsKey]);

  useEffect(() => {
    if (settings.consent !== "enabled" || targets.length === 0) return;
    const requestKey = [
      settings.source,
      settings.ttlDays,
      settings.concurrency,
      targetsKey,
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
    targets.length,
    targetsKey,
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
    removeIcon,
    reload,
  };
}
