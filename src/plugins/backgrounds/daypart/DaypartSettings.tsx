import "./DaypartSettings.sass";

import { Icon } from "@iconify/react";
import {
  type FC,
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  defineMessages,
  FormattedMessage,
  type MessageDescriptor,
  useIntl,
} from "react-intl";

import { contrastForLuminance } from "../../../backgroundAppearance";
import { requestDataCollectionPermissions } from "../../../extension/dataConsent";
import {
  type GeocodedLocation,
  searchLocations,
} from "../../../location/geocoding";
import DaypartTimeline from "./DaypartTimeline";
import {
  type Daypart,
  daypartAtMinutes,
  DAYPARTS,
  type DaypartSchedule,
  normaliseDaypartSchedule,
  timeToMinutes,
} from "./model";
import { presetsForDaypart, resolveDaypartPreset } from "./presets";
import { minuteInTimeZone, SOLAR_EVENTS, type SolarEvent } from "./solar";
import {
  constrainBoundaryMinute,
  defaultSolarBoundaries,
  minutesToTime,
  normaliseSolarSchedule,
  offsetForBoundaryMinute,
  orderedBoundaryMinutes,
  type ScheduleMode,
  SOLAR_OFFSET_MAX,
  SOLAR_OFFSET_MIN,
  type SolarBoundary,
  type SolarScheduleConfig,
} from "./solarSchedule";
import { type Data, defaultData, type Props } from "./types";
import { useDaypart } from "./useDaypart";

const daypartMessages: Record<Daypart, MessageDescriptor> = defineMessages({
  morning: {
    id: "backgrounds.daypart.morning",
    defaultMessage: "Morning",
    description: "Morning background gallery heading",
  },
  day: {
    id: "backgrounds.daypart.day",
    defaultMessage: "Day",
    description: "Day background gallery heading",
  },
  evening: {
    id: "backgrounds.daypart.evening",
    defaultMessage: "Evening",
    description: "Evening background gallery heading",
  },
  night: {
    id: "backgrounds.daypart.night",
    defaultMessage: "Night",
    description: "Night background gallery heading",
  },
});

const solarEventMessages: Record<SolarEvent, MessageDescriptor> =
  defineMessages({
    civilDawn: {
      id: "backgrounds.daypart.solar.civilDawn",
      defaultMessage: "Civil dawn",
      description: "Solar event option and timeline label",
    },
    sunrise: {
      id: "backgrounds.daypart.solar.sunrise",
      defaultMessage: "Sunrise",
      description: "Solar event option and timeline label",
    },
    solarNoon: {
      id: "backgrounds.daypart.solar.solarNoon",
      defaultMessage: "Solar noon",
      description: "Solar event option and timeline label",
    },
    sunset: {
      id: "backgrounds.daypart.solar.sunset",
      defaultMessage: "Sunset",
      description: "Solar event option and timeline label",
    },
    civilDusk: {
      id: "backgrounds.daypart.solar.civilDusk",
      defaultMessage: "Civil dusk",
      description: "Solar event option and timeline label",
    },
  });

const editorMessages = defineMessages({
  timelineLabel: {
    id: "backgrounds.daypart.editor.timeline",
    defaultMessage: "24-hour Daypart timeline",
    description: "Accessible label for the visual Daypart editor timeline",
  },
  now: {
    id: "backgrounds.daypart.editor.now",
    defaultMessage: "Now",
    description: "Current-time marker label in the Daypart editor",
  },
  preview: {
    id: "backgrounds.daypart.editor.preview",
    defaultMessage: "Preview",
    description: "Preview playhead and card label in the Daypart editor",
  },
  startsAt: {
    id: "backgrounds.daypart.startsAt",
    defaultMessage: "Starts at",
    description: "Daypart start time label",
  },
  cityPlaceholder: {
    id: "backgrounds.daypart.solar.cityPlaceholder",
    defaultMessage: "City or location",
    description: "Placeholder for solar schedule city search",
  },
  search: {
    id: "backgrounds.daypart.solar.search",
    defaultMessage: "Search",
    description: "Button label for solar schedule city search",
  },
});

const presetMessages: Record<string, MessageDescriptor> = defineMessages({
  arcticMint: {
    id: "backgrounds.daypart.preset.arcticMint",
    defaultMessage: "Arctic mint",
    description: "Daypart background preset name",
  },
  bluebell: {
    id: "backgrounds.daypart.preset.bluebell",
    defaultMessage: "Bluebell",
    description: "Daypart background preset name",
  },
  springSky: {
    id: "backgrounds.daypart.preset.springSky",
    defaultMessage: "Spring sky",
    description: "Daypart background preset name",
  },
  clearSky: {
    id: "backgrounds.daypart.preset.clearSky",
    defaultMessage: "Clear sky",
    description: "Daypart background preset name",
  },
  alpine: {
    id: "backgrounds.daypart.preset.alpine",
    defaultMessage: "Alpine",
    description: "Daypart background preset name",
  },
  electricLagoon: {
    id: "backgrounds.daypart.preset.electricLagoon",
    defaultMessage: "Electric lagoon",
    description: "Daypart background preset name",
  },
  ember: {
    id: "backgrounds.daypart.preset.ember",
    defaultMessage: "Ember",
    description: "Daypart background preset name",
  },
  solarFlare: {
    id: "backgrounds.daypart.preset.solarFlare",
    defaultMessage: "Solar flare",
    description: "Daypart background preset name",
  },
  coralDusk: {
    id: "backgrounds.daypart.preset.coralDusk",
    defaultMessage: "Coral dusk",
    description: "Daypart background preset name",
  },
  midnight: {
    id: "backgrounds.daypart.preset.midnight",
    defaultMessage: "Midnight",
    description: "Daypart background preset name",
  },
  aurora: {
    id: "backgrounds.daypart.preset.aurora",
    defaultMessage: "Aurora",
    description: "Daypart background preset name",
  },
  deepViolet: {
    id: "backgrounds.daypart.preset.deepViolet",
    defaultMessage: "Deep violet",
    description: "Daypart background preset name",
  },
});

const messageByPresetId: Record<string, MessageDescriptor> = {
  "arctic-mint": presetMessages.arcticMint,
  bluebell: presetMessages.bluebell,
  "spring-sky": presetMessages.springSky,
  "clear-sky": presetMessages.clearSky,
  alpine: presetMessages.alpine,
  "electric-lagoon": presetMessages.electricLagoon,
  ember: presetMessages.ember,
  "solar-flare": presetMessages.solarFlare,
  "coral-dusk": presetMessages.coralDusk,
  midnight: presetMessages.midnight,
  aurora: presetMessages.aurora,
  "deep-violet": presetMessages.deepViolet,
};

type EditorData = Omit<Data, "scheduleMode" | "solar"> & {
  scheduleMode: ScheduleMode;
  solar: SolarScheduleConfig;
};

type LocationSearchState = "idle" | "loading" | "empty" | "denied" | "error";

function scheduleMinuteMap(schedule: DaypartSchedule): Record<Daypart, number> {
  return orderedBoundaryMinutes(
    Object.fromEntries(
      DAYPARTS.map((daypart) => [
        daypart,
        timeToMinutes(schedule[daypart]) ?? 0,
      ]),
    ) as Record<Daypart, number>,
  );
}

function clampOffset(value: number): number {
  return Math.min(SOLAR_OFFSET_MAX, Math.max(SOLAR_OFFSET_MIN, value));
}

const DaypartSettings: FC<Props> = ({ data = defaultData, setData }) => {
  const intl = useIntl();
  const editorData = useMemo<EditorData>(() => {
    return {
      ...defaultData,
      ...data,
      scheduleMode: data.scheduleMode === "solar" ? "solar" : "clock",
      schedule: normaliseDaypartSchedule(data.schedule),
      solar: normaliseSolarSchedule(data.solar),
      presetByDaypart: {
        ...defaultData.presetByDaypart,
        ...data.presetByDaypart,
      },
    };
  }, [data]);
  const [timelineDraft, setTimelineDraft] = useState<EditorData>();
  const activeData = timelineDraft ?? editorData;
  const runtime = useDaypart(activeData);
  const [previewMinute, setPreviewMinute] = useState(runtime.minuteOfDay);
  const [locationQuery, setLocationQuery] = useState(
    activeData.solar.location?.name ?? "",
  );
  const [locationResults, setLocationResults] = useState<GeocodedLocation[]>(
    [],
  );
  const [locationSearchState, setLocationSearchState] =
    useState<LocationSearchState>("idle");
  const searchControllerRef = useRef<AbortController | undefined>(undefined);

  useEffect(
    () => () => {
      searchControllerRef.current?.abort();
    },
    [],
  );

  const daypartLabels = Object.fromEntries(
    DAYPARTS.map((daypart) => [
      daypart,
      intl.formatMessage(daypartMessages[daypart]),
    ]),
  ) as Record<Daypart, string>;
  const solarEventLabels = Object.fromEntries(
    SOLAR_EVENTS.map((solarEvent) => [
      solarEvent,
      intl.formatMessage(solarEventMessages[solarEvent]),
    ]),
  ) as Record<SolarEvent, string>;
  const previewDaypart = daypartAtMinutes(previewMinute, runtime.schedule);
  const previewPreset = resolveDaypartPreset(
    previewDaypart,
    activeData.presetByDaypart[previewDaypart],
  );
  const previewContrast = contrastForLuminance(previewPreset.luminance);

  const save = (patch: Partial<EditorData>) => {
    setTimelineDraft(undefined);
    setData({ ...activeData, ...patch });
  };

  const setSolarBoundary = (
    daypart: Daypart,
    patch: Partial<SolarBoundary>,
  ) => {
    save({
      solar: {
        ...activeData.solar,
        boundaries: {
          ...activeData.solar.boundaries,
          [daypart]: {
            ...activeData.solar.boundaries[daypart],
            ...patch,
          },
        },
      },
    });
  };

  const dataWithTimelineBoundary = (
    daypart: Daypart,
    requestedMinute: number,
  ): EditorData => {
    if (activeData.scheduleMode === "clock") {
      const minutes = scheduleMinuteMap(runtime.schedule);
      const minute = constrainBoundaryMinute(daypart, requestedMinute, minutes);
      return {
        ...activeData,
        schedule: {
          ...activeData.schedule,
          [daypart]: minutesToTime(minute),
        },
      };
    }
    const boundary = activeData.solar.boundaries[daypart];
    const anchorMinute = runtime.solarEventMinutes[boundary.event];
    if (anchorMinute === undefined) return activeData;
    return {
      ...activeData,
      solar: {
        ...activeData.solar,
        boundaries: {
          ...activeData.solar.boundaries,
          [daypart]: {
            ...boundary,
            offsetMinutes: offsetForBoundaryMinute(
              requestedMinute,
              anchorMinute,
            ),
          },
        },
      },
    };
  };

  const previewTimelineBoundary = (daypart: Daypart, minute: number) => {
    setTimelineDraft(dataWithTimelineBoundary(daypart, minute));
  };

  const commitTimelineBoundary = (daypart: Daypart, minute: number) => {
    const nextData = dataWithTimelineBoundary(daypart, minute);
    setTimelineDraft(undefined);
    setData(nextData);
  };

  const setPreset = (daypart: Daypart, id: string) => {
    save({
      presetByDaypart: {
        ...activeData.presetByDaypart,
        [daypart]: id,
      },
    });
    const starts = timeToMinutes(runtime.schedule[daypart]) ?? previewMinute;
    setPreviewMinute(Math.min(24 * 60 - 1, starts + 1));
  };

  const searchForLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (locationQuery.trim().length < 2) {
      setLocationResults([]);
      setLocationSearchState("empty");
      return;
    }
    setLocationResults([]);
    if (!(await requestDataCollectionPermissions(["locationInfo"]))) {
      setLocationSearchState("denied");
      return;
    }

    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setLocationSearchState("loading");
    try {
      const results = await searchLocations(
        locationQuery,
        intl.locale,
        controller.signal,
      );
      setLocationResults(results);
      setLocationSearchState(results.length ? "idle" : "empty");
    } catch {
      if (!controller.signal.aborted) setLocationSearchState("error");
    }
  };

  const selectLocation = (location: GeocodedLocation) => {
    save({
      scheduleMode: "solar",
      solar: { ...activeData.solar, location },
    });
    setPreviewMinute(minuteInTimeZone(new Date(), location.timeZone));
    setLocationQuery(location.name);
    setLocationResults([]);
    setLocationSearchState("idle");
  };

  const generatedConfig = JSON.stringify(
    {
      scheduleMode: activeData.scheduleMode,
      schedule: activeData.schedule,
      solar: activeData.solar,
      presetByDaypart: activeData.presetByDaypart,
    },
    null,
    2,
  );
  const timelineEditable =
    activeData.scheduleMode === "clock" || runtime.solarStatus === "ready";

  return (
    <div className="DaypartSettings">
      <p className="info">
        <FormattedMessage
          id="backgrounds.daypart.info"
          defaultMessage="Build a 24-hour palette visually. Drag a boundary or click the timeline to preview any moment; every change is written to the same portable config as the controls below."
          description="Daypart visual editor behaviour explanation"
        />
      </p>

      <div className="DaypartSettings__mode" role="radiogroup">
        <label
          className={activeData.scheduleMode === "clock" ? "is-selected" : ""}
        >
          <input
            type="radio"
            name="daypart-schedule-mode"
            checked={activeData.scheduleMode === "clock"}
            onChange={() => save({ scheduleMode: "clock" })}
          />
          <FormattedMessage
            id="backgrounds.daypart.mode.clock"
            defaultMessage="Fixed clock"
            description="Fixed clock Daypart schedule mode"
          />
        </label>
        <label
          className={activeData.scheduleMode === "solar" ? "is-selected" : ""}
        >
          <input
            type="radio"
            name="daypart-schedule-mode"
            checked={activeData.scheduleMode === "solar"}
            onChange={() => save({ scheduleMode: "solar" })}
          />
          <FormattedMessage
            id="backgrounds.daypart.mode.solar"
            defaultMessage="Follow the sun"
            description="Solar Daypart schedule mode"
          />
        </label>
      </div>

      {activeData.scheduleMode === "solar" && (
        <section className="DaypartSettings__location">
          <form onSubmit={(event) => void searchForLocation(event)}>
            <label htmlFor="DaypartSettings__city">
              <FormattedMessage
                id="backgrounds.daypart.solar.city"
                defaultMessage="Solar location"
                description="Solar schedule city search label"
              />
            </label>
            <div className="DaypartSettings__search-row">
              <input
                id="DaypartSettings__city"
                type="text"
                value={locationQuery}
                placeholder={intl.formatMessage(editorMessages.cityPlaceholder)}
                onChange={(event) => setLocationQuery(event.target.value)}
              />
              <button
                className="button--icon button--primary"
                type="submit"
                aria-label={intl.formatMessage(editorMessages.search)}
                disabled={locationSearchState === "loading"}
              >
                <Icon icon="feather:search" />
              </button>
            </div>
          </form>

          {activeData.solar.location && (
            <div className="DaypartSettings__selected-location">
              <strong>{activeData.solar.location.label}</strong>
              <span>{activeData.solar.location.timeZone}</span>
            </div>
          )}

          {locationResults.length > 0 && (
            <ul className="DaypartSettings__location-results">
              {locationResults.map((location) => (
                <li key={location.id}>
                  <button
                    type="button"
                    onClick={() => selectLocation(location)}
                  >
                    <strong>{location.label}</strong>
                    <span>{location.timeZone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {locationSearchState === "loading" && (
            <p className="DaypartSettings__status">
              <FormattedMessage
                id="backgrounds.daypart.solar.searching"
                defaultMessage="Searching…"
                description="Solar location search progress message"
              />
            </p>
          )}
          {locationSearchState === "empty" && (
            <p className="DaypartSettings__status is-warning">
              <FormattedMessage
                id="backgrounds.daypart.solar.noLocations"
                defaultMessage="No matching locations. Enter at least two characters or try a nearby city."
                description="Solar location empty search result message"
              />
            </p>
          )}
          {locationSearchState === "denied" && (
            <p className="DaypartSettings__status is-warning">
              <FormattedMessage
                id="backgrounds.daypart.solar.locationDenied"
                defaultMessage="Location search permission was not granted."
                description="Solar location permission denial message"
              />
            </p>
          )}
          {locationSearchState === "error" && (
            <p className="DaypartSettings__status is-warning">
              <FormattedMessage
                id="backgrounds.daypart.solar.locationError"
                defaultMessage="The city search failed. Check your connection and try again."
                description="Solar location search error message"
              />
            </p>
          )}

          <p className="DaypartSettings__privacy-note">
            <FormattedMessage
              id="backgrounds.daypart.solar.privacy"
              defaultMessage="Only city search contacts Open-Meteo. Coordinates and timezone are saved; all sun calculations run locally."
              description="Privacy note for solar schedule city search"
            />
          </p>
        </section>
      )}

      <section
        className="DaypartSettings__preview"
        style={{
          backgroundImage: previewPreset.backgroundImage,
          color: previewContrast.text,
          textShadow: previewContrast.shadow,
        }}
      >
        <span>
          <FormattedMessage {...editorMessages.preview} />
        </span>
        <time>{minutesToTime(previewMinute)}</time>
        <strong>{daypartLabels[previewDaypart]}</strong>
        <small>
          <FormattedMessage {...messageByPresetId[previewPreset.id]} />
        </small>
      </section>

      <DaypartTimeline
        schedule={runtime.schedule}
        selected={activeData.presetByDaypart}
        mode={activeData.scheduleMode}
        editable={timelineEditable}
        nowMinute={runtime.minuteOfDay}
        previewMinute={previewMinute}
        solarEventMinutes={runtime.solarEventMinutes}
        daypartLabels={daypartLabels}
        solarEventLabels={solarEventLabels}
        timelineLabel={intl.formatMessage(editorMessages.timelineLabel)}
        nowLabel={intl.formatMessage(editorMessages.now)}
        previewLabel={intl.formatMessage(editorMessages.preview)}
        startsAtLabel={intl.formatMessage(editorMessages.startsAt)}
        onPreviewChange={setPreviewMinute}
        onBoundaryPreview={previewTimelineBoundary}
        onBoundaryCommit={commitTimelineBoundary}
      />

      <div className="DaypartSettings__editor-actions">
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setPreviewMinute(runtime.minuteOfDay)}
        >
          <FormattedMessage
            id="backgrounds.daypart.editor.previewNow"
            defaultMessage="Preview now"
            description="Button to move Daypart preview to the current time"
          />
        </button>
        {activeData.scheduleMode === "solar" && (
          <button
            className="button button--secondary"
            type="button"
            onClick={() =>
              save({
                solar: {
                  ...activeData.solar,
                  boundaries: defaultSolarBoundaries,
                },
              })
            }
          >
            <FormattedMessage
              id="backgrounds.daypart.solar.reset"
              defaultMessage="Reset sun offsets"
              description="Button to reset solar schedule anchors and offsets"
            />
          </button>
        )}
      </div>

      {activeData.scheduleMode === "solar" && (
        <p
          className={`DaypartSettings__solar-state DaypartSettings__solar-state--${runtime.solarStatus}`}
        >
          {runtime.solarStatus === "ready" && (
            <FormattedMessage
              id="backgrounds.daypart.solar.ready"
              defaultMessage="Using today's sun events in {location}."
              description="Solar schedule ready status"
              values={{ location: activeData.solar.location?.label }}
            />
          )}
          {runtime.solarStatus === "missing-location" && (
            <FormattedMessage
              id="backgrounds.daypart.solar.missingLocation"
              defaultMessage="Choose a city to enable solar boundaries. Fixed times remain active until then."
              description="Solar schedule missing location fallback status"
            />
          )}
          {runtime.solarStatus === "invalid-location" && (
            <FormattedMessage
              id="backgrounds.daypart.solar.invalidLocation"
              defaultMessage="The saved location is invalid. Search for it again; fixed times are active."
              description="Solar schedule invalid location fallback status"
            />
          )}
          {runtime.solarStatus === "polar-day" && (
            <FormattedMessage
              id="backgrounds.daypart.solar.polarDay"
              defaultMessage="The sun does not set here today, so fixed times are active."
              description="Solar schedule polar day fallback status"
            />
          )}
          {runtime.solarStatus === "polar-night" && (
            <FormattedMessage
              id="backgrounds.daypart.solar.polarNight"
              defaultMessage="The sun does not rise here today, so fixed times are active."
              description="Solar schedule polar night fallback status"
            />
          )}
          {runtime.solarStatus === "unavailable" && (
            <FormattedMessage
              id="backgrounds.daypart.solar.unavailable"
              defaultMessage="One of the selected sun events is unavailable today, so fixed times are active."
              description="Solar schedule unavailable event fallback status"
            />
          )}
        </p>
      )}

      {DAYPARTS.map((daypart) => {
        const boundary = activeData.solar.boundaries[daypart];
        return (
          <fieldset className="DaypartSettings__group" key={daypart}>
            <legend>{daypartLabels[daypart]}</legend>

            {activeData.scheduleMode === "clock" ? (
              <label className="DaypartSettings__start">
                <FormattedMessage {...editorMessages.startsAt} />
                <input
                  type="time"
                  value={activeData.schedule[daypart]}
                  onChange={(event) => {
                    const minute = timeToMinutes(event.target.value);
                    if (minute !== undefined) {
                      commitTimelineBoundary(daypart, minute);
                    }
                  }}
                />
              </label>
            ) : (
              <div className="DaypartSettings__solar-boundary">
                <label>
                  <FormattedMessage
                    id="backgrounds.daypart.solar.anchor"
                    defaultMessage="Sun event"
                    description="Solar boundary anchor event label"
                  />
                  <select
                    value={boundary.event}
                    onChange={(event) =>
                      setSolarBoundary(daypart, {
                        event: event.target.value as SolarEvent,
                      })
                    }
                  >
                    {SOLAR_EVENTS.map((solarEvent) => (
                      <option key={solarEvent} value={solarEvent}>
                        {solarEventLabels[solarEvent]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="DaypartSettings__offset">
                  <span>
                    <FormattedMessage
                      id="backgrounds.daypart.solar.offset"
                      defaultMessage="Offset (minutes)"
                      description="Solar boundary minute offset label"
                    />
                  </span>
                  <div>
                    <input
                      type="range"
                      min={SOLAR_OFFSET_MIN}
                      max={SOLAR_OFFSET_MAX}
                      step="5"
                      value={boundary.offsetMinutes}
                      onChange={(event) =>
                        setSolarBoundary(daypart, {
                          offsetMinutes: Number(event.target.value),
                        })
                      }
                    />
                    <input
                      type="number"
                      min={SOLAR_OFFSET_MIN}
                      max={SOLAR_OFFSET_MAX}
                      step="5"
                      value={boundary.offsetMinutes}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber;
                        if (Number.isFinite(value)) {
                          setSolarBoundary(daypart, {
                            offsetMinutes: clampOffset(Math.round(value)),
                          });
                        }
                      }}
                    />
                  </div>
                </label>
                <output className="DaypartSettings__effective-time">
                  <span>
                    <FormattedMessage
                      id="backgrounds.daypart.solar.effectiveStart"
                      defaultMessage="Today"
                      description="Today's effective solar boundary time label"
                    />
                  </span>
                  <strong>{runtime.schedule[daypart]}</strong>
                </output>
              </div>
            )}

            <div
              className="DaypartSettings__gallery"
              role="radiogroup"
              aria-label={daypartLabels[daypart]}
            >
              {presetsForDaypart(daypart).map((preset) => (
                <label
                  className={`DaypartSettings__preset${
                    activeData.presetByDaypart[daypart] === preset.id
                      ? " is-selected"
                      : ""
                  }`}
                  key={preset.id}
                  style={{ backgroundImage: preset.backgroundImage }}
                >
                  <input
                    type="radio"
                    name={`daypart-${daypart}`}
                    value={preset.id}
                    checked={activeData.presetByDaypart[daypart] === preset.id}
                    onChange={() => setPreset(daypart, preset.id)}
                  />
                  <span>
                    <FormattedMessage {...messageByPresetId[preset.id]} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      <details className="DaypartSettings__config">
        <summary>
          <FormattedMessage
            id="backgrounds.daypart.editor.generatedConfig"
            defaultMessage="Generated configuration"
            description="Summary for generated Daypart configuration preview"
          />
        </summary>
        <textarea
          value={generatedConfig}
          readOnly
          rows={12}
          spellCheck={false}
        />
      </details>
    </div>
  );
};

export default DaypartSettings;
