import { type FC, useEffect, useRef, useState } from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import { deleteCalendarFeedCache } from "../../../extension/calendar/cacheStore";
import { listGoogleCalendars } from "../../../extension/calendar/googleApi";
import {
  compiledGoogleClientId,
  configuredGoogleClientId,
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  GOOGLE_CALENDAR_PERMISSION_ORIGINS,
  googleOAuthRedirectUrl,
} from "../../../extension/calendar/googleAuth";
import type {
  GoogleCalendarFeed,
  GoogleCalendarInfo,
} from "../../../extension/calendar/types";
import {
  type BackgroundResponse,
  REFRESH_CALENDAR_FEED,
} from "../../../extension/messages";
import { updateGoogleCalendarSelection } from "./googleFeedModel";

const messages = defineMessages({
  clientRequired: {
    id: "plugins.agenda.settings.googleClientRequired",
    defaultMessage: "Enter a Google OAuth client ID first.",
    description: "Missing Google OAuth client ID error",
  },
  permissionError: {
    id: "plugins.agenda.settings.googlePermissionError",
    defaultMessage: "Google API access was not granted.",
    description: "Google Calendar host permission denial",
  },
  connectError: {
    id: "plugins.agenda.settings.googleConnectError",
    defaultMessage: "Could not connect to Google Calendar.",
    description: "Google Calendar connection failure",
  },
  refreshError: {
    id: "plugins.agenda.settings.googleRefreshError",
    defaultMessage: "The calendar was selected, but its first refresh failed.",
    description: "Google Calendar initial refresh failure",
  },
  saveError: {
    id: "plugins.agenda.settings.googleSaveError",
    defaultMessage: "Could not save the Google Calendar selection.",
    description: "Google Calendar selection storage failure",
  },
  disconnectError: {
    id: "plugins.agenda.settings.googleDisconnectError",
    defaultMessage: "The local calendars were removed, but sign-out failed.",
    description: "Google Calendar disconnection failure",
  },
  clientPlaceholder: {
    id: "plugins.agenda.settings.googleClientPlaceholder",
    defaultMessage: "000000000000-example.apps.googleusercontent.com",
    description: "Example Google OAuth client ID placeholder",
  },
});

type Props = {
  feeds: GoogleCalendarFeed[];
  canAdd: boolean;
  onSave: (feeds: GoogleCalendarFeed[]) => Promise<boolean>;
};

function calendarFeedId(): string {
  return [...crypto.getRandomValues(new Uint32Array(2))]
    .map((value) => value.toString(36))
    .join("");
}

function safeError(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

async function requestGooglePermissions(): Promise<boolean> {
  return browser.permissions.request({
    origins: [...GOOGLE_CALENDAR_PERMISSION_ORIGINS],
  });
}

const GoogleCalendarSettings: FC<Props> = ({ feeds, canAdd, onSave }) => {
  const intl = useIntl();
  const builtInClientId = compiledGoogleClientId();
  const restoredRef = useRef(false);
  const [clientId, setClientId] = useState(builtInClientId);
  const [calendars, setCalendars] = useState<GoogleCalendarInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [workingId, setWorkingId] = useState<string>();
  const [error, setError] = useState<string>();
  const [redirectUrl] = useState(() =>
    BUILD_TARGET === "web" || BUILD_TARGET === "safari"
      ? ""
      : googleOAuthRedirectUrl(),
  );
  const hasGoogleFeeds = feeds.length > 0;

  useEffect(() => {
    let active = true;
    void configuredGoogleClientId().then((configured) => {
      if (active && configured) setClientId(configured);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasGoogleFeeds || restoredRef.current) return;
    restoredRef.current = true;
    let active = true;
    const restore = async () => {
      const permitted = await browser.permissions.contains({
        origins: [...GOOGLE_CALENDAR_PERMISSION_ORIGINS],
      });
      if (!permitted) return;
      try {
        const available = await listGoogleCalendars();
        if (active) {
          setCalendars(available);
          setConnected(true);
        }
      } catch {
        // Existing cached agenda remains useful until the user reconnects.
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [hasGoogleFeeds]);

  const connect = async () => {
    const normalizedClientId = clientId.trim();
    if (!normalizedClientId) {
      setError(intl.formatMessage(messages.clientRequired));
      return;
    }
    setWorkingId("connect");
    setError(undefined);
    try {
      if (!(await requestGooglePermissions())) {
        setError(intl.formatMessage(messages.permissionError));
        return;
      }
      await connectGoogleCalendar(normalizedClientId);
      setCalendars(await listGoogleCalendars());
      setConnected(true);
    } catch (cause) {
      setError(safeError(cause, intl.formatMessage(messages.connectError)));
    } finally {
      setWorkingId(undefined);
    }
  };

  const toggleCalendar = async (
    calendar: GoogleCalendarInfo,
    selected: boolean,
  ) => {
    setWorkingId(calendar.id);
    setError(undefined);
    const existing = feeds.find(({ calendarId }) => calendarId === calendar.id);
    const nextFeeds = updateGoogleCalendarSelection(
      feeds,
      calendar,
      selected,
      calendarFeedId,
    );
    try {
      if (!(await onSave(nextFeeds))) {
        setError(intl.formatMessage(messages.saveError));
        return;
      }
      if (!selected && existing) {
        await deleteCalendarFeedCache(existing.id);
        return;
      }
      const added = nextFeeds.find(
        ({ calendarId }) => calendarId === calendar.id,
      );
      if (!added) return;
      const response = (await browser.runtime.sendMessage({
        type: REFRESH_CALENDAR_FEED,
        feedId: added.id,
        force: true,
      })) as BackgroundResponse;
      if (!response?.ok) {
        setError(response?.error ?? intl.formatMessage(messages.refreshError));
      }
    } catch (cause) {
      setError(safeError(cause, intl.formatMessage(messages.refreshError)));
    } finally {
      setWorkingId(undefined);
    }
  };

  const disconnect = async () => {
    setWorkingId("disconnect");
    setError(undefined);
    const removedFeeds = [...feeds];
    try {
      if (!(await onSave([]))) {
        setError(intl.formatMessage(messages.saveError));
        return;
      }
      await Promise.all(
        removedFeeds.map(({ id }) => deleteCalendarFeedCache(id)),
      );
      await disconnectGoogleCalendar();
      setCalendars([]);
      setConnected(false);
    } catch (cause) {
      setError(safeError(cause, intl.formatMessage(messages.disconnectError)));
    } finally {
      setWorkingId(undefined);
    }
  };

  if (BUILD_TARGET === "web" || BUILD_TARGET === "safari") {
    return (
      <section className="AgendaSettings__google">
        <h6>
          <FormattedMessage
            id="plugins.agenda.settings.google"
            defaultMessage="Google Calendar"
            description="Google Calendar settings heading"
          />
        </h6>
        <p className="info">
          <FormattedMessage
            id="plugins.agenda.settings.googleExtensionOnly"
            defaultMessage="Direct Google connection is available in the Chrome and Firefox extensions. Public Google calendars can still be added as iCal."
            description="Google Calendar extension-only explanation"
          />
        </p>
      </section>
    );
  }

  return (
    <section className="AgendaSettings__google">
      <h6>
        <FormattedMessage
          id="plugins.agenda.settings.google"
          defaultMessage="Google Calendar"
          description="Google Calendar settings heading"
        />
      </h6>
      <p className="info">
        <FormattedMessage
          id="plugins.agenda.settings.googlePrivacy"
          defaultMessage="Read-only access only. OAuth tokens, calendar IDs and cached events stay in local extension storage and are never synced."
          description="Google Calendar privacy explanation"
        />
      </p>

      {builtInClientId ? (
        <p className="AgendaSettings__google-configured">
          <FormattedMessage
            id="plugins.agenda.settings.googleBuiltInClient"
            defaultMessage="This build includes a Google OAuth client for one-click sign-in."
            description="Built-in Google OAuth client explanation"
          />
        </p>
      ) : (
        <>
          <p className="info">
            {BUILD_TARGET === "firefox" ? (
              <FormattedMessage
                id="plugins.agenda.settings.googleFirefoxSetup"
                defaultMessage="Create a Desktop app OAuth client in Google Cloud, then paste its client ID below."
                description="Firefox Google OAuth setup instructions"
              />
            ) : (
              <FormattedMessage
                id="plugins.agenda.settings.googleChromiumSetup"
                defaultMessage="Create a Web application OAuth client in Google Cloud and register the redirect URL shown below."
                description="Chromium custom Google OAuth setup instructions"
              />
            )}
          </p>
          <label>
            <FormattedMessage
              id="plugins.agenda.settings.googleClientId"
              defaultMessage="Google OAuth client ID"
              description="Google OAuth client ID field"
            />
            <input
              type="text"
              autoComplete="off"
              spellCheck="false"
              value={clientId}
              placeholder={intl.formatMessage(messages.clientPlaceholder)}
              onChange={(event) => setClientId(event.target.value)}
            />
          </label>
          <label>
            <FormattedMessage
              id="plugins.agenda.settings.googleRedirect"
              defaultMessage="OAuth redirect URL"
              description="Google OAuth redirect URL field"
            />
            <input
              className="AgendaSettings__redirect"
              type="text"
              readOnly
              value={redirectUrl}
              onFocus={(event) => event.target.select()}
            />
          </label>
        </>
      )}

      <div className="AgendaSettings__google-actions">
        <button
          type="button"
          disabled={Boolean(workingId) || !clientId.trim()}
          onClick={() => void connect()}
        >
          {connected ? (
            <FormattedMessage
              id="plugins.agenda.settings.googleReload"
              defaultMessage="Reload calendar list"
              description="Reload Google Calendar list button"
            />
          ) : (
            <FormattedMessage
              id="plugins.agenda.settings.googleConnect"
              defaultMessage="Connect read-only"
              description="Connect Google Calendar button"
            />
          )}
        </button>
        {(connected || hasGoogleFeeds) && (
          <button
            type="button"
            disabled={Boolean(workingId)}
            onClick={() => void disconnect()}
          >
            <FormattedMessage
              id="plugins.agenda.settings.googleDisconnect"
              defaultMessage="Disconnect and remove"
              description="Disconnect Google Calendar button"
            />
          </button>
        )}
      </div>

      {calendars.length > 0 && (
        <fieldset className="AgendaSettings__google-calendars">
          <legend>
            <FormattedMessage
              id="plugins.agenda.settings.googleChoose"
              defaultMessage="Calendars to show"
              description="Google Calendar selection legend"
            />
          </legend>
          {calendars.map((calendar) => {
            const selected = feeds.some(
              ({ calendarId }) => calendarId === calendar.id,
            );
            return (
              <label key={calendar.id}>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={Boolean(workingId) || (!selected && !canAdd)}
                  onChange={(event) =>
                    void toggleCalendar(calendar, event.target.checked)
                  }
                />
                <span
                  className="AgendaSettings__google-colour"
                  style={{ backgroundColor: calendar.colour }}
                  aria-hidden="true"
                />
                <span>{calendar.name}</span>
                {calendar.primary && (
                  <small>
                    <FormattedMessage
                      id="plugins.agenda.settings.googlePrimary"
                      defaultMessage="Primary"
                      description="Primary Google Calendar label"
                    />
                  </small>
                )}
              </label>
            );
          })}
        </fieldset>
      )}

      {error && (
        <p className="AgendaSettings__error" role="status">
          {error}
        </p>
      )}
    </section>
  );
};

export default GoogleCalendarSettings;
