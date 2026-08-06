export type BookmarkNode = {
  id: string;
  parentId?: string;
  index?: number;
  title: string;
  url?: string;
  type?: "bookmark" | "folder" | "separator";
  children?: BookmarkNode[];
};

/**
 * A sparse, synced layer over the browser's bookmark tree.
 *
 * Only folders whose order the user changed are stored. Cross-folder moves
 * are represented separately, keeping the common case compact enough for
 * extension sync storage.
 */
export type LayoutOverlay = {
  orderByFolder: Record<string, string[]>;
  parentByItem: Record<string, string>;
};

export type IndexedBookmarks = {
  rootId: string;
  nodes: ReadonlyMap<string, BookmarkNode>;
  folders: ReadonlySet<string>;
  naturalChildren: ReadonlyMap<string, readonly string[]>;
};

export type MoveItemInput = {
  itemId: string;
  fromFolderId: string;
  toFolderId: string;
  beforeId?: string;
};

export function emptyLayout(): LayoutOverlay {
  return { orderByFolder: {}, parentByItem: {} };
}

function isFolder(node: BookmarkNode): boolean {
  return node.type === "folder" || (!node.url && node.type !== "separator");
}

/** Flatten a bookmark subtree once so render and drag operations stay O(n). */
export function indexBookmarks(root: BookmarkNode): IndexedBookmarks {
  const nodes = new Map<string, BookmarkNode>();
  const folders = new Set<string>();
  const naturalChildren = new Map<string, string[]>();

  const visit = (node: BookmarkNode): void => {
    if (node.type === "separator") return;

    nodes.set(node.id, node);
    if (isFolder(node)) folders.add(node.id);

    const children = (node.children ?? [])
      .filter((child) => child.type !== "separator")
      .toSorted((a, b) => (a.index ?? 0) - (b.index ?? 0));
    naturalChildren.set(
      node.id,
      children.map((child) => child.id),
    );
    children.forEach(visit);
  };

  visit(root);
  return { rootId: root.id, nodes, folders, naturalChildren };
}

function validNaturalParent(
  index: IndexedBookmarks,
  node: BookmarkNode,
): string | undefined {
  return node.parentId && index.folders.has(node.parentId)
    ? node.parentId
    : undefined;
}

/**
 * Filter missing ids and invalid/cyclic virtual parents from persisted data.
 * Corrupt sync state must never make a new-tab page unusable.
 */
function sanitizeParents(
  index: IndexedBookmarks,
  overlay: LayoutOverlay,
): Record<string, string> {
  const parents: Record<string, string> = {};

  for (const [itemId, folderId] of Object.entries(overlay.parentByItem)) {
    const item = index.nodes.get(itemId);
    if (!item || itemId === index.rootId || !index.folders.has(folderId)) {
      continue;
    }
    if (folderId !== validNaturalParent(index, item)) {
      parents[itemId] = folderId;
    }
  }

  const parentOf = (itemId: string): string | undefined => {
    const node = index.nodes.get(itemId);
    return parents[itemId] ?? (node && validNaturalParent(index, node));
  };

  // An override can only create a cycle when the moved item is a folder.
  // Remove offending overrides until the graph is acyclic.
  let changed = true;
  while (changed) {
    changed = false;
    for (const itemId of Object.keys(parents)) {
      if (!index.folders.has(itemId)) continue;

      const seen = new Set<string>([itemId]);
      let cursor: string | undefined = parents[itemId];
      while (cursor) {
        if (seen.has(cursor)) {
          delete parents[itemId];
          changed = true;
          break;
        }
        seen.add(cursor);
        cursor = parentOf(cursor);
      }
    }
  }

  return parents;
}

function assignedChildren(
  index: IndexedBookmarks,
  parents: Readonly<Record<string, string>>,
): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const folderId of index.folders) children.set(folderId, []);

  // Iterating natural groups preserves browser order for items not mentioned
  // in the sparse overlay.
  for (const ids of index.naturalChildren.values()) {
    for (const itemId of ids) {
      const node = index.nodes.get(itemId);
      if (!node) continue;
      const folderId = parents[itemId] ?? validNaturalParent(index, node);
      if (folderId && children.has(folderId))
        children.get(folderId)!.push(itemId);
    }
  }

  return children;
}

function applyOrder(
  natural: readonly string[],
  saved?: readonly string[],
): string[] {
  if (!saved) return [...natural];

  const available = new Set(natural);
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const id of saved) {
    if (available.has(id) && !seen.has(id)) {
      ordered.push(id);
      seen.add(id);
    }
  }
  for (const id of natural) {
    if (!seen.has(id)) ordered.push(id);
  }
  return ordered;
}

export function getFolderItems(
  root: BookmarkNode,
  folderId: string,
  overlay: LayoutOverlay,
): BookmarkNode[] {
  const index = indexBookmarks(root);
  if (!index.folders.has(folderId)) return [];

  const parents = sanitizeParents(index, overlay);
  const children = assignedChildren(index, parents).get(folderId) ?? [];
  return applyOrder(children, overlay.orderByFolder[folderId])
    .map((id) => index.nodes.get(id))
    .filter((node): node is BookmarkNode => Boolean(node));
}

/** Return a compact overlay with stale bookmark ids removed. */
export function reconcileLayout(
  root: BookmarkNode,
  overlay: LayoutOverlay,
): LayoutOverlay {
  const index = indexBookmarks(root);
  const parentByItem = sanitizeParents(index, overlay);
  const children = assignedChildren(index, parentByItem);
  const orderByFolder: Record<string, string[]> = {};

  for (const folderId of Object.keys(overlay.orderByFolder)) {
    if (!index.folders.has(folderId)) continue;
    const order = applyOrder(
      children.get(folderId) ?? [],
      overlay.orderByFolder[folderId],
    );
    if (order.length > 0) orderByFolder[folderId] = order;
  }

  return { orderByFolder, parentByItem };
}

/**
 * Reorder a tile or move it into another bookmark folder without mutating the
 * browser tree. Passing no `beforeId` appends the tile to the target folder.
 */
export function moveItem(
  root: BookmarkNode,
  overlay: LayoutOverlay,
  input: MoveItemInput,
): LayoutOverlay {
  const index = indexBookmarks(root);
  const item = index.nodes.get(input.itemId);
  if (
    !item ||
    input.itemId === index.rootId ||
    !index.folders.has(input.fromFolderId) ||
    !index.folders.has(input.toFolderId)
  ) {
    return reconcileLayout(root, overlay);
  }

  const currentParents = sanitizeParents(index, overlay);
  const currentParent =
    currentParents[input.itemId] ?? validNaturalParent(index, item);
  if (currentParent !== input.fromFolderId) {
    return reconcileLayout(root, overlay);
  }

  const parentByItem = { ...currentParents };
  const naturalParent = validNaturalParent(index, item);
  if (input.toFolderId === naturalParent) {
    delete parentByItem[input.itemId];
  } else {
    parentByItem[input.itemId] = input.toFolderId;
  }

  // Reject a folder move that would introduce a cycle. sanitizeParents drops
  // precisely such an override, making this comparison deterministic.
  const sanitizedMove = sanitizeParents(index, {
    orderByFolder: overlay.orderByFolder,
    parentByItem,
  });
  if (
    parentByItem[input.itemId] &&
    sanitizedMove[input.itemId] !== parentByItem[input.itemId]
  ) {
    return reconcileLayout(root, overlay);
  }

  const baseOverlay: LayoutOverlay = {
    orderByFolder: { ...overlay.orderByFolder },
    parentByItem: sanitizedMove,
  };
  const sourceIds = getFolderItems(root, input.fromFolderId, overlay)
    .map(({ id }) => id)
    .filter((id) => id !== input.itemId);

  if (input.fromFolderId === input.toFolderId) {
    const beforeIndex = input.beforeId ? sourceIds.indexOf(input.beforeId) : -1;
    sourceIds.splice(
      beforeIndex >= 0 ? beforeIndex : sourceIds.length,
      0,
      input.itemId,
    );
    baseOverlay.orderByFolder[input.fromFolderId] = sourceIds;
    return reconcileLayout(root, baseOverlay);
  }

  const targetIds = getFolderItems(root, input.toFolderId, baseOverlay)
    .map(({ id }) => id)
    .filter((id) => id !== input.itemId);
  const beforeIndex = input.beforeId ? targetIds.indexOf(input.beforeId) : -1;
  targetIds.splice(
    beforeIndex >= 0 ? beforeIndex : targetIds.length,
    0,
    input.itemId,
  );

  baseOverlay.orderByFolder[input.fromFolderId] = sourceIds;
  baseOverlay.orderByFolder[input.toFolderId] = targetIds;
  return reconcileLayout(root, baseOverlay);
}
