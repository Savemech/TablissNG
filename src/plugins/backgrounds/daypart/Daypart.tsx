import "../base/BaseBackground.sass";
import "./Daypart.sass";

import { type FC } from "react";
import { CrossFade } from "react-crossfade-simple";

import { usePublishBackgroundAppearance } from "../../../backgroundAppearance";
import { useBackdropPresentation } from "../base/useBackdrop";
import { resolveDaypartPreset } from "./presets";
import { normaliseSolarSchedule } from "./solarSchedule";
import { defaultData, type Props } from "./types";
import { useDaypart } from "./useDaypart";

const Daypart: FC<Props> = ({ data = defaultData }) => {
  const normalizedData = {
    ...defaultData,
    ...data,
    schedule: { ...defaultData.schedule, ...data.schedule },
    solar: normaliseSolarSchedule(data.solar),
  };
  const selected = {
    ...defaultData.presetByDaypart,
    ...data.presetByDaypart,
  };
  const { daypart } = useDaypart(normalizedData);
  const preset = resolveDaypartPreset(daypart, selected[daypart]);
  const { backdropStyle, baseColor, effectiveLuminance, owner } =
    useBackdropPresentation(preset.luminance);
  usePublishBackgroundAppearance(owner, effectiveLuminance);

  return (
    <div
      className={`Daypart Daypart--${daypart} fullscreen bg-base`}
      style={{ backgroundColor: baseColor }}
    >
      <CrossFade contentKey={preset.id} timeout={1800}>
        <div
          className="Daypart__surface image fullscreen"
          style={{ ...backdropStyle, backgroundImage: preset.backgroundImage }}
          data-daypart={daypart}
          data-preset={preset.id}
        />
      </CrossFade>
    </div>
  );
};

export default Daypart;
