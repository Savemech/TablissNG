import { fetchFavicon, fetchManualIcon } from "./favicon/fetch";
import { getFavicon, putFavicon } from "./favicon/store";
import type { FaviconRecord } from "./favicon/types";
import {
  BACKGROUND_HEALTH,
  type BackgroundResponse,
  FETCH_FAVICON,
  FETCH_FAVICON_BATCH,
  type FetchFaviconBatchMessage,
  isFetchFaviconMessage,
  isFetchFaviconBatchMessage,
} from "./messages";

const DAY_MS = 24 * 60 * 60 * 1000;

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : "Favicon fetch failed";
}

async function handleFavicon(message: unknown): Promise<BackgroundResponse> {
  if (!isFetchFaviconMessage(message)) {
    return { ok: false, error: "Invalid favicon request" };
  }

  let pageUrl: URL;
  try {
    pageUrl = new URL(message.pageUrl);
    if (!/^https?:$/.test(pageUrl.protocol)) throw new Error();
  } catch {
    return { ok: false, error: "Only HTTP(S) bookmark URLs are supported" };
  }

  const existing = await getFavicon(message.bookmarkId);
  const now = Date.now();
  if (
    !message.force &&
    existing &&
    existing.pageUrl === pageUrl.href &&
    (existing.source === "manual-upload" ||
      existing.source === "manual-url" ||
      (existing.source === message.source && (existing.expiresAt ?? 0) > now))
  ) {
    return { ok: true, status: "cached" };
  }

  const ttlDays = Math.min(365, Math.max(1, Math.round(message.ttlDays)));
  try {
    const fetched =
      message.source === "manual-url"
        ? await fetchManualIcon(message.manualUrl ?? "")
        : await fetchFavicon(message.source, pageUrl.href);
    const record: FaviconRecord = {
      bookmarkId: message.bookmarkId,
      pageUrl: pageUrl.href,
      source: message.source,
      sourceUrl: fetched.sourceUrl,
      status: "ready",
      blob: fetched.blob,
      fetchedAt: now,
      expiresAt:
        message.source === "manual-url" ? undefined : now + ttlDays * DAY_MS,
    };
    await putFavicon(record);
    return { ok: true, status: "ready" };
  } catch (error) {
    await putFavicon({
      bookmarkId: message.bookmarkId,
      pageUrl: pageUrl.href,
      source: message.source,
      status: "missing",
      fetchedAt: now,
      // Negative results have a short TTL so broken sites are not hammered on
      // every new tab while still recovering promptly.
      expiresAt: now + Math.min(ttlDays, 1) * DAY_MS,
      error: safeError(error),
    });
    return { ok: false, error: safeError(error) };
  }
}

async function handleFaviconBatch(
  message: FetchFaviconBatchMessage,
): Promise<BackgroundResponse> {
  const concurrency = Math.min(
    12,
    Math.max(1, Math.round(message.concurrency)),
  );
  let cursor = 0;
  let completed = 0;
  let failed = 0;

  const worker = async (): Promise<void> => {
    while (cursor < message.items.length) {
      const item = message.items[cursor++];
      try {
        const response = await handleFavicon({
          type: FETCH_FAVICON,
          bookmarkId: item.bookmarkId,
          pageUrl: item.pageUrl,
          source: message.source,
          ttlDays: message.ttlDays,
          force: message.force,
        });
        if (response.ok) completed += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, message.items.length) }, () =>
      worker(),
    ),
  );
  return { ok: true, status: "complete", completed, failed };
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === BACKGROUND_HEALTH
  ) {
    return Promise.resolve<BackgroundResponse>({
      ok: true,
      status: "healthy",
    });
  }
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === FETCH_FAVICON
  ) {
    return handleFavicon(message).catch((error: unknown) => ({
      ok: false as const,
      error: safeError(error),
    }));
  }
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === FETCH_FAVICON_BATCH
  ) {
    if (!isFetchFaviconBatchMessage(message)) {
      return Promise.resolve<BackgroundResponse>({
        ok: false,
        error: "Invalid favicon batch request",
      });
    }
    return handleFaviconBatch(message).catch((error: unknown) => ({
      ok: false as const,
      error: safeError(error),
    }));
  }
  return undefined;
});
