import { type BookmarkNode } from "./layout";
import {
  faviconCandidates,
  faviconPermissionOrigins,
  faviconTargets,
  type FaviconTarget,
} from "./faviconPolicy";

const nodes: BookmarkNode[] = [
  { id: "public", title: "Public", url: "https://example.com/path" },
  { id: "local", title: "Local", url: "http://pve:8006/" },
  { id: "special", title: "Special", url: "about:config" },
  { id: "folder", title: "Folder", type: "folder" },
];

describe("Speed Dial favicon policy", () => {
  test("manual icons remain available for non-HTTP bookmarks", () => {
    expect(
      faviconCandidates(nodes).map(({ bookmarkId }) => bookmarkId),
    ).toEqual(["public", "local", "special"]);
  });

  test("direct fetching optionally includes local services", () => {
    expect(
      faviconTargets(nodes, { source: "direct", includeLocal: false }).map(
        ({ bookmarkId }) => bookmarkId,
      ),
    ).toEqual(["public"]);
    expect(
      faviconTargets(nodes, { source: "direct", includeLocal: true }).map(
        ({ bookmarkId }) => bookmarkId,
      ),
    ).toEqual(["public", "local"]);
  });

  test("third-party providers never receive local hostnames", () => {
    expect(
      faviconTargets(nodes, { source: "google", includeLocal: true }).map(
        ({ bookmarkId }) => bookmarkId,
      ),
    ).toEqual(["public"]);
  });

  test("requests exact direct origins and one provider origin", () => {
    const targets: FaviconTarget[] = [
      { bookmarkId: "one", pageUrl: "https://example.com/a" },
      { bookmarkId: "two", pageUrl: "https://example.com/b" },
      { bookmarkId: "three", pageUrl: "http://pve:8006/" },
    ];
    expect(faviconPermissionOrigins(targets, "direct")).toEqual([
      "https://example.com/*",
      "http://pve:8006/*",
    ]);
    expect(faviconPermissionOrigins(targets, "duckduckgo")).toEqual([
      "https://icons.duckduckgo.com/*",
    ]);
  });
});
