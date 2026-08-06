import type { Config } from "./types";

export type PluginLoader = () => Promise<{ default: Config }>;

const loaders: Record<string, PluginLoader> = {
  "background/apod": () => import("./backgrounds/apod"),
  "background/bing": () => import("./backgrounds/bing"),
  "background/colour": () => import("./backgrounds/colour"),
  "background/giphy": () => import("./backgrounds/giphy"),
  "background/gradient": () => import("./backgrounds/gradient"),
  "background/image": () => import("./backgrounds/media"),
  "background/online": () => import("./backgrounds/online"),
  "background/unsplash": () => import("./backgrounds/unsplash"),
  "background/wikimedia": () => import("./backgrounds/wikimedia"),
  "widget/binaryTime": () => import("./widgets/binaryTime"),
  "widget/bitcoin": () => import("./widgets/bitcoin"),
  "widget/countdown": () => import("./widgets/countdown"),
  "widget/css": () => import("./widgets/css"),
  "widget/currencyRates": () => import("./widgets/currencyRates"),
  "widget/customText": () => import("./widgets/customText"),
  "widget/github": () => import("./widgets/github"),
  "widget/greeting": () => import("./widgets/greeting"),
  "widget/html": () => import("./widgets/html"),
  "widget/ipInfo": () => import("./widgets/ipInfo"),
  "widget/joke": () => import("./widgets/joke"),
  "widget/leetcode": () => import("./widgets/leetcode"),
  "widget/links": () => import("./widgets/links"),
  "widget/literature-clock": () => import("./widgets/literatureClock"),
  "widget/message": () => import("./widgets/message"),
  "widget/notes": () => import("./widgets/notes"),
  "widget/palette": () => import("./widgets/palette"),
  "widget/quote": () => import("./widgets/quote"),
  "widget/search": () => import("./widgets/search"),
  "widget/since": () => import("./widgets/since"),
  "widget/tallyCounter": () => import("./widgets/tallyCounter"),
  "widget/time": () => import("./widgets/time"),
  "widget/timeTracker": () => import("./widgets/timeTracker"),
  "widget/todo": () => import("./widgets/todo"),
  "widget/weather": () => import("./widgets/weather"),
  "widget/workHours": () => import("./widgets/workHours"),
};

if (BUILD_TARGET === "web") {
  loaders["widget/js"] = () => import("./widgets/js");
}

if (BUILD_TARGET !== "web" && BUILD_TARGET !== "safari") {
  loaders["widget/bookmarks"] = () => import("./widgets/bookmarks");
  loaders["widget/speedDial"] = () => import("./widgets/speedDial");
  loaders["widget/topSites"] = () => import("./widgets/topSites");
  loaders["widget/trello"] = () => import("./widgets/trello");
}

export const pluginLoaders: Readonly<Record<string, PluginLoader>> = loaders;

export const unknownPluginLoader: PluginLoader = () =>
  import("./widgets/unknown").then(({ config }) => ({ default: config }));

export function getPluginLoader(key: string): PluginLoader {
  return pluginLoaders[key] ?? unknownPluginLoader;
}
