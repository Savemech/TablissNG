import { type FC, type FormEvent, useEffect, useId, useState } from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import type { FaviconRecord } from "../../../extension/favicon/types";
import type { BackgroundResponse } from "../../../extension/messages";
import {
  type FaviconTarget,
  requestFaviconPermissions,
  requestManualIconPermission,
} from "./faviconPolicy";
import type { FaviconSettings } from "./types";

const messages = defineMessages({
  permissionError: {
    id: "plugins.speedDial.faviconEditor.permissionError",
    defaultMessage: "Access to that icon host was not granted.",
    description: "Manual favicon URL permission denial",
  },
  invalidUrl: {
    id: "plugins.speedDial.faviconEditor.invalidUrl",
    defaultMessage: "Enter a valid HTTP(S) image URL.",
    description: "Invalid manual favicon URL error",
  },
  resetError: {
    id: "plugins.speedDial.faviconEditor.resetError",
    defaultMessage: "Could not restore the automatic icon.",
    description: "Automatic favicon reset failure",
  },
});

type Props = {
  title: string;
  target: FaviconTarget;
  automaticTarget?: FaviconTarget;
  settings: FaviconSettings;
  iconUrl?: string;
  record?: FaviconRecord;
  onClose: () => void;
  onManualUrl: (
    target: FaviconTarget,
    iconUrl: string,
  ) => Promise<BackgroundResponse>;
  onUpload: (target: FaviconTarget, file: File) => Promise<void>;
  onRemove: (bookmarkId: string) => Promise<void>;
  onRefreshAutomatic: (target: FaviconTarget) => Promise<BackgroundResponse>;
};

const FaviconEditor: FC<Props> = ({
  automaticTarget,
  iconUrl,
  onClose,
  onManualUrl,
  onRefreshAutomatic,
  onRemove,
  onUpload,
  record,
  settings,
  target,
  title,
}) => {
  const intl = useIntl();
  const titleId = useId();
  const [manualUrl, setManualUrl] = useState(
    record?.source === "manual-url" ? (record.sourceUrl ?? "") : "",
  );
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !working) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, working]);

  const saveManualUrl = async (event: FormEvent) => {
    event.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(manualUrl);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      setError(intl.formatMessage(messages.invalidUrl));
      return;
    }

    setWorking(true);
    setError(undefined);
    try {
      const granted = await requestManualIconPermission(parsed.href);
      if (!granted) {
        setError(intl.formatMessage(messages.permissionError));
        return;
      }
      const response = await onManualUrl(target, parsed.href);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : intl.formatMessage(messages.permissionError),
      );
    } finally {
      setWorking(false);
    }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    setWorking(true);
    setError(undefined);
    try {
      await onUpload(target, file);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not store the icon",
      );
    } finally {
      setWorking(false);
    }
  };

  const reset = async () => {
    setWorking(true);
    setError(undefined);
    try {
      if (automaticTarget && settings.consent === "enabled") {
        const granted = await requestFaviconPermissions(
          [automaticTarget],
          settings.source,
        );
        if (!granted) {
          setError(intl.formatMessage(messages.permissionError));
          return;
        }
      }

      await onRemove(target.bookmarkId);
      if (automaticTarget && settings.consent === "enabled") {
        const response = await onRefreshAutomatic(automaticTarget);
        if (!response.ok) {
          setError(response.error || intl.formatMessage(messages.resetError));
          return;
        }
      }
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : intl.formatMessage(messages.resetError),
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <div
      className="SpeedDial__consent-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !working) onClose();
      }}
    >
      <section
        className="SpeedDial__consent SpeedDial__icon-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h3 id={titleId}>
          <FormattedMessage
            id="plugins.speedDial.faviconEditor.title"
            defaultMessage="Icon for {title}"
            description="Manual tile icon editor title"
            values={{ title }}
          />
        </h3>

        {iconUrl && (
          <img className="SpeedDial__editor-preview" src={iconUrl} alt="" />
        )}

        <form onSubmit={(event) => void saveManualUrl(event)}>
          <label>
            <FormattedMessage
              id="plugins.speedDial.faviconEditor.url"
              defaultMessage="Image URL"
              description="Manual favicon image URL input"
            />
            <input
              type="url"
              required
              disabled={working}
              value={manualUrl}
              placeholder="https://example.com/icon.png"
              onChange={(event) => setManualUrl(event.target.value)}
            />
          </label>
          <button type="submit" disabled={working || !manualUrl}>
            <FormattedMessage
              id="plugins.speedDial.faviconEditor.fetch"
              defaultMessage="Fetch this image"
              description="Fetch manual favicon URL button"
            />
          </button>
        </form>

        <label className="SpeedDial__editor-upload">
          <FormattedMessage
            id="plugins.speedDial.faviconEditor.upload"
            defaultMessage="Or upload an image (up to 512 KiB)"
            description="Manual favicon upload label"
          />
          <input
            type="file"
            accept="image/*,.ico"
            disabled={working}
            onChange={(event) => void upload(event.target.files?.[0])}
          />
        </label>

        {error && (
          <p className="SpeedDial__consent-error" role="status">
            {error}
          </p>
        )}

        <div className="SpeedDial__consent-actions">
          {record && (
            <button
              type="button"
              disabled={working}
              onClick={() => void reset()}
            >
              <FormattedMessage
                id="plugins.speedDial.faviconEditor.reset"
                defaultMessage="Reset icon"
                description="Remove manual or cached favicon button"
              />
            </button>
          )}
          <button type="button" disabled={working} onClick={onClose}>
            <FormattedMessage
              id="plugins.speedDial.faviconEditor.close"
              defaultMessage="Close"
              description="Close manual favicon editor button"
            />
          </button>
        </div>
      </section>
    </div>
  );
};

export default FaviconEditor;
