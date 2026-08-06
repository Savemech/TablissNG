import { type FC, useMemo } from "react";
import { defineMessages, FormattedMessage } from "react-intl";

import { type BookmarkNode, emptyLayout } from "./layout";
import { defaultData, type Density, type Props } from "./types";
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

const SpeedDialSettings: FC<Props> = ({ data = defaultData, setData }) => {
  const { permission, requestPermission, tree } = useBookmarks(null);
  const folders = useMemo(() => folderOptions(tree), [tree]);

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
            value={data.rootBookmarkId ?? ""}
            onChange={(event) =>
              setData({
                ...data,
                rootBookmarkId: event.target.value || null,
                layout: emptyLayout(),
              })
            }
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

      <button
        type="button"
        onClick={() => setData({ ...data, layout: emptyLayout() })}
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
