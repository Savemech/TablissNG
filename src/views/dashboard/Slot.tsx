import "./Slot.sass";

import type { FC } from "react";

import { WidgetPosition, WidgetState } from "../../db/state";
import LazyPlugin from "../shared/LazyPlugin";
import Widget from "./Widget";

type Props = {
  position: WidgetPosition;
  widgets: WidgetState[];
};

const Slot: FC<Props> = ({ position, widgets }) => (
  <div className={`Slot ${position}`}>
    {widgets.map(({ display, id, key }) => {
      return (
        <Widget key={id} id={id} {...display}>
          <LazyPlugin id={id} pluginKey={key} />
        </Widget>
      );
    })}
  </div>
);

export default Slot;
