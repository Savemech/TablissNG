import { useCallback, useEffect, useRef, useState } from "react";

import type { BookmarkNode } from "./layout";

type PermissionState = "checking" | "denied" | "granted";

export type BookmarksState = {
  permission: PermissionState;
  loading: boolean;
  tree?: BookmarkNode;
  error?: Error;
  refresh: () => Promise<void>;
  requestPermission: () => Promise<boolean>;
};

const permissionRequest: { permissions: ["bookmarks"] } = {
  permissions: ["bookmarks"],
};

/** Live, permission-aware adapter around the WebExtension bookmarks API. */
export function useBookmarks(rootId: string | null): BookmarksState {
  const [permission, setPermission] = useState<PermissionState>("checking");
  const [loading, setLoading] = useState(false);
  const [tree, setTree] = useState<BookmarkNode>();
  const [error, setError] = useState<Error>();
  const requestVersionRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    const requestVersion = ++requestVersionRef.current;
    setLoading(true);
    setError(undefined);

    try {
      const result = rootId
        ? await browser.bookmarks.getSubTree(rootId)
        : await browser.bookmarks.getTree();
      if (!result[0]) throw new Error("Bookmark root was not found");
      if (requestVersion === requestVersionRef.current) {
        setTree(result[0]);
      }
    } catch (cause) {
      if (requestVersion === requestVersionRef.current) {
        setTree(undefined);
        setError(
          cause instanceof Error
            ? cause
            : new Error("Could not read browser bookmarks"),
        );
      }
    } finally {
      if (requestVersion === requestVersionRef.current) setLoading(false);
    }
  }, [rootId]);

  const checkPermission = useCallback(async (): Promise<void> => {
    const granted = await browser.permissions.contains(permissionRequest);
    setPermission(granted ? "granted" : "denied");
    if (!granted) {
      requestVersionRef.current += 1;
      setTree(undefined);
      setLoading(false);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    const granted = await browser.permissions.request(permissionRequest);
    setPermission(granted ? "granted" : "denied");
    return granted;
  }, []);

  useEffect(() => {
    void checkPermission();
    browser.permissions.onAdded.addListener(checkPermission);
    browser.permissions.onRemoved.addListener(checkPermission);
    return () => {
      browser.permissions.onAdded.removeListener(checkPermission);
      browser.permissions.onRemoved.removeListener(checkPermission);
    };
  }, [checkPermission]);

  useEffect(() => {
    if (permission !== "granted") return;
    void refresh();

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void refresh(), 50);
    };

    browser.bookmarks.onCreated.addListener(scheduleRefresh);
    browser.bookmarks.onRemoved.addListener(scheduleRefresh);
    browser.bookmarks.onChanged.addListener(scheduleRefresh);
    browser.bookmarks.onMoved.addListener(scheduleRefresh);

    return () => {
      requestVersionRef.current += 1;
      if (refreshTimer) clearTimeout(refreshTimer);
      browser.bookmarks.onCreated.removeListener(scheduleRefresh);
      browser.bookmarks.onRemoved.removeListener(scheduleRefresh);
      browser.bookmarks.onChanged.removeListener(scheduleRefresh);
      browser.bookmarks.onMoved.removeListener(scheduleRefresh);
    };
  }, [permission, refresh]);

  return {
    permission,
    loading,
    tree,
    error,
    refresh,
    requestPermission,
  };
}
