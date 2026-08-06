import type { FC } from "react";

import { db } from "../../db/state";
import { useValue } from "../../lib/db/react";
import LazyPlugin from "../shared/LazyPlugin";

const Background: FC = () => {
  const background = useValue(db, "background");

  return (
    <div className="Background">
      <LazyPlugin id={background.id} pluginKey={background.key} />
    </div>
  );
};

export default Background;
