import { useCallback, useEffect, useState } from "react";
import type Browser from "webextension-polyfill";

import { getCalendarFeedCaches } from "../../../extension/calendar/cacheStore";
import {
  CALENDAR_FEEDS_STORAGE_KEY,
  getCalendarFeeds,
} from "../../../extension/calendar/feedStore";
import type {
  AgendaEvent,
  CalendarFeed,
  CalendarFeedCache,
} from "../../../extension/calendar/types";
import {
  type BackgroundResponse,
  CALENDAR_CACHE_UPDATED,
  REFRESH_ALL_CALENDARS,
} from "../../../extension/messages";

type AgendaState = {
  events: AgendaEvent[];
  feeds: CalendarFeed[];
  caches: CalendarFeedCache[];
  loading: boolean;
  refreshing: boolean;
  error?: Error;
  refresh: (force?: boolean) => Promise<BackgroundResponse>;
};

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error("Could not load calendars");
}

export function useAgenda(): AgendaState {
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [caches, setCaches] = useState<CalendarFeedCache[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<Error>();

  const reload = useCallback(async () => {
    try {
      const [nextFeeds, nextCaches] = await Promise.all([
        getCalendarFeeds(),
        getCalendarFeedCaches(),
      ]);
      setFeeds(nextFeeds);
      setCaches(nextCaches);
      setError(undefined);
    } catch (cause) {
      setError(asError(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(
    async (force = true): Promise<BackgroundResponse> => {
      setRefreshing(true);
      try {
        const response = (await browser.runtime.sendMessage({
          type: REFRESH_ALL_CALENDARS,
          force,
        })) as BackgroundResponse;
        await reload();
        if (!response?.ok) {
          setError(new Error(response?.error ?? "Calendar refresh failed"));
        }
        return response;
      } catch (cause) {
        const nextError = asError(cause);
        setError(nextError);
        return { ok: false, error: nextError.message };
      } finally {
        setRefreshing(false);
      }
    },
    [reload],
  );

  useEffect(() => {
    void reload().then(() => refresh(false));
  }, [refresh, reload]);

  useEffect(() => {
    const handleMessage = (message: unknown) => {
      if (
        message &&
        typeof message === "object" &&
        "type" in message &&
        message.type === CALENDAR_CACHE_UPDATED
      ) {
        void reload();
      }
      return undefined;
    };
    const handleStorageChange = (
      changes: Record<string, Browser.Storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && CALENDAR_FEEDS_STORAGE_KEY in changes) {
        void reload();
      }
    };
    browser.runtime.onMessage.addListener(handleMessage);
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.runtime.onMessage.removeListener(handleMessage);
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [reload]);

  const enabledFeedIds = new Set(
    feeds.filter(({ enabled }) => enabled).map(({ id }) => id),
  );
  const events = caches
    .filter(({ feedId }) => enabledFeedIds.has(feedId))
    .flatMap(({ events: cachedEvents }) => cachedEvents);

  return { events, feeds, caches, loading, refreshing, error, refresh };
}
