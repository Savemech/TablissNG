import "./SpeedDial.sass";

import {
  type CSSProperties,
  type DragEvent,
  type FC,
  useMemo,
  useRef,
  useState,
} from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import FaviconConsent from "./FaviconConsent";
import { faviconTargets, requestFaviconPermissions } from "./faviconPolicy";
import {
  type BookmarkNode,
  getFolderItems,
  indexBookmarks,
  moveItem,
} from "./layout";
import { defaultData, type Props } from "./types";
import { useBookmarks } from "./useBookmarks";
import { useFavicons } from "./useFavicons";

const messages = defineMessages({
  permissionTitle: {
    id: "plugins.speedDial.permission.title",
    defaultMessage: "Show your browser bookmarks here?",
    description: "Speed Dial bookmark permission prompt title",
  },
  permissionDescription: {
    id: "plugins.speedDial.permission.description",
    defaultMessage:
      "Speed Dial needs bookmark access to build the grid. Nothing is sent anywhere.",
    description: "Speed Dial bookmark permission explanation",
  },
  grantPermission: {
    id: "plugins.speedDial.permission.grant",
    defaultMessage: "Allow bookmark access",
    description: "Button that requests bookmark permission",
  },
  loadError: {
    id: "plugins.speedDial.error.load",
    defaultMessage: "Could not load bookmarks.",
    description: "Speed Dial bookmark loading error",
  },
  retry: {
    id: "plugins.speedDial.retry",
    defaultMessage: "Try again",
    description: "Retry loading Speed Dial bookmarks",
  },
  back: {
    id: "plugins.speedDial.back",
    defaultMessage: "Back",
    description: "Navigate to the parent Speed Dial folder",
  },
  empty: {
    id: "plugins.speedDial.empty",
    defaultMessage: "This folder is empty.",
    description: "Empty Speed Dial folder message",
  },
  folder: {
    id: "plugins.speedDial.folder",
    defaultMessage: "Open folder {name}",
    description: "Accessible label for a Speed Dial folder",
  },
  refreshFavicons: {
    id: "plugins.speedDial.favicons.refresh",
    defaultMessage: "Refresh tile icons",
    description: "Refresh all Speed Dial favicons button",
  },
  faviconPermissionError: {
    id: "plugins.speedDial.favicons.refreshPermissionError",
    defaultMessage: "Icon access was not granted.",
    description: "Favicon refresh permission denial",
  },
});

type DropTarget = {
  itemId: string;
  mode: "before" | "inside";
};

function isFolder(node: BookmarkNode): boolean {
  return node.type === "folder" || (!node.url && node.type !== "separator");
}

function titleFor(node: BookmarkNode): string {
  if (node.title.trim()) return node.title.trim();
  if (!node.url) return "…";
  try {
    return new URL(node.url).hostname;
  } catch {
    return node.url;
  }
}

function truncate(value: string, length: number): string {
  if (length <= 0 || value.length <= length) return value;
  return `${value.slice(0, Math.max(1, length - 1)).trimEnd()}…`;
}

function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[1][0]}`.toLocaleUpperCase();
  }
  return (parts[0]?.slice(0, 2) || "?").toLocaleUpperCase();
}

function fallbackColour(id: string): string {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 55% 42%)`;
}

const BookmarkIcon: FC<{
  bookmarkId: string;
  faviconUrl?: string;
  title: string;
}> = ({ bookmarkId, faviconUrl, title }) => {
  const [failed, setFailed] = useState(false);

  return faviconUrl && !failed ? (
    <img
      className="SpeedDial__icon SpeedDial__favicon"
      src={faviconUrl}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailed(true)}
    />
  ) : (
    <span
      className="SpeedDial__icon SpeedDial__initials"
      style={{ backgroundColor: fallbackColour(bookmarkId) }}
      aria-hidden="true"
    >
      {initials(title)}
    </span>
  );
};

function dropMode(
  event: DragEvent<HTMLDivElement>,
  item: BookmarkNode,
): DropTarget["mode"] {
  if (!isFolder(item)) return "before";

  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return x > 0.2 && x < 0.8 && y > 0.15 && y < 0.85 ? "inside" : "before";
}

const SpeedDial: FC<Props> = ({ data = defaultData, setData }) => {
  const intl = useIntl();
  const faviconSettings = data.favicons ?? defaultData.favicons;
  const { error, loading, permission, refresh, requestPermission, tree } =
    useBookmarks(data.rootBookmarkId);
  const [path, setPath] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string>();
  const [dropTarget, setDropTarget] = useState<DropTarget>();
  const [faviconPermissionError, setFaviconPermissionError] = useState(false);
  const draggedIdRef = useRef<string | undefined>(undefined);

  const updateDraggedId = (itemId?: string) => {
    draggedIdRef.current = itemId;
    setDraggedId(itemId);
  };

  const bookmarkIndex = useMemo(
    () => (tree ? indexBookmarks(tree) : undefined),
    [tree],
  );
  const bookmarkNodes = useMemo(
    () => (bookmarkIndex ? [...bookmarkIndex.nodes.values()] : []),
    [bookmarkIndex],
  );
  const faviconTargetList = useMemo(
    () => faviconTargets(bookmarkNodes, faviconSettings),
    [bookmarkNodes, faviconSettings.includeLocal, faviconSettings.source],
  );
  const {
    error: faviconError,
    fetching: fetchingFavicons,
    iconUrls,
    refreshAll: refreshFavicons,
  } = useFavicons(faviconTargetList, faviconSettings);
  const activePath = useMemo(() => {
    if (!tree || !bookmarkIndex) return [];
    if (path[0] !== tree.id) return [tree.id];
    const valid = path.filter((id) => bookmarkIndex.folders.has(id));
    return valid.length > 0 ? valid : [tree.id];
  }, [bookmarkIndex, path, tree]);
  const currentFolderId = activePath.at(-1);
  const currentFolder = currentFolderId
    ? bookmarkIndex?.nodes.get(currentFolderId)
    : undefined;
  const items = useMemo(
    () =>
      tree && currentFolderId
        ? getFolderItems(tree, currentFolderId, data.layout)
        : [],
    [currentFolderId, data.layout, tree],
  );

  const saveMove = (itemId: string, toFolderId: string, beforeId?: string) => {
    if (!tree || !currentFolderId) return;
    const layout = moveItem(tree, data.layout, {
      itemId,
      fromFolderId: currentFolderId,
      toFolderId,
      beforeId,
    });
    setData({ ...data, layout });
  };

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    itemId: string,
  ) => {
    updateDraggedId(itemId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
  };

  const handleTileDragOver = (
    event: DragEvent<HTMLDivElement>,
    item: BookmarkNode,
  ) => {
    const activeDraggedId = draggedIdRef.current;
    if (!activeDraggedId || activeDraggedId === item.id) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget({ itemId: item.id, mode: dropMode(event, item) });
  };

  const handleTileDrop = (
    event: DragEvent<HTMLDivElement>,
    item: BookmarkNode,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const activeDraggedId = draggedIdRef.current;
    if (!activeDraggedId) return;

    if (dropMode(event, item) === "inside") {
      saveMove(activeDraggedId, item.id);
    } else {
      saveMove(activeDraggedId, currentFolderId!, item.id);
    }
    updateDraggedId();
    setDropTarget(undefined);
  };

  const handleGridDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const activeDraggedId = draggedIdRef.current;
    if (activeDraggedId && currentFolderId) {
      saveMove(activeDraggedId, currentFolderId);
    }
    updateDraggedId();
    setDropTarget(undefined);
  };

  const handleFaviconRefresh = async () => {
    setFaviconPermissionError(false);
    const granted = await requestFaviconPermissions(
      faviconTargetList,
      faviconSettings.source,
    );
    if (!granted) {
      setFaviconPermissionError(true);
      return;
    }
    await refreshFavicons(true);
  };

  if (permission === "checking") return null;

  if (permission === "denied") {
    return (
      <section className="SpeedDial SpeedDial--message">
        <strong>{intl.formatMessage(messages.permissionTitle)}</strong>
        <p>{intl.formatMessage(messages.permissionDescription)}</p>
        <button type="button" onClick={() => void requestPermission()}>
          {intl.formatMessage(messages.grantPermission)}
        </button>
      </section>
    );
  }

  if (error) {
    return (
      <section className="SpeedDial SpeedDial--message">
        <p>{intl.formatMessage(messages.loadError)}</p>
        <button type="button" onClick={() => void refresh()}>
          {intl.formatMessage(messages.retry)}
        </button>
      </section>
    );
  }

  if (!tree || !currentFolderId || !currentFolder) return null;

  const style = {
    "--speed-dial-icon-size": `${data.tileSize}px`,
  } as CSSProperties;

  return (
    <section
      className={`SpeedDial SpeedDial--${data.density}`}
      style={style}
      aria-busy={loading || fetchingFavicons}
    >
      <header className="SpeedDial__header">
        {activePath.length > 1 ? (
          <button
            type="button"
            className="SpeedDial__back"
            onClick={() => setPath(activePath.slice(0, -1))}
            onDragOver={(event) =>
              draggedIdRef.current && event.preventDefault()
            }
            onDrop={(event) => {
              event.preventDefault();
              const parentId = activePath.at(-2);
              const activeDraggedId = draggedIdRef.current;
              if (activeDraggedId && parentId) {
                saveMove(activeDraggedId, parentId);
              }
              updateDraggedId();
            }}
          >
            {intl.formatMessage(messages.back)}
          </button>
        ) : (
          <span />
        )}
        <strong>{titleFor(currentFolder)}</strong>
        <span className="SpeedDial__header-actions">
          {faviconSettings.consent === "enabled" &&
            faviconTargetList.length > 0 && (
              <button
                type="button"
                className="SpeedDial__refresh"
                aria-label={intl.formatMessage(messages.refreshFavicons)}
                title={intl.formatMessage(messages.refreshFavicons)}
                disabled={fetchingFavicons}
                onClick={() => void handleFaviconRefresh()}
              >
                ↻
              </button>
            )}
          {(loading || fetchingFavicons) && (
            <span className="SpeedDial__loading" aria-hidden="true" />
          )}
        </span>
      </header>

      {(faviconPermissionError || faviconError) && (
        <p className="SpeedDial__inline-error" role="status">
          {faviconPermissionError
            ? intl.formatMessage(messages.faviconPermissionError)
            : faviconError?.message}
        </p>
      )}

      <div
        className="SpeedDial__grid"
        onDragOver={(event) => draggedIdRef.current && event.preventDefault()}
        onDrop={handleGridDrop}
      >
        {items.map((item) => {
          const folder = isFolder(item);
          const title = titleFor(item);
          const label = truncate(title, data.maxLabelLength);
          const target =
            dropTarget?.itemId === item.id ? dropTarget.mode : null;
          const faviconUrl = iconUrls.get(item.id);

          return (
            <div
              key={item.id}
              className={`SpeedDial__tile${draggedId === item.id ? " is-dragging" : ""}${target ? ` is-drop-${target}` : ""}`}
              draggable
              onDragStart={(event) => handleDragStart(event, item.id)}
              onDragEnd={() => {
                updateDraggedId();
                setDropTarget(undefined);
              }}
              onDragOver={(event) => handleTileDragOver(event, item)}
              onDrop={(event) => handleTileDrop(event, item)}
            >
              {folder ? (
                <button
                  type="button"
                  className="SpeedDial__link"
                  aria-label={intl.formatMessage(messages.folder, {
                    name: title,
                  })}
                  onClick={() => setPath([...activePath, item.id])}
                >
                  <span className="SpeedDial__icon SpeedDial__folder" />
                  {data.showLabels && (
                    <span className="SpeedDial__label" title={title}>
                      {label}
                    </span>
                  )}
                </button>
              ) : (
                <a className="SpeedDial__link" href={item.url}>
                  <BookmarkIcon
                    key={faviconUrl ?? "fallback"}
                    bookmarkId={item.id}
                    faviconUrl={faviconUrl}
                    title={title}
                  />
                  {data.showLabels && (
                    <span className="SpeedDial__label" title={title}>
                      {label}
                    </span>
                  )}
                </a>
              )}
            </div>
          );
        })}
      </div>

      {items.length === 0 && (
        <p className="SpeedDial__empty">
          <FormattedMessage {...messages.empty} />
        </p>
      )}

      {faviconSettings.consent === "ask" && faviconTargetList.length > 0 && (
        <FaviconConsent
          nodes={bookmarkNodes}
          settings={faviconSettings}
          onChange={(favicons) => setData({ ...data, favicons })}
        />
      )}
    </section>
  );
};

export default SpeedDial;
