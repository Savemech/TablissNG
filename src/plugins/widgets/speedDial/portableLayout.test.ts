import {
  type BookmarkNode,
  emptyLayout,
  getFolderItems,
  moveItem,
} from "./layout";
import {
  emptyPortableLayout,
  fromPortableLayout,
  indexPortableBookmarks,
  toPortableLayout,
} from "./portableLayout";

function tree(prefix: string): BookmarkNode {
  return {
    id: `${prefix}-root`,
    title: "Browser root",
    type: "folder",
    children: [
      {
        id: `${prefix}-alpha`,
        parentId: `${prefix}-root`,
        index: 0,
        title: "Alpha",
        url: "https://alpha.example",
        type: "bookmark",
      },
      {
        id: `${prefix}-folder`,
        parentId: `${prefix}-root`,
        index: 1,
        title: "Work",
        type: "folder",
        children: [
          {
            id: `${prefix}-beta`,
            parentId: `${prefix}-folder`,
            index: 0,
            title: "Beta",
            url: "https://beta.example",
            type: "bookmark",
          },
        ],
      },
      {
        id: `${prefix}-gamma`,
        parentId: `${prefix}-root`,
        index: 2,
        title: "Gamma",
        url: "https://gamma.example/path",
        type: "bookmark",
      },
    ],
  };
}

const ids = (nodes: BookmarkNode[]): string[] =>
  nodes.map(({ id }) => id.replace(/^[^-]+-/, ""));

describe("portable speed dial layout", () => {
  test("restores order and virtual parents against different browser ids", () => {
    const source = tree("chrome");
    let layout = moveItem(source, emptyLayout(), {
      itemId: "chrome-gamma",
      fromFolderId: "chrome-root",
      toFolderId: "chrome-folder",
      beforeId: "chrome-beta",
    });
    layout = moveItem(source, layout, {
      itemId: "chrome-alpha",
      fromFolderId: "chrome-root",
      toFolderId: "chrome-root",
    });

    const target = tree("firefox");
    const restored = fromPortableLayout(
      target,
      toPortableLayout(source, layout),
    );

    expect(ids(getFolderItems(target, "firefox-root", restored))).toEqual([
      "folder",
      "alpha",
    ]);
    expect(ids(getFolderItems(target, "firefox-folder", restored))).toEqual([
      "gamma",
      "beta",
    ]);
    expect(restored.parentByItem["firefox-gamma"]).toBe("firefox-folder");
  });

  test("keys are relative to the selected root and ignore ids and root title", () => {
    const chrome = tree("chrome");
    const firefox = tree("firefox");
    firefox.title = "Корень";

    expect([...indexPortableBookmarks(chrome).keyById.values()]).toEqual([
      ...indexPortableBookmarks(firefox).keyById.values(),
    ]);
  });

  test("drops missing fingerprints and appends new browser bookmarks", () => {
    const source = tree("source");
    const portable = toPortableLayout(
      source,
      moveItem(source, emptyLayout(), {
        itemId: "source-gamma",
        fromFolderId: "source-root",
        toFolderId: "source-root",
        beforeId: "source-alpha",
      }),
    );
    const target = tree("target");
    target.children = target.children!.filter(
      ({ id }) => id !== "target-alpha",
    );
    target.children.push({
      id: "target-new",
      parentId: "target-root",
      index: 3,
      title: "New",
      url: "https://new.example",
      type: "bookmark",
    });

    expect(
      ids(
        getFolderItems(
          target,
          "target-root",
          fromPortableLayout(target, portable),
        ),
      ),
    ).toEqual(["gamma", "folder", "new"]);
  });

  test("an explicitly empty portable overlay does not revive legacy ids", () => {
    expect(fromPortableLayout(tree("target"), emptyPortableLayout())).toEqual(
      emptyLayout(),
    );
  });
});
