import "../base/BaseBackground.sass";
import "./Daypart.sass";

import { type FC } from "react";
import { CrossFade } from "react-crossfade-simple";

import { resolveDaypartPreset } from "./presets";
import { defaultData, type Props } from "./types";
import { useDaypart } from "./useDaypart";

const Daypart: FC<Props> = ({ data = defaultData }) => {
  const schedule = { ...defaultData.schedule, ...data.schedule };
  const selected = {
    ...defaultData.presetByDaypart,
    ...data.presetByDaypart,
  };
  const daypart = useDaypart(schedule);
  const preset = resolveDaypartPreset(daypart, selected[daypart]);

  return (
    <div className={`Daypart Daypart--${daypart} fullscreen bg-base`}>
      <CrossFade contentKey={preset.id} timeout={1800}>
        <div
          className="Daypart__surface image fullscreen"
          style={{ backgroundImage: preset.backgroundImage }}
          data-daypart={daypart}
          data-preset={preset.id}
        />
      </CrossFade>
    </div>
  );
};

export default Daypart;
