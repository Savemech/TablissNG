import {
  type ComponentType,
  type FC,
  type ReactNode,
  Suspense,
  use,
} from "react";
import { withErrorBoundary } from "react-error-boundary";

import { cacheReady } from "../../db/state";
import { capture as captureException } from "../../errorHandler";
import { useApi } from "../../hooks";
import type { API, Config } from "../../plugins/types";
import Crashed from "./Crashed";

type Props = {
  id: string;
  component: ComponentType<API<any, any>>;
  defaultData: unknown;
  cacheStrategy?: Config["cacheStrategy"];
};

const PluginContent: FC<Props> = ({
  id,
  component: Component,
  defaultData,
}) => {
  // Create plugin API
  const api = useApi(id, defaultData);

  return <Component {...api} />;
};

const CacheHydrationGate: FC<{ children: ReactNode }> = ({ children }) => {
  use(cacheReady);
  return children;
};

const Plugin: FC<Props> = (props) => {
  if (props.cacheStrategy !== "hydrate-before-mount") {
    return <PluginContent {...props} />;
  }

  return (
    <Suspense fallback={null}>
      <CacheHydrationGate>
        <PluginContent {...props} />
      </CacheHydrationGate>
    </Suspense>
  );
};

export default withErrorBoundary(Plugin, {
  FallbackComponent: Crashed,
  onError: (error: unknown, _info: any) => {
    const err = error instanceof Error ? error : new Error(String(error));
    captureException(err);
  },
});
