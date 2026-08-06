import {
  type CSSProperties,
  type FC,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useRef,
} from "react";

import {
  type Daypart,
  DAYPARTS,
  type DaypartSchedule,
  timeToMinutes,
} from "./model";
import { resolveDaypartPreset } from "./presets";
import { SOLAR_EVENTS, type SolarEvent } from "./solar";
import {
  constrainBoundaryMinute,
  DAYPART_MIN_GAP,
  minutesToTime,
  orderedBoundaryMinutes,
  type ScheduleMode,
} from "./solarSchedule";

const MINUTES_PER_DAY = 24 * 60;
const DRAG_STEP = 5;
const HOUR_LABELS = ["00", "06", "12", "18", "24"] as const;

type Props = {
  schedule: DaypartSchedule;
  selected: Record<Daypart, string>;
  mode: ScheduleMode;
  editable: boolean;
  nowMinute: number;
  previewMinute: number;
  solarEventMinutes: Partial<Record<SolarEvent, number>>;
  daypartLabels: Record<Daypart, string>;
  solarEventLabels: Record<SolarEvent, string>;
  timelineLabel: string;
  nowLabel: string;
  previewLabel: string;
  startsAtLabel: string;
  onPreviewChange: (minute: number) => void;
  onBoundaryPreview: (daypart: Daypart, minute: number) => void;
  onBoundaryCommit: (daypart: Daypart, minute: number) => void;
};

type Segment = {
  daypart: Daypart;
  start: number;
  end: number;
};

function percentage(minute: number): number {
  return (minute / MINUTES_PER_DAY) * 100;
}

function minuteStyle(minute: number): CSSProperties {
  return { left: `${percentage(minute)}%` };
}

const DaypartTimeline: FC<Props> = ({
  schedule,
  selected,
  mode,
  editable,
  nowMinute,
  previewMinute,
  solarEventMinutes,
  daypartLabels,
  solarEventLabels,
  timelineLabel,
  nowLabel,
  previewLabel,
  startsAtLabel,
  onPreviewChange,
  onBoundaryPreview,
  onBoundaryCommit,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ daypart: Daypart; pointerId: number } | undefined>(
    undefined,
  );
  const boundaryMinutes = orderedBoundaryMinutes(
    Object.fromEntries(
      DAYPARTS.map((daypart) => [
        daypart,
        timeToMinutes(schedule[daypart]) ?? 0,
      ]),
    ) as Record<Daypart, number>,
  );
  const segments: Segment[] = [
    { daypart: "night", start: 0, end: boundaryMinutes.morning },
    {
      daypart: "morning",
      start: boundaryMinutes.morning,
      end: boundaryMinutes.day,
    },
    {
      daypart: "day",
      start: boundaryMinutes.day,
      end: boundaryMinutes.evening,
    },
    {
      daypart: "evening",
      start: boundaryMinutes.evening,
      end: boundaryMinutes.night,
    },
    {
      daypart: "night",
      start: boundaryMinutes.night,
      end: MINUTES_PER_DAY,
    },
  ];

  const minuteFromPointer = (clientX: number) => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds?.width) return 0;
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - bounds.left) / bounds.width),
    );
    return Math.min(
      MINUTES_PER_DAY - 1,
      Math.round((ratio * MINUTES_PER_DAY) / DRAG_STEP) * DRAG_STEP,
    );
  };

  const moveBoundary = (
    daypart: Daypart,
    requestedMinute: number,
    commit = false,
  ) => {
    const minute = constrainBoundaryMinute(
      daypart,
      requestedMinute,
      boundaryMinutes,
    );
    (commit ? onBoundaryCommit : onBoundaryPreview)(daypart, minute);
    onPreviewChange(Math.min(MINUTES_PER_DAY - 1, minute + 1));
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    daypart: Daypart,
  ) => {
    if (!editable || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { daypart, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    moveBoundary(daypart, minuteFromPointer(event.clientX));
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || dragRef.current.pointerId !== event.pointerId) {
      return;
    }
    moveBoundary(dragRef.current.daypart, minuteFromPointer(event.clientX));
  };

  const finishDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const { daypart } = dragRef.current;
    moveBoundary(daypart, minuteFromPointer(event.clientX), true);
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const cancelDragging = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const { daypart } = dragRef.current;
    onBoundaryCommit(daypart, boundaryMinutes[daypart]);
    dragRef.current = undefined;
  };

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
    daypart: Daypart,
  ) => {
    if (!editable) return;
    let requested = boundaryMinutes[daypart];
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      requested -= event.shiftKey ? 60 : DRAG_STEP;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      requested += event.shiftKey ? 60 : DRAG_STEP;
    } else if (event.key === "PageDown") {
      requested -= 60;
    } else if (event.key === "PageUp") {
      requested += 60;
    } else if (event.key === "Home") {
      requested = 0;
    } else if (event.key === "End") {
      requested = MINUTES_PER_DAY - 1;
    } else {
      return;
    }
    event.preventDefault();
    moveBoundary(daypart, requested, true);
  };
  const nowTitle = `${nowLabel} · ${minutesToTime(nowMinute)}`;
  const previewTitle = `${previewLabel} · ${minutesToTime(previewMinute)}`;

  return (
    <div className="DaypartTimeline">
      <div
        className="DaypartTimeline__track"
        ref={trackRef}
        role="group"
        aria-label={timelineLabel}
        onPointerDown={(event) =>
          onPreviewChange(minuteFromPointer(event.clientX))
        }
      >
        {segments.map(({ daypart, start, end }) => {
          const preset = resolveDaypartPreset(daypart, selected[daypart]);
          return (
            <div
              className={`DaypartTimeline__segment DaypartTimeline__segment--${daypart}`}
              key={`${daypart}-${start}`}
              title={daypartLabels[daypart]}
              style={{
                left: `${percentage(start)}%`,
                width: `${percentage(end - start)}%`,
                backgroundImage: preset.backgroundImage,
              }}
            />
          );
        })}

        {mode === "solar" &&
          SOLAR_EVENTS.map((solarEvent) => {
            const minute = solarEventMinutes[solarEvent];
            if (minute === undefined) return null;
            const title = `${solarEventLabels[solarEvent]} · ${minutesToTime(minute)}`;
            return (
              <span
                aria-hidden="true"
                className="DaypartTimeline__solar-tick"
                key={solarEvent}
                style={minuteStyle(minute)}
                title={title}
              />
            );
          })}

        <span
          className="DaypartTimeline__now"
          style={minuteStyle(nowMinute)}
          title={nowTitle}
        />
        <span
          className="DaypartTimeline__playhead"
          style={minuteStyle(previewMinute)}
          title={previewTitle}
        />

        {DAYPARTS.map((daypart, index) => {
          const minute = boundaryMinutes[daypart];
          const minimum =
            index === 0
              ? 0
              : boundaryMinutes[DAYPARTS[index - 1]] + DAYPART_MIN_GAP;
          const maximum =
            index === DAYPARTS.length - 1
              ? MINUTES_PER_DAY - 1
              : boundaryMinutes[DAYPARTS[index + 1]] - DAYPART_MIN_GAP;
          const preset = resolveDaypartPreset(daypart, selected[daypart]);
          const label = `${daypartLabels[daypart]} · ${startsAtLabel}`;
          return (
            <div
              aria-disabled={!editable}
              aria-label={label}
              aria-valuemax={maximum}
              aria-valuemin={minimum}
              aria-valuenow={minute}
              aria-valuetext={minutesToTime(minute)}
              className={`DaypartTimeline__handle${
                editable ? "" : " is-disabled"
              }`}
              key={daypart}
              onKeyDown={(event) => handleKeyDown(event, daypart)}
              onLostPointerCapture={() => {
                if (dragRef.current?.daypart === daypart) {
                  onBoundaryCommit(daypart, boundaryMinutes[daypart]);
                }
                dragRef.current = undefined;
              }}
              onPointerCancel={cancelDragging}
              onPointerDown={(event) => handlePointerDown(event, daypart)}
              onPointerMove={handlePointerMove}
              onPointerUp={finishDragging}
              role="slider"
              style={
                {
                  ...minuteStyle(minute),
                  "--daypart-handle": preset.colours[1],
                } as CSSProperties
              }
              tabIndex={editable ? 0 : -1}
            >
              <span className="DaypartTimeline__handle-time">
                {minutesToTime(minute)}
              </span>
              <span className="DaypartTimeline__handle-dot" />
            </div>
          );
        })}
      </div>

      <div className="DaypartTimeline__hours" aria-hidden="true">
        {HOUR_LABELS.map((hour) => (
          <span key={hour}>{hour}</span>
        ))}
      </div>

      {mode === "solar" &&
        SOLAR_EVENTS.some(
          (solarEvent) => solarEventMinutes[solarEvent] !== undefined,
        ) && (
          <ul className="DaypartTimeline__solar-legend">
            {SOLAR_EVENTS.map((solarEvent) => {
              const minute = solarEventMinutes[solarEvent];
              if (minute === undefined) return null;
              return (
                <li key={solarEvent}>
                  <span>{solarEventLabels[solarEvent]}</span>
                  <time>{minutesToTime(minute)}</time>
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
};

export default DaypartTimeline;
