import {
  type BookmarkNode,
  emptyLayout,
  getFolderItems,
  moveItem,
  reconcileLayout,
} from "./layout";

const tree = (): BookmarkNode => ({
  id: "root",
  title: "Root",
  type: "folder",
  children: [
    {
      id: "a",
      parentId: "root",
      index: 0,
      title: "Alpha",
      url: "https://alpha.example",
      type: "bookmark",
    },
    {
      id: "folder",
      parentId: "root",
      index: 1,
      title: "Folder",
      type: "folder",
      children: [
        {
          id: "b",
          parentId: "folder",
          index: 0,
          title: "Beta",
          url: "https://beta.example",
          type: "bookmark",
        },
        {
          id: "nested",
          parentId: "folder",
          index: 1,
          title: "Nested",
          type: "folder",
          children: [],
        },
      ],
    },
    {
      id: "c",
      parentId: "root",
      index: 2,
      title: "Gamma",
      url: "https://gamma.example",
      type: "bookmark",
    },
  ],
});

const ids = (nodes: BookmarkNode[]) => nodes.map(({ id }) => id);

describe("speed dial layout", () => {
  test("uses browser order when there is no overlay", () => {
    expect(ids(getFolderItems(tree(), "root", emptyLayout()))).toEqual([
      "a",
      "folder",
      "c",
    ]);
  });

  test("keeps saved order, removes deleted ids and appends new bookmarks", () => {
    const root = tree();
    root.children!.push({
      id: "new",
      parentId: "root",
      index: 3,
      title: "New",
      url: "https://new.example",
      type: "bookmark",
    });

    const layout = {
      orderByFolder: { root: ["c", "deleted", "a"] },
      parentByItem: {},
    };

    expect(ids(getFolderItems(root, "root", layout))).toEqual([
      "c",
      "a",
      "folder",
      "new",
    ]);
    expect(reconcileLayout(root, layout).orderByFolder.root).toEqual([
      "c",
      "a",
      "folder",
      "new",
    ]);
  });

  test("moves bookmarks between folders in the overlay", () => {
    const root = tree();
    const original = emptyLayout();
    const moved = moveItem(root, original, {
      itemId: "c",
      fromFolderId: "root",
      toFolderId: "folder",
      beforeId: "b",
    });

    expect(ids(getFolderItems(root, "root", moved))).toEqual(["a", "folder"]);
    expect(ids(getFolderItems(root, "folder", moved))).toEqual([
      "c",
      "b",
      "nested",
    ]);
    expect(moved.parentByItem.c).toBe("folder");
    expect(original).toEqual(emptyLayout());
  });

  test("reorders inside a folder without creating a parent override", () => {
    const root = tree();
    const moved = moveItem(root, emptyLayout(), {
      itemId: "c",
      fromFolderId: "root",
      toFolderId: "root",
      beforeId: "a",
    });

    expect(ids(getFolderItems(root, "root", moved))).toEqual([
      "c",
      "a",
      "folder",
    ]);
    expect(moved.parentByItem).toEqual({});
  });

  test("keeps layout across a URL change because bookmark ids are stable", () => {
    const root = tree();
    const moved = moveItem(root, emptyLayout(), {
      itemId: "c",
      fromFolderId: "root",
      toFolderId: "root",
      beforeId: "a",
    });
    root.children!.find(({ id }) => id === "c")!.url =
      "https://changed.example";

    expect(ids(getFolderItems(root, "root", moved))).toEqual([
      "c",
      "a",
      "folder",
    ]);
  });

  test("rejects moving a folder into its descendant", () => {
    const root = tree();
    const moved = moveItem(root, emptyLayout(), {
      itemId: "folder",
      fromFolderId: "root",
      toFolderId: "nested",
    });

    expect(moved.parentByItem).toEqual({});
    expect(ids(getFolderItems(root, "root", moved))).toEqual([
      "a",
      "folder",
      "c",
    ]);
  });

  test("drops stale and cyclic synced state instead of failing", () => {
    const root = tree();
    const reconciled = reconcileLayout(root, {
      orderByFolder: { missing: ["a"], root: ["missing", "c"] },
      parentByItem: {
        missing: "root",
        folder: "nested",
        c: "missing",
      },
    });

    expect(reconciled.parentByItem).toEqual({});
    expect(reconciled.orderByFolder).toEqual({
      root: ["c", "a", "folder"],
    });
  });
});
