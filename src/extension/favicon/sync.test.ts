import {
  FAVICON_SYNC_MAX_BINARY_BYTES,
  type SyncedFavicon,
  syncedFaviconStorageKey,
  syncedItemBytes,
} from "./sync";

describe("favicon sync envelope", () => {
  test("keeps the largest accepted binary below the browser item quota", () => {
    const key = syncedFaviconStorageKey("p123456789.abcdefgh");
    const payload: SyncedFavicon = {
      version: 1,
      updatedAt: 1_700_000_000_000,
      mimeType: "image/webp",
      data: "a".repeat(Math.ceil((FAVICON_SYNC_MAX_BINARY_BYTES * 4) / 3)),
    };
    expect(syncedItemBytes(key, payload)).toBeLessThan(8_000);
  });

  test("uses one isolated key per portable bookmark", () => {
    expect(syncedFaviconStorageKey("root")).toBe("fdial/sync/favicon/root");
  });

  test("tombstones remain tiny enough to retain deletion state", () => {
    expect(
      syncedItemBytes(syncedFaviconStorageKey("p1.2"), {
        version: 1,
        updatedAt: 1_700_000_000_000,
        deleted: true,
      }),
    ).toBeLessThan(128);
  });
});
