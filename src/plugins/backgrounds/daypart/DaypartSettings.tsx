import "./DaypartSettings.sass";

import { type FC } from "react";
import {
  defineMessages,
  FormattedMessage,
  type MessageDescriptor,
  useIntl,
} from "react-intl";

import { type Daypart,DAYPARTS } from "./model";
import { presetsForDaypart } from "./presets";
import { defaultData, type Props } from "./types";

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

const DaypartSettings: FC<Props> = ({ data = defaultData, setData }) => {
  const intl = useIntl();
  const schedule = { ...defaultData.schedule, ...data.schedule };
  const selected = {
    ...defaultData.presetByDaypart,
    ...data.presetByDaypart,
  };

  const setStart = (daypart: Daypart, value: string) => {
    setData({
      ...data,
      schedule: { ...schedule, [daypart]: value },
      presetByDaypart: selected,
    });
  };

  const setPreset = (daypart: Daypart, id: string) => {
    setData({
      ...data,
      schedule,
      presetByDaypart: { ...selected, [daypart]: id },
    });
  };

  return (
    <div className="DaypartSettings">
      <p className="info">
        <FormattedMessage
          id="backgrounds.daypart.info"
          defaultMessage="Choose one offline palette for each part of the day. Morning palettes are deliberately blue or green; evening palettes are orange or red."
          description="Daypart gallery behaviour explanation"
        />
      </p>
      {DAYPARTS.map((daypart) => (
        <fieldset className="DaypartSettings__group" key={daypart}>
          <legend>
            <FormattedMessage {...daypartMessages[daypart]} />
          </legend>
          <label className="DaypartSettings__start">
            <FormattedMessage
              id="backgrounds.daypart.startsAt"
              defaultMessage="Starts at"
              description="Daypart start time label"
            />
            <input
              type="time"
              value={schedule[daypart]}
              onChange={(event) => setStart(daypart, event.target.value)}
            />
          </label>
          <div
            className="DaypartSettings__gallery"
            role="radiogroup"
            aria-label={intl.formatMessage(daypartMessages[daypart])}
          >
            {presetsForDaypart(daypart).map((preset) => (
              <label
                className={`DaypartSettings__preset${
                  selected[daypart] === preset.id ? " is-selected" : ""
                }`}
                key={preset.id}
                style={{ backgroundImage: preset.backgroundImage }}
              >
                <input
                  type="radio"
                  name={`daypart-${daypart}`}
                  value={preset.id}
                  checked={selected[daypart] === preset.id}
                  onChange={() => setPreset(daypart, preset.id)}
                />
                <span>
                  <FormattedMessage {...messageByPresetId[preset.id]} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
};

export default DaypartSettings;
