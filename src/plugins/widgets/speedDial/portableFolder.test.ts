import type { BookmarkNode } from "./layout";
import {
  createPortableFolderSelector,
  createPortableFolderSelectorFromSubtree,
  resolvePortableFolder,
} from "./portableFolder";

function bookmark(id: string, parentId: string, url: string): BookmarkNode {
  return { id, parentId, title: id, url, type: "bookmark" };
}

function chromeTree(): BookmarkNode {
  return {
    id: "0",
    title: "",
    type: "folder",
    children: [
      {
        id: "1",
        parentId: "0",
        title: "Bookmarks bar",
        type: "folder",
        children: [
          {
            id: "10",
            parentId: "1",
            title: "Work",
            type: "folder",
            children: [
              bookmark("11", "10", "https://git.example"),
              bookmark("12", "10", "https://mail.example"),
            ],
          },
        ],
      },
    ],
  };
}

function firefoxTree(): BookmarkNode {
  return {
    id: "root________",
    title: "",
    type: "folder",
    children: [
      {
        id: "toolbar_____",
        parentId: "root________",
        title: "Панель закладок",
        type: "folder",
        children: [
          {
            id: "ff-work",
            parentId: "toolbar_____",
            title: "Work",
            type: "folder",
            children: [
              bookmark("ff-git", "ff-work", "https://git.example/"),
              bookmark("ff-mail", "ff-work", "https://mail.example"),
            ],
          },
        ],
      },
    ],
  };
}

describe("portable Speed Dial root folder", () => {
  test("maps a Chrome toolbar folder to Firefox without browser ids or labels", () => {
    const selector = createPortableFolderSelector(chromeTree(), "10")!;
    expect(resolvePortableFolder(firefoxTree(), selector)?.id).toBe("ff-work");
  });

  test("uses URL anchors to disambiguate folders with the same title", () => {
    const target = firefoxTree();
    target.children!.push({
      id: "menu________",
      parentId: "root________",
      title: "Bookmarks Menu",
      type: "folder",
      children: [
        {
          id: "other-work",
          parentId: "menu________",
          title: "Work",
          type: "folder",
          children: [bookmark("news", "other-work", "https://news.example")],
        },
      ],
    });

    const selector = createPortableFolderSelector(chromeTree(), "10")!;
    expect(resolvePortableFolder(target, selector)?.id).toBe("ff-work");
  });

  test("migrates a legacy subtree without needing its old ancestors", () => {
    const source = chromeTree().children![0].children![0];
    const selector = createPortableFolderSelectorFromSubtree(source);
    expect(resolvePortableFolder(firefoxTree(), selector)?.id).toBe("ff-work");
  });

  test("refuses an ambiguous empty folder instead of selecting arbitrarily", () => {
    const target = firefoxTree();
    target.children![0].children!.push({
      id: "ff-work-empty",
      parentId: "toolbar_____",
      title: "Work",
      type: "folder",
      children: [],
    });
    const selector = createPortableFolderSelectorFromSubtree({
      id: "old",
      title: "Work",
      type: "folder",
      children: [],
    });

    expect(createPortableFolderSelector(target, "ff-work-empty")?.path).toEqual(
      ["work"],
    );
    expect(resolvePortableFolder(target, selector)).toBeUndefined();
  });
});
