import "./AgendaSettings.sass";

import {
  type FC,
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";
import type Browser from "webextension-polyfill";

import { deleteCalendarFeedCache } from "../../../extension/calendar/cacheStore";
import {
  CALENDAR_FEEDS_STORAGE_KEY,
  getCalendarFeeds,
  MAX_CALENDAR_FEEDS,
  setCalendarFeeds,
} from "../../../extension/calendar/feedStore";
import { GOOGLE_CALENDAR_PERMISSION_ORIGINS } from "../../../extension/calendar/googleAuth";
import type {
  CalendarFeed,
  GoogleCalendarFeed,
  ICalFeed,
} from "../../../extension/calendar/types";
import { requestOptionalPermissions } from "../../../extension/dataConsent";
import { permissionOriginForUrl } from "../../../extension/favicon/fetch";
import {
  type BackgroundResponse,
  REFRESH_ALL_CALENDARS,
  REFRESH_CALENDAR_FEED,
} from "../../../extension/messages";
import GoogleCalendarSettings from "./GoogleCalendarSettings";
import { validTimeZone } from "./model";
import { defaultData, type Props } from "./types";

const messages = defineMessages({
  invalidUrl: {
    id: "plugins.agenda.settings.invalidUrl",
    defaultMessage: "Enter a valid HTTP(S) iCal URL.",
    description: "Invalid iCal feed URL error",
  },
  permissionError: {
    id: "plugins.agenda.settings.permissionError",
    defaultMessage: "Access to that calendar host was not granted.",
    description: "iCal host permission denial",
  },
  storageError: {
    id: "plugins.agenda.settings.storageError",
    defaultMessage: "Could not save the local calendar settings.",
    description: "Calendar feed storage failure",
  },
  refreshError: {
    id: "plugins.agenda.settings.refreshError",
    defaultMessage: "Calendar refresh failed. The cached agenda is preserved.",
    description: "Calendar feed refresh failure",
  },
  timezoneError: {
    id: "plugins.agenda.settings.timezoneError",
    defaultMessage: "That IANA timezone is not recognised.",
    description: "Invalid agenda timezone error",
  },
  tooManyFeeds: {
    id: "plugins.agenda.settings.tooManyFeeds",
    defaultMessage: "Up to {count} calendar sources can be enabled.",
    description: "Maximum calendar source count error",
  },
});

function feedId(): string {
  return [...crypto.getRandomValues(new Uint32Array(2))]
    .map((value) => value.toString(36))
    .join("");
}

function hostLabel(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

async function requestFeedPermission(url: string): Promise<boolean> {
  const origin = permissionOriginForUrl(url);
  if (!origin) return false;
  return requestOptionalPermissions({ origins: [origin] }, [
    "authenticationInfo",
  ]);
}

async function requestCalendarPermission(feed: CalendarFeed): Promise<boolean> {
  if (feed.kind === "ical") return requestFeedPermission(feed.url);
  return requestOptionalPermissions(
    { origins: [...GOOGLE_CALENDAR_PERMISSION_ORIGINS] },
    ["authenticationInfo"],
  );
}

const AgendaSettings: FC<Props> = ({ data = defaultData, setData }) => {
  const intl = useIntl();
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [colour, setColour] = useState("#4f8cff");
  const [workingId, setWorkingId] = useState<string>();
  const [error, setError] = useState<string>();

  const reloadFeeds = useCallback(async () => {
    try {
      setFeeds(await getCalendarFeeds());
    } catch {
      setError(intl.formatMessage(messages.storageError));
    }
  }, [intl]);

  useEffect(() => {
    void reloadFeeds();
    const handleChange = (
      changes: Record<string, Browser.Storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && CALENDAR_FEEDS_STORAGE_KEY in changes) {
        void reloadFeeds();
      }
    };
    browser.storage.onChanged.addListener(handleChange);
    return () => browser.storage.onChanged.removeListener(handleChange);
  }, [reloadFeeds]);

  const persist = async (nextFeeds: CalendarFeed[]): Promise<boolean> => {
    if (nextFeeds.length > MAX_CALENDAR_FEEDS) {
      setError(
        intl.formatMessage(messages.tooManyFeeds, {
          count: MAX_CALENDAR_FEEDS,
        }),
      );
      return false;
    }
    try {
      await setCalendarFeeds(nextFeeds);
      setFeeds(nextFeeds);
      setError(undefined);
      return true;
    } catch {
      setError(intl.formatMessage(messages.storageError));
      return false;
    }
  };

  const refreshFeed = async (feed: CalendarFeed) => {
    setWorkingId(feed.id);
    setError(undefined);
    try {
      const granted = await requestCalendarPermission(feed);
      if (!granted) {
        setError(intl.formatMessage(messages.permissionError));
        return;
      }
      const response = (await browser.runtime.sendMessage({
        type: REFRESH_CALENDAR_FEED,
        feedId: feed.id,
        force: true,
      })) as BackgroundResponse;
      if (!response?.ok) {
        setError(response?.error ?? intl.formatMessage(messages.refreshError));
      }
    } catch {
      setError(intl.formatMessage(messages.refreshError));
    } finally {
      setWorkingId(undefined);
    }
  };

  const addFeed = async (event: FormEvent) => {
    event.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      setError(intl.formatMessage(messages.invalidUrl));
      return;
    }
    if (!validTimeZone(data.timeZone)) {
      setError(intl.formatMessage(messages.timezoneError));
      return;
    }

    setWorkingId("new");
    setError(undefined);
    try {
      const granted = await requestFeedPermission(parsed.href);
      if (!granted) {
        setError(intl.formatMessage(messages.permissionError));
        return;
      }
      const feed: ICalFeed = {
        id: feedId(),
        kind: "ical",
        name: name.trim() || parsed.hostname,
        url: parsed.href,
        colour,
        enabled: true,
        refreshMinutes: 30,
        timeZone: data.timeZone,
      };
      if (!(await persist([...feeds, feed]))) return;
      setName("");
      setUrl("");
      await refreshFeed(feed);
    } finally {
      setWorkingId(undefined);
    }
  };

  const updateFeed = async (
    feed: CalendarFeed,
    patch: Partial<
      Pick<CalendarFeed, "enabled" | "refreshMinutes" | "timeZone">
    >,
  ) => {
    await persist(
      feeds.map((candidate) =>
        candidate.id === feed.id ? { ...candidate, ...patch } : candidate,
      ),
    );
  };

  const removeFeed = async (feed: CalendarFeed) => {
    setWorkingId(feed.id);
    try {
      if (await persist(feeds.filter(({ id }) => id !== feed.id))) {
        await deleteCalendarFeedCache(feed.id);
      }
    } catch {
      setError(intl.formatMessage(messages.storageError));
    } finally {
      setWorkingId(undefined);
    }
  };

  const applyTimeZone = async () => {
    if (!validTimeZone(data.timeZone)) {
      setError(intl.formatMessage(messages.timezoneError));
      return;
    }
    if (
      feeds.every(
        (feed) => feed.kind === "google" || feed.timeZone === data.timeZone,
      )
    ) {
      return;
    }
    const nextFeeds = feeds.map((feed) =>
      feed.kind === "ical" ? { ...feed, timeZone: data.timeZone } : feed,
    );
    try {
      if (await persist(nextFeeds)) {
        await browser.runtime.sendMessage({
          type: REFRESH_ALL_CALENDARS,
          force: true,
        });
      }
    } catch {
      setError(intl.formatMessage(messages.refreshError));
    }
  };

  const saveGoogleFeeds = async (
    googleFeeds: GoogleCalendarFeed[],
  ): Promise<boolean> => {
    return persist([
      ...feeds.filter((feed) => feed.kind === "ical"),
      ...googleFeeds,
    ]);
  };

  return (
    <div className="AgendaSettings">
      <label>
        <FormattedMessage
          id="plugins.agenda.settings.timeZone"
          defaultMessage="Agenda timezone (IANA)"
          description="Agenda timezone setting"
        />
        <input
          type="text"
          list="agenda-timezones"
          value={data.timeZone}
          onChange={(event) =>
            setData({ ...data, timeZone: event.target.value })
          }
          onBlur={() => void applyTimeZone()}
        />
        <datalist id="agenda-timezones">
          <option value="Europe/Madrid" />
          <option value="Europe/Paris" />
          <option value="Europe/London" />
          <option value="America/New_York" />
          <option value="America/Los_Angeles" />
          <option value="Asia/Tokyo" />
          <option value="UTC" />
        </datalist>
      </label>

      <label>
        <FormattedMessage
          id="plugins.agenda.settings.maxEvents"
          defaultMessage="Maximum events shown"
          description="Maximum agenda events setting"
        />
        <input
          type="number"
          min="1"
          max="30"
          value={data.maxEvents}
          onChange={(event) =>
            setData({ ...data, maxEvents: Number(event.target.value) })
          }
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={data.showLocation}
          onChange={(event) =>
            setData({ ...data, showLocation: event.target.checked })
          }
        />
        <FormattedMessage
          id="plugins.agenda.settings.showLocation"
          defaultMessage="Show event locations"
          description="Show agenda event locations setting"
        />
      </label>

      <label>
        <input
          type="checkbox"
          checked={data.hidePast}
          onChange={(event) =>
            setData({ ...data, hidePast: event.target.checked })
          }
        />
        <FormattedMessage
          id="plugins.agenda.settings.hidePast"
          defaultMessage="Hide events after they finish"
          description="Hide past agenda events setting"
        />
      </label>

      <section className="AgendaSettings__feeds">
        <h5>
          <FormattedMessage
            id="plugins.agenda.settings.feeds"
            defaultMessage="Calendar sources"
            description="Calendar source settings heading"
          />
        </h5>
        <p className="info">
          <FormattedMessage
            id="plugins.agenda.settings.localPrivacy"
            defaultMessage="Calendar configuration and cached events stay in local extension storage; private URLs and account data are not written to browser sync."
            description="Calendar local storage privacy explanation"
          />
        </p>

        {feeds.map((feed) => (
          <div className="AgendaSettings__feed" key={feed.id}>
            <span
              className="AgendaSettings__colour"
              style={{ backgroundColor: feed.colour }}
            />
            <span className="AgendaSettings__feed-name">
              <strong>{feed.name}</strong>
              <small>
                {feed.kind === "ical" ? (
                  hostLabel(feed.url)
                ) : (
                  <FormattedMessage
                    id="plugins.agenda.settings.googleSource"
                    defaultMessage="Google Calendar"
                    description="Google Calendar source type label"
                  />
                )}
              </small>
            </span>
            <label>
              <input
                type="checkbox"
                checked={feed.enabled}
                disabled={workingId === feed.id}
                onChange={(event) =>
                  void updateFeed(feed, { enabled: event.target.checked })
                }
              />
              <FormattedMessage
                id="plugins.agenda.settings.enabled"
                defaultMessage="Enabled"
                description="Enable calendar feed checkbox"
              />
            </label>
            <select
              aria-label={intl.formatMessage({
                id: "plugins.agenda.settings.interval",
                defaultMessage: "Refresh interval",
                description: "Calendar feed refresh interval label",
              })}
              value={feed.refreshMinutes}
              onChange={(event) =>
                void updateFeed(feed, {
                  refreshMinutes: Number(event.target.value),
                })
              }
            >
              <option value="15">15 min</option>
              <option value="30">30 min</option>
              <option value="60">1 hour</option>
              <option value="180">3 hours</option>
            </select>
            <div className="AgendaSettings__feed-actions">
              <button
                type="button"
                disabled={workingId === feed.id}
                onClick={() => void refreshFeed(feed)}
              >
                <FormattedMessage
                  id="plugins.agenda.settings.refresh"
                  defaultMessage="Refresh"
                  description="Refresh one calendar feed button"
                />
              </button>
              <button
                type="button"
                disabled={workingId === feed.id}
                onClick={() => void removeFeed(feed)}
              >
                <FormattedMessage
                  id="plugins.agenda.settings.remove"
                  defaultMessage="Remove"
                  description="Remove calendar feed button"
                />
              </button>
            </div>
          </div>
        ))}

        <GoogleCalendarSettings
          feeds={feeds.filter(
            (feed): feed is GoogleCalendarFeed => feed.kind === "google",
          )}
          canAdd={feeds.length < MAX_CALENDAR_FEEDS}
          onSave={saveGoogleFeeds}
        />

        <form
          className="AgendaSettings__add"
          onSubmit={(event) => void addFeed(event)}
        >
          <h6>
            <FormattedMessage
              id="plugins.agenda.settings.ical"
              defaultMessage="iCal subscription"
              description="iCal subscription form heading"
            />
          </h6>
          <label>
            <FormattedMessage
              id="plugins.agenda.settings.feedName"
              defaultMessage="Name (optional)"
              description="iCal feed name field"
            />
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            <FormattedMessage
              id="plugins.agenda.settings.feedUrl"
              defaultMessage="Private iCal / .ics URL"
              description="iCal feed URL field"
            />
            <input
              type="url"
              required
              value={url}
              placeholder="https://example.com/calendar.ics"
              onChange={(event) => setUrl(event.target.value)}
            />
          </label>
          <label className="AgendaSettings__colour-input">
            <FormattedMessage
              id="plugins.agenda.settings.colour"
              defaultMessage="Colour"
              description="Calendar feed colour field"
            />
            <input
              type="color"
              value={colour}
              onChange={(event) => setColour(event.target.value)}
            />
          </label>
          <button type="submit" disabled={workingId === "new" || !url}>
            <FormattedMessage
              id="plugins.agenda.settings.add"
              defaultMessage="Allow host and add feed"
              description="Add iCal feed button"
            />
          </button>
        </form>
      </section>

      {error && (
        <p className="AgendaSettings__error" role="status">
          {error}
        </p>
      )}
    </div>
  );
};

export default AgendaSettings;
