import { type FC, useMemo, useState } from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import { faviconTargets, requestFaviconPermissions } from "./faviconPolicy";
import type { BookmarkNode } from "./layout";
import type { FaviconSettings } from "./types";

const messages = defineMessages({
  permissionError: {
    id: "plugins.speedDial.favicons.permissionError",
    defaultMessage:
      "Icon access was not granted. You can keep the initials and enable icons later in settings.",
    description: "Favicon host permission denial message",
  },
});

type Props = {
  nodes: readonly BookmarkNode[];
  settings: FaviconSettings;
  onChange: (settings: FaviconSettings) => void;
};

const FaviconConsent: FC<Props> = ({ nodes, onChange, settings }) => {
  const intl = useIntl();
  const [draft, setDraft] = useState(settings);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const targets = useMemo(() => faviconTargets(nodes, draft), [draft, nodes]);

  const enable = async () => {
    setWorking(true);
    setError(undefined);
    try {
      const granted = await requestFaviconPermissions(targets, draft.source);
      if (!granted) {
        setError(intl.formatMessage(messages.permissionError));
        return;
      }
      onChange({ ...draft, consent: "enabled" });
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

  return (
    <div className="SpeedDial__consent-backdrop">
      <section
        className="SpeedDial__consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby="speed-dial-favicon-consent-title"
      >
        <h3 id="speed-dial-favicon-consent-title">
          <FormattedMessage
            id="plugins.speedDial.favicons.consent.title"
            defaultMessage="Fetch icons for {count, plural, one {# bookmark} other {# bookmarks}}?"
            description="Favicon consent dialog title"
            values={{ count: targets.length }}
          />
        </h3>
        <p>
          <FormattedMessage
            id="plugins.speedDial.favicons.consent.description"
            defaultMessage="Tiles already work with local initials. Icons are optional, cached only on this device, and never block the grid."
            description="Favicon consent dialog privacy description"
          />
        </p>

        <label>
          <FormattedMessage
            id="plugins.speedDial.favicons.source"
            defaultMessage="Icon source"
            description="Favicon source setting"
          />
          <select
            value={draft.source}
            onChange={(event) =>
              setDraft({
                ...draft,
                source: event.target.value as FaviconSettings["source"],
              })
            }
          >
            <option value="direct">
              {intl.formatMessage({
                id: "plugins.speedDial.favicons.source.direct",
                defaultMessage: "Fetch directly from each site",
                description: "Direct favicon source option",
              })}
            </option>
            <option value="duckduckgo">
              {intl.formatMessage({
                id: "plugins.speedDial.favicons.source.duckduckgo",
                defaultMessage: "DuckDuckGo icon service",
                description: "DuckDuckGo favicon source option",
              })}
            </option>
            <option value="google">
              {intl.formatMessage({
                id: "plugins.speedDial.favicons.source.google",
                defaultMessage: "Google favicon service",
                description: "Google favicon source option",
              })}
            </option>
          </select>
        </label>

        {draft.source === "direct" && (
          <label>
            <input
              type="checkbox"
              checked={draft.includeLocal}
              onChange={(event) =>
                setDraft({ ...draft, includeLocal: event.target.checked })
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
            values={{ count: draft.concurrency }}
          />
          <input
            type="range"
            min="1"
            max="8"
            value={draft.concurrency}
            onChange={(event) =>
              setDraft({ ...draft, concurrency: Number(event.target.value) })
            }
          />
        </label>

        {draft.source !== "direct" && (
          <p className="SpeedDial__consent-note">
            <FormattedMessage
              id="plugins.speedDial.favicons.providerPrivacy"
              defaultMessage="The selected provider receives public site hostnames. Local addresses are always excluded."
              description="Third-party favicon provider privacy notice"
            />
          </p>
        )}

        {error && <p className="SpeedDial__consent-error">{error}</p>}
        <div className="SpeedDial__consent-actions">
          <button
            type="button"
            onClick={() => onChange({ ...draft, consent: "disabled" })}
          >
            <FormattedMessage
              id="plugins.speedDial.favicons.notNow"
              defaultMessage="Not now"
              description="Decline favicon fetching button"
            />
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void enable()}
          >
            <FormattedMessage
              id="plugins.speedDial.favicons.enable"
              defaultMessage="Allow and fetch icons"
              description="Enable favicon fetching button"
            />
          </button>
        </div>
      </section>
    </div>
  );
};

export default FaviconConsent;
