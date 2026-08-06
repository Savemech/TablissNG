import { FC } from "react";

import {
  relativeLuminance,
  usePublishBackgroundAppearance,
} from "../../../backgroundAppearance";
import { defaultData, Props } from "./types";

const Colour: FC<Props> = ({ data = defaultData }) => {
  const colour = data.colour ?? "#3498db";
  usePublishBackgroundAppearance(
    "background/colour",
    relativeLuminance(colour),
  );
  return (
    <div className="Colour fullscreen" style={{ backgroundColor: colour }} />
  );
};

export default Colour;
