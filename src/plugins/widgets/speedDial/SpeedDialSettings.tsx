import "./SpeedDialSettings.sass";

import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import {
  clearGeneratedFavicons,
  getFaviconStoreStats,
} from "../../../extension/favicon/store";
import type { FaviconStoreStats } from "../../../extension/favicon/types";
import { faviconTargets, requestFaviconPermissions } from "./faviconPolicy";
import { type BookmarkNode, emptyLayout, indexBookmarks } from "./layout";
import {
  createPortableFolderSelector,
  resolvePortableFolder,
} from "./portableFolder";
import { emptyPortableLayout } from "./portableLayout";
import {
  defaultData,
  type Density,
  type FaviconSettings,
  type Props,
} from "./types";
import { useBookmarks } from "./useBookmarks";

const messages = defineMessages({
  permission: {
    id: "plugins.speedDial.settings.permission",
    defaultMessage: "Allow bookmark access to choose a folder.",
    description: "Speed Dial settings bookmark permission explanation",
  },
  allow: {
    id: "plugins.speedDial.settings.allow",
    defaultMessage: "Allow bookmark access",
    description: "Speed Dial settings bookmark permission button",
  },
  faviconPermissionError: {
    id: "plugins.speedDial.settings.favicons.permissionError",
    defaultMessage: "Icon access was not granted.",
    description: "Favicon permission failure in Speed Dial settings",
  },
  faviconStorageError: {
    id: "plugins.speedDial.settings.favicons.storageError",
    defaultMessage: "Could not update the local icon cache.",
    description: "Favicon cache failure in Speed Dial settings",
  },
});

type FolderOption = { id: string; label: string; depth: number };

function folderOptions(root?: BookmarkNode): FolderOption[] {
  if (!root) return [];
  const options: FolderOption[] = [];
  const visit = (node: BookmarkNode, depth: number) => {
    for (const child of node.children ?? []) {
      if (child.type === "separator" || child.url) continue;
      options.push({ id: child.id, label: child.title || child.id, depth });
      visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return options;
}

function folderOptionLabel(folder: FolderOption): string {
  return `${"\u00a0".repeat(folder.depth * 3)}${folder.label}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

const SpeedDialSettings: FC<Props> = ({ data = defaultData, setData }) => {
  const intl = useIntl();
  const { permission, requestPermission, tree } = useBookmarks(null);
  const faviconSettings = data.favicons ?? defaultData.favicons;
  const [faviconStats, setFaviconStats] = useState<FaviconStoreStats>();
  const [faviconWorking, setFaviconWorking] = useState(false);
  const [faviconError, setFaviconError] = useState<string>();
  const folders = useMemo(() => folderOptions(tree), [tree]);
  const selectedRoot = useMemo(() => {
    if (!tree || !data.rootBookmarkId) return tree;
    if (data.rootBookmarkSelector) {
      return resolvePortableFolder(tree, data.rootBookmarkSelector);
    }
    return indexBookmarks(tree).nodes.get(data.rootBookmarkId);
  }, [data.rootBookmarkId, data.rootBookmarkSelector, tree]);
  const selectedRootId = data.rootBookmarkId ? (selectedRoot?.id ?? "") : "";
  const faviconNodes = useMemo(() => {
    return selectedRoot ? [...indexBookmarks(selectedRoot).nodes.values()] : [];
  }, [selectedRoot]);
  const targets = useMemo(
    () => faviconTargets(faviconNodes, faviconSettings),
    [faviconNodes, faviconSettings.includeLocal, faviconSettings.source],
  );

  const updateFaviconStats = useCallback(async () => {
    try {
      setFaviconStats(await getFaviconStoreStats());
    } catch {
      setFaviconError(intl.formatMessage(messages.faviconStorageError));
    }
  }, [intl]);

  useEffect(() => {
    void updateFaviconStats();
  }, [updateFaviconStats]);

  const setFavicons = (favicons: FaviconSettings) => {
    setData({ ...data, favicons });
  };

  const updatePermissionSensitiveSetting = (
    patch: Partial<FaviconSettings>,
  ) => {
    setFavicons({
      ...faviconSettings,
      ...patch,
      consent:
        faviconSettings.consent === "enabled" ? "ask" : faviconSettings.consent,
    });
  };

  const enableFavicons = async () => {
    setFaviconWorking(true);
    setFaviconError(undefined);
    try {
      const granted = await requestFaviconPermissions(
        targets,
        faviconSettings.source,
      );
      if (!granted) {
        setFaviconError(intl.formatMessage(messages.faviconPermissionError));
        return;
      }
      setFavicons({ ...faviconSettings, consent: "enabled" });
    } catch (cause) {
      setFaviconError(
        cause instanceof Error
          ? cause.message
          : intl.formatMessage(messages.faviconPermissionError),
      );
    } finally {
      setFaviconWorking(false);
    }
  };

  const clearFaviconCache = async () => {
    setFaviconWorking(true);
    setFaviconError(undefined);
    try {
      await clearGeneratedFavicons();
      await updateFaviconStats();
    } catch {
      setFaviconError(intl.formatMessage(messages.faviconStorageError));
    } finally {
      setFaviconWorking(false);
    }
  };

  return (
    <div className="SpeedDialSettings">
      {permission === "denied" ? (
        <label>
          <FormattedMessage {...messages.permission} />
          <button type="button" onClick={() => void requestPermission()}>
            <FormattedMessage {...messages.allow} />
          </button>
        </label>
      ) : (
        <label>
          <FormattedMessage
            id="plugins.speedDial.settings.rootFolder"
            defaultMessage="Root bookmark folder"
            description="Speed Dial root bookmark folder setting"
          />
          <select
            value={selectedRootId}
            onChange={(event) => {
              const rootBookmarkId = event.target.value || null;
              setData({
                ...data,
                rootBookmarkId,
                rootBookmarkSelector:
                  tree && rootBookmarkId
                    ? (createPortableFolderSelector(tree, rootBookmarkId) ??
                      null)
                    : null,
                layout: emptyLayout(),
                portableLayout: emptyPortableLayout(),
              });
            }}
          >
            <option value="">
              <FormattedMessage
                id="plugins.speedDial.settings.allBookmarks"
                defaultMessage="All bookmarks"
                description="Option to show the complete bookmark tree"
              />
            </option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folderOptionLabel(folder)}
              </option>
            ))}
          </select>
        </label>
      )}

      <label>
        <FormattedMessage
          id="plugins.speedDial.settings.tileSize"
          defaultMessage="Tile icon size: {size}px"
          description="Speed Dial tile icon size setting"
          values={{ size: data.tileSize }}
        />
        <input
          type="range"
          min="32"
          max="128"
          step="8"
          value={data.tileSize}
          onChange={(event) =>
            setData({ ...data, tileSize: Number(event.target.value) })
          }
        />
      </label>

      <label>
        <FormattedMessage
          id="plugins.speedDial.settings.density"
          defaultMessage="Grid density"
          description="Speed Dial density setting"
        />
        <select
          value={data.density}
          onChange={(event) =>
            setData({ ...data, density: event.target.value as Density })
          }
        >
          <option value="compact">
            <FormattedMessage
              id="plugins.speedDial.settings.density.compact"
              defaultMessage="Compact"
              description="Compact Speed Dial density"
            />
          </option>
          <option value="comfortable">
            <FormattedMessage
              id="plugins.speedDial.settings.density.comfortable"
              defaultMessage="Comfortable"
              description="Comfortable Speed Dial density"
            />
          </option>
          <option value="spacious">
            <FormattedMessage
              id="plugins.speedDial.settings.density.spacious"
              defaultMessage="Spacious"
              description="Spacious Speed Dial density"
            />
          </option>
        </select>
      </label>

      <label>
        <input
          type="checkbox"
          checked={data.showLabels}
          onChange={(event) =>
            setData({ ...data, showLabels: event.target.checked })
          }
        />
        <FormattedMessage
          id="plugins.speedDial.settings.showLabels"
          defaultMessage="Show tile labels"
          description="Toggle Speed Dial tile labels"
        />
      </label>

      {data.showLabels && (
        <label>
          <FormattedMessage
            id="plugins.speedDial.settings.labelLength"
            defaultMessage="Maximum label length (0 for no limit)"
            description="Speed Dial maximum label length setting"
          />
          <input
            type="number"
            min="0"
            max="100"
            value={data.maxLabelLength}
            onChange={(event) =>
              setData({ ...data, maxLabelLength: Number(event.target.value) })
            }
          />
        </label>
      )}

      <fieldset className="SpeedDialSettings__section">
        <legend>
          <FormattedMessage
            id="plugins.speedDial.settings.favicons.title"
            defaultMessage="Tile icons"
            description="Speed Dial favicon settings title"
          />
        </legend>

        <label>
          <FormattedMessage
            id="plugins.speedDial.favicons.source"
            defaultMessage="Icon source"
            description="Favicon source setting"
          />
          <select
            value={faviconSettings.source}
            onChange={(event) =>
              updatePermissionSensitiveSetting({
                source: event.target.value as FaviconSettings["source"],
              })
            }
          >
            <option value="direct">
              <FormattedMessage
                id="plugins.speedDial.favicons.source.direct"
                defaultMessage="Fetch directly from each site"
                description="Direct favicon source option"
              />
            </option>
            <option value="duckduckgo">
              <FormattedMessage
                id="plugins.speedDial.favicons.source.duckduckgo"
                defaultMessage="DuckDuckGo icon service"
                description="DuckDuckGo favicon source option"
              />
            </option>
            <option value="google">
              <FormattedMessage
                id="plugins.speedDial.favicons.source.google"
                defaultMessage="Google favicon service"
                description="Google favicon source option"
              />
            </option>
          </select>
        </label>

        {faviconSettings.source === "direct" && (
          <label>
            <input
              type="checkbox"
              checked={faviconSettings.includeLocal}
              onChange={(event) =>
                updatePermissionSensitiveSetting({
                  includeLocal: event.target.checked,
                })
              }
            />
            <FormattedMessage
              id="plugins.speedDial.favicons.includeLocal"
              defaultMessage="Include local and homelab addresses"
              description="Toggle direct favicon fetching for local addresses"
            />
          </label>
        )}

        <label>
          <FormattedMessage
            id="plugins.speedDial.favicons.concurrency"
            defaultMessage="Parallel requests: {count}"
            description="Favicon concurrency setting"
            values={{ count: faviconSettings.concurrency }}
          />
          <input
            type="range"
            min="1"
            max="8"
            value={faviconSettings.concurrency}
            onChange={(event) =>
              setFavicons({
                ...faviconSettings,
                concurrency: Number(event.target.value),
              })
            }
          />
        </label>

        <label>
          <FormattedMessage
            id="plugins.speedDial.settings.favicons.ttl"
            defaultMessage="Refresh automatically after {days} days"
            description="Favicon cache TTL setting"
            values={{ days: faviconSettings.ttlDays }}
          />
          <input
            type="range"
            min="1"
            max="90"
            value={faviconSettings.ttlDays}
            onChange={(event) =>
              setFavicons({
                ...faviconSettings,
                ttlDays: Number(event.target.value),
              })
            }
          />
        </label>

        {faviconStats && (
          <p className="info">
            <FormattedMessage
              id="plugins.speedDial.settings.favicons.cacheStats"
              defaultMessage="Local cache: {ready} icons, {size}"
              description="Favicon local cache statistics"
              values={{
                ready: faviconStats.ready,
                size: formatBytes(faviconStats.bytes),
              }}
            />
          </p>
        )}

        {faviconError && (
          <p className="SpeedDialSettings__error" role="status">
            {faviconError}
          </p>
        )}

        <div className="SpeedDialSettings__actions">
          {faviconSettings.consent === "enabled" ? (
            <button
              type="button"
              disabled={faviconWorking}
              onClick={() =>
                setFavicons({ ...faviconSettings, consent: "disabled" })
              }
            >
              <FormattedMessage
                id="plugins.speedDial.settings.favicons.disable"
                defaultMessage="Disable automatic fetching"
                description="Disable automatic favicon fetching button"
              />
            </button>
          ) : (
            <button
              type="button"
              disabled={faviconWorking || permission !== "granted"}
              onClick={() => void enableFavicons()}
            >
              <FormattedMessage
                id="plugins.speedDial.settings.favicons.enable"
                defaultMessage="Allow automatic icons"
                description="Enable automatic favicon fetching button"
              />
            </button>
          )}
          <button
            type="button"
            disabled={faviconWorking}
            onClick={() => void clearFaviconCache()}
          >
            <FormattedMessage
              id="plugins.speedDial.settings.favicons.clear"
              defaultMessage="Clear downloaded icons"
              description="Clear generated favicon cache button"
            />
          </button>
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() =>
          setData({
            ...data,
            layout: emptyLayout(),
            portableLayout: emptyPortableLayout(),
          })
        }
      >
        <FormattedMessage
          id="plugins.speedDial.settings.resetOrder"
          defaultMessage="Reset tile order"
          description="Reset Speed Dial layout overlay button"
        />
      </button>
    </div>
  );
};

export default SpeedDialSettings;
