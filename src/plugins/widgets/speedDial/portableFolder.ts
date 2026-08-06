import { type BookmarkNode, indexBookmarks } from "./layout";
import {
  normalisePortableTitle,
  normalisePortableUrl,
  portableFingerprint,
} from "./portableLayout";

export const PORTABLE_FOLDER_VERSION = 1 as const;
const MAX_ANCHORS = 16;

type RootContainer = "toolbar" | "menu" | "unfiled" | "mobile";

export type PortableFolderSelector = {
  version: typeof PORTABLE_FOLDER_VERSION;
  /** Normalised user-created folder path, excluding the browser root bucket. */
  path: string[];
  /** A small, non-reversible sample used to disambiguate duplicate names. */
  anchors: string[];
  container?: RootContainer;
};

const containerById: Readonly<Record<string, RootContainer>> = {
  "1": "toolbar",
  "2": "unfiled",
  "3": "mobile",
  toolbar_____: "toolbar",
  menu________: "menu",
  unfiled_____: "unfiled",
  mobile______: "mobile",
};

function rootContainer(node?: BookmarkNode): RootContainer | undefined {
  return node ? containerById[node.id] : undefined;
}

function folderAnchors(folder: BookmarkNode): string[] {
  const urls = new Set<string>();
  const visit = (node: BookmarkNode): void => {
    if (node.url) urls.add(normalisePortableUrl(node.url));
    node.children?.forEach(visit);
  };
  visit(folder);
  return [...urls]
    .map((url) => portableFingerprint(`url:${url}`))
    .toSorted()
    .slice(0, MAX_ANCHORS);
}

function folderChain(root: BookmarkNode, folderId: string): BookmarkNode[] {
  const index = indexBookmarks(root);
  const folder = index.nodes.get(folderId);
  if (!folder || !index.folders.has(folderId)) return [];

  const reversed: BookmarkNode[] = [];
  let cursor: BookmarkNode | undefined = folder;
  const seen = new Set<string>();
  while (cursor && cursor.id !== root.id && !seen.has(cursor.id)) {
    reversed.push(cursor);
    seen.add(cursor.id);
    cursor = cursor.parentId ? index.nodes.get(cursor.parentId) : undefined;
  }
  return cursor?.id === root.id ? reversed.reverse() : [];
}

function selectorFromChain(
  chain: BookmarkNode[],
): PortableFolderSelector | undefined {
  const folder = chain.at(-1);
  if (!folder) return undefined;
  const container = rootContainer(chain[0]);
  const userPath = container ? chain.slice(1) : chain;
  return {
    version: PORTABLE_FOLDER_VERSION,
    path: userPath.map(({ title }) => normalisePortableTitle(title)),
    anchors: folderAnchors(folder),
    ...(container ? { container } : {}),
  };
}

/** Create the richest selector available while the complete tree is loaded. */
export function createPortableFolderSelector(
  root: BookmarkNode,
  folderId: string,
): PortableFolderSelector | undefined {
  return selectorFromChain(folderChain(root, folderId));
}

/** Migrate a legacy selected subtree when its ancestors are not available. */
export function createPortableFolderSelectorFromSubtree(
  folder: BookmarkNode,
): PortableFolderSelector {
  const container = rootContainer(folder);
  return {
    version: PORTABLE_FOLDER_VERSION,
    path: container ? [] : [normalisePortableTitle(folder.title)],
    anchors: folderAnchors(folder),
    ...(container ? { container } : {}),
  };
}

function suffixMatches(
  left: readonly string[],
  right: readonly string[],
): number {
  let matches = 0;
  while (
    matches < left.length &&
    matches < right.length &&
    left[left.length - matches - 1] === right[right.length - matches - 1]
  ) {
    matches += 1;
  }
  return matches;
}

function scoreCandidate(
  selector: PortableFolderSelector,
  candidate: PortableFolderSelector,
): number | undefined {
  if (selector.version !== PORTABLE_FOLDER_VERSION) return undefined;

  const pathMatches = suffixMatches(selector.path, candidate.path);
  if (selector.path.length > 0 && pathMatches === 0) return undefined;
  if (
    selector.path.length === 0 &&
    (!selector.container || selector.container !== candidate.container)
  ) {
    return undefined;
  }

  const candidateAnchors = new Set(candidate.anchors);
  const matchingAnchors = selector.anchors.reduce(
    (total, anchor) => total + Number(candidateAnchors.has(anchor)),
    0,
  );
  const completePath =
    selector.path.length === candidate.path.length &&
    pathMatches === selector.path.length;
  const containerMatch = Boolean(
    selector.container && selector.container === candidate.container,
  );

  return (
    pathMatches * 20 +
    Number(completePath) * 20 +
    matchingAnchors * 4 +
    Number(containerMatch) * 8
  );
}

/**
 * Resolve conservatively. An exact tie is rejected so synced state can never
 * select an arbitrary same-named folder.
 */
export function resolvePortableFolder(
  root: BookmarkNode,
  selector: PortableFolderSelector,
): BookmarkNode | undefined {
  const index = indexBookmarks(root);
  let best: { node: BookmarkNode; score: number } | undefined;
  let tied = false;

  for (const folderId of index.folders) {
    if (folderId === root.id) continue;
    const candidate = createPortableFolderSelector(root, folderId);
    const node = index.nodes.get(folderId);
    if (!candidate || !node) continue;
    const score = scoreCandidate(selector, candidate);
    if (score === undefined) continue;
    if (!best || score > best.score) {
      best = { node, score };
      tied = false;
    } else if (score === best.score) {
      tied = true;
    }
  }

  return best && !tied ? best.node : undefined;
}
