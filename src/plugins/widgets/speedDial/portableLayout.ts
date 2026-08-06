import {
  type BookmarkNode,
  emptyLayout,
  type LayoutOverlay,
  reconcileLayout,
} from "./layout";

export const PORTABLE_LAYOUT_VERSION = 1 as const;

/**
 * Browser bookmark ids are only meaningful inside one browser profile. This
 * representation uses deterministic fingerprints instead, so it can travel
 * through storage.sync and settings backups without applying ids to the wrong
 * tree.
 */
export type PortableLayoutOverlay = {
  version: typeof PORTABLE_LAYOUT_VERSION;
  orderByFolder: Record<string, string[]>;
  parentByItem: Record<string, string>;
};

export type PortableBookmarkIndex = {
  keyById: ReadonlyMap<string, string>;
  idByKey: ReadonlyMap<string, string>;
};

export function emptyPortableLayout(): PortableLayoutOverlay {
  return {
    version: PORTABLE_LAYOUT_VERSION,
    orderByFolder: {},
    parentByItem: {},
  };
}

export function normalisePortableTitle(title: string): string {
  return title.trim().normalize("NFKC").toLowerCase();
}

export function normalisePortableUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url.trim();
  }
}

function nodeIdentity(node: BookmarkNode): string {
  if (node.url) return `b:${normalisePortableUrl(node.url)}`;
  return `f:${normalisePortableTitle(node.title)}`;
}

/** Two independent 32-bit hashes keep synced keys short without silent moves. */
export function portableFingerprint(identity: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < identity.length; index += 1) {
    const code = identity.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `p${(first >>> 0).toString(36)}.${(second >>> 0).toString(36)}`;
}

/**
 * Build keys from the natural bookmark tree, not the virtual DnD parent. The
 * identity therefore remains stable while an overlay moves tiles around.
 */
export function indexPortableBookmarks(
  root: BookmarkNode,
): PortableBookmarkIndex {
  const keyById = new Map<string, string>();
  const candidatesByKey = new Map<string, string[]>();

  const add = (id: string, identity: string): void => {
    const key = identity === "$root" ? "root" : portableFingerprint(identity);
    keyById.set(id, key);
    const candidates = candidatesByKey.get(key) ?? [];
    candidates.push(id);
    candidatesByKey.set(key, candidates);
  };

  const visit = (node: BookmarkNode, identity: string): void => {
    add(node.id, identity);

    const occurrences = new Map<string, number>();
    const children = (node.children ?? [])
      .filter((child) => child.type !== "separator")
      .toSorted((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const child of children) {
      const base = nodeIdentity(child);
      const occurrence = occurrences.get(base) ?? 0;
      occurrences.set(base, occurrence + 1);
      visit(child, `${identity}/${base}#${occurrence}`);
    }
  };

  visit(root, "$root");

  // A hash collision must degrade to the natural layout, never target a
  // possibly unrelated bookmark.
  const idByKey = new Map<string, string>();
  for (const [key, ids] of candidatesByKey) {
    if (ids.length === 1) idByKey.set(key, ids[0]);
  }
  return { keyById, idByKey };
}

function translateOrder(
  order: Readonly<Record<string, readonly string[]>>,
  keyById: ReadonlyMap<string, string>,
): Record<string, string[]> {
  const translated: Record<string, string[]> = {};
  for (const [folderId, itemIds] of Object.entries(order)) {
    const folderKey = keyById.get(folderId);
    if (!folderKey) continue;
    const itemKeys = itemIds
      .map((itemId) => keyById.get(itemId))
      .filter((key): key is string => Boolean(key));
    if (itemKeys.length > 0) translated[folderKey] = itemKeys;
  }
  return translated;
}

/** Convert a validated runtime overlay into browser-independent sync data. */
export function toPortableLayout(
  root: BookmarkNode,
  overlay: LayoutOverlay,
): PortableLayoutOverlay {
  const reconciled = reconcileLayout(root, overlay);
  const { keyById } = indexPortableBookmarks(root);
  const parentByItem: Record<string, string> = {};

  for (const [itemId, folderId] of Object.entries(reconciled.parentByItem)) {
    const itemKey = keyById.get(itemId);
    const folderKey = keyById.get(folderId);
    if (itemKey && folderKey) parentByItem[itemKey] = folderKey;
  }

  return {
    version: PORTABLE_LAYOUT_VERSION,
    orderByFolder: translateOrder(reconciled.orderByFolder, keyById),
    parentByItem,
  };
}

/** Restore a runtime id overlay, dropping stale or ambiguous fingerprints. */
export function fromPortableLayout(
  root: BookmarkNode,
  portable: PortableLayoutOverlay,
): LayoutOverlay {
  if (portable.version !== PORTABLE_LAYOUT_VERSION) return emptyLayout();

  const { idByKey } = indexPortableBookmarks(root);
  const orderByFolder: Record<string, string[]> = {};
  const parentByItem: Record<string, string> = {};

  for (const [folderKey, itemKeys] of Object.entries(portable.orderByFolder)) {
    const folderId = idByKey.get(folderKey);
    if (!folderId) continue;
    const itemIds = itemKeys
      .map((itemKey) => idByKey.get(itemKey))
      .filter((id): id is string => Boolean(id));
    if (itemIds.length > 0) orderByFolder[folderId] = itemIds;
  }

  for (const [itemKey, folderKey] of Object.entries(portable.parentByItem)) {
    const itemId = idByKey.get(itemKey);
    const folderId = idByKey.get(folderKey);
    if (itemId && folderId) parentByItem[itemId] = folderId;
  }

  return reconcileLayout(root, { orderByFolder, parentByItem });
}
