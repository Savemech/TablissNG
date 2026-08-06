import {
  type ComponentType,
  type FC,
  lazy,
  type LazyExoticComponent,
  Suspense,
} from "react";
import { withErrorBoundary } from "react-error-boundary";

import { capture as captureException } from "../../errorHandler";
import {
  type PluginLoader,
  pluginLoaders,
  unknownPluginLoader,
} from "../../plugins/loaders";
import type { Config } from "../../plugins/types";
import Crashed from "./Crashed";
import Plugin from "./Plugin";

type Props = {
  id: string;
  pluginKey: string;
};

type LoadedPluginProps = Pick<Props, "id">;

function createLoadedPlugin(config: Config): FC<LoadedPluginProps> {
  const LoadedPlugin: FC<LoadedPluginProps> = ({ id }) => (
    <Plugin
      id={id}
      component={config.dashboardComponent}
      defaultData={config.defaultData}
    />
  );

  return LoadedPlugin;
}

function createLazyPlugin(
  loader: PluginLoader,
): LazyExoticComponent<ComponentType<LoadedPluginProps>> {
  return lazy(async () => {
    const { default: config } = await loader();
    return { default: createLoadedPlugin(config) };
  });
}

const loadedPlugins = Object.fromEntries(
  Object.entries(pluginLoaders).map(([key, loader]) => [
    key,
    createLazyPlugin(loader),
  ]),
) as Record<string, LazyExoticComponent<ComponentType<LoadedPluginProps>>>;

const UnknownPlugin = createLazyPlugin(unknownPluginLoader);

const LazyPlugin: FC<Props> = ({ id, pluginKey }) => {
  const Component = loadedPlugins[pluginKey] ?? UnknownPlugin;

  return (
    <Suspense fallback={null}>
      <Component id={id} />
    </Suspense>
  );
};

export default withErrorBoundary(LazyPlugin, {
  FallbackComponent: Crashed,
  onError: (error: unknown) => {
    captureException(error instanceof Error ? error : new Error(String(error)));
  },
});
