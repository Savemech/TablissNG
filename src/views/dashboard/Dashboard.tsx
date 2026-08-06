import "./Dashboard.sass";

import { type CSSProperties, type FC, memo } from "react";

import {
  contrastForLuminance,
  useBackgroundAppearance,
} from "../../backgroundAppearance";
import { db } from "../../db/state";
import { useTheme } from "../../hooks";
import { useKey } from "../../lib/db/react";
import Background from "./Background";
import Overlay from "./Overlay";
import Widgets from "./Widgets";

const Dashboard: FC = () => {
  const { isDark } = useTheme();
  const appearance = useBackgroundAppearance();
  const contrast = contrastForLuminance(appearance.luminance);
  const theme = isDark ? "dark" : "";
  const [settingsIconPosition] = useKey(db, "settingsIconPosition");

  return (
    <div
      className={`Dashboard fullscreen ${theme} ${settingsIconPosition}`}
      style={
        {
          "--fdial-auto-text-color": contrast.text,
          "--fdial-auto-outline-color": contrast.outline,
          "--fdial-auto-text-shadow": contrast.shadow,
        } as CSSProperties
      }
    >
      <Background />
      <Widgets />
      <Overlay />
    </div>
  );
};

export default memo(Dashboard);
