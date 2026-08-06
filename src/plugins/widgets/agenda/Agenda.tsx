import "./Agenda.sass";

import { type FC, useEffect, useMemo, useState } from "react";
import { defineMessages, FormattedMessage, useIntl } from "react-intl";

import type { AgendaEvent } from "../../../extension/calendar/types";
import { dateKeyInTimeZone, eventsForDay, validTimeZone } from "./model";
import { defaultData, type Props } from "./types";
import { useAgenda } from "./useAgenda";

const messages = defineMessages({
  allDay: {
    id: "plugins.agenda.allDay",
    defaultMessage: "All day",
    description: "All-day calendar event time label",
  },
  refresh: {
    id: "plugins.agenda.refresh",
    defaultMessage: "Refresh calendars",
    description: "Agenda refresh button label",
  },
});

function safeEventUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function EventTitle({ event }: { event: AgendaEvent }) {
  const href = safeEventUrl(event.url);
  return href ? (
    <a href={href} className="Agenda__event-title">
      {event.title}
    </a>
  ) : (
    <span className="Agenda__event-title">{event.title}</span>
  );
}

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

const Agenda: FC<Props> = ({ data = defaultData }) => {
  const intl = useIntl();
  const now = useMinute();
  const { caches, error, events, feeds, loading, refreshing, refresh } =
    useAgenda();
  const timeZone = validTimeZone(data.timeZone)
    ? data.timeZone
    : defaultData.timeZone;
  const today = dateKeyInTimeZone(now, timeZone);
  const dayEvents = useMemo(
    () => eventsForDay(events, today, timeZone, now, data.hidePast),
    [data.hidePast, events, now, timeZone, today],
  );
  const visibleEvents = dayEvents.slice(0, Math.max(1, data.maxEvents));
  const dateLabel = new Intl.DateTimeFormat(intl.locale, {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const timeFormatter = new Intl.DateTimeFormat(intl.locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const enabledFeedIds = new Set(
    feeds.filter(({ enabled }) => enabled).map(({ id }) => id),
  );
  const cacheErrors = caches.filter(
    ({ error: cacheError, feedId }) => cacheError && enabledFeedIds.has(feedId),
  );
  const enabledFeedCount = enabledFeedIds.size;

  return (
    <section className="Agenda" aria-busy={loading || refreshing}>
      <header className="Agenda__header">
        <div>
          <strong>
            <FormattedMessage
              id="plugins.agenda.today"
              defaultMessage="Today"
              description="Agenda today heading"
            />
          </strong>
          <span className="Agenda__date">{dateLabel}</span>
        </div>
        <button
          type="button"
          className="Agenda__refresh"
          aria-label={intl.formatMessage(messages.refresh)}
          title={intl.formatMessage(messages.refresh)}
          disabled={refreshing || enabledFeedCount === 0}
          onClick={() => void refresh(true)}
        >
          {refreshing ? <span className="Agenda__spinner" /> : "↻"}
        </button>
      </header>

      {enabledFeedCount === 0 && !loading ? (
        <p className="Agenda__empty">
          <FormattedMessage
            id="plugins.agenda.noFeeds"
            defaultMessage="Add an iCal feed in this widget's settings."
            description="Agenda has no calendar feeds message"
          />
        </p>
      ) : visibleEvents.length === 0 && !loading ? (
        <p className="Agenda__empty">
          <FormattedMessage
            id="plugins.agenda.noEvents"
            defaultMessage="Nothing else on today's agenda."
            description="Agenda has no events today message"
          />
        </p>
      ) : (
        <ol className="Agenda__events">
          {visibleEvents.map((event) => {
            const start = new Date(event.start);
            const end = new Date(event.end);
            const ongoing =
              !event.allDay && start <= now && end.getTime() > now.getTime();
            const time = event.allDay
              ? intl.formatMessage(messages.allDay)
              : `${timeFormatter.format(start)}–${timeFormatter.format(end)}`;
            return (
              <li
                key={event.id}
                className={`Agenda__event${ongoing ? " is-ongoing" : ""}`}
              >
                <span
                  className="Agenda__colour"
                  style={{ backgroundColor: event.colour }}
                  aria-hidden="true"
                />
                <time className="Agenda__time" dateTime={event.start}>
                  {time}
                </time>
                <span className="Agenda__details">
                  <EventTitle event={event} />
                  {data.showLocation && event.location && (
                    <span className="Agenda__location">{event.location}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {dayEvents.length > visibleEvents.length && (
        <p className="Agenda__more">
          <FormattedMessage
            id="plugins.agenda.more"
            defaultMessage="+{count} more"
            description="Count of hidden agenda events"
            values={{ count: dayEvents.length - visibleEvents.length }}
          />
        </p>
      )}

      {(error || cacheErrors.length > 0) && (
        <p className="Agenda__warning" role="status">
          <FormattedMessage
            id="plugins.agenda.cachedWarning"
            defaultMessage="Calendar refresh failed; showing the last cached agenda."
            description="Agenda stale cache warning"
          />
        </p>
      )}
    </section>
  );
};

export default Agenda;
