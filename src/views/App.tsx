import {
  type FC,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useState,
} from "react";
import { defineMessages, useIntl } from "react-intl";

import { usePushError } from "../api";
import { UiContext } from "../contexts/ui";
import { migrate } from "../db/migrate";
import { cacheStorage, db, dbStorage } from "../db/state";
import { useFavicon, useSystemTheme } from "../hooks";
import { Stream } from "../lib";
import { useValue } from "../lib/db/react";
import Dashboard from "./dashboard";
import Errors from "./shared/Errors";
import StoreError from "./shared/StoreError";

const Settings = lazy(() => import("./settings/Settings"));

const messages = defineMessages({
  pageTitle: {
    id: "app.pageTitle",
    description: "Page title that Tabliss displays in the title bar.",
    defaultMessage: "New Tab",
  },
  saveSettingsError: {
    id: "app.error.saveSettings",
    defaultMessage:
      "Cannot save your settings. You may have hit the maximum storage capacity.",
    description: "Error message when settings cannot be saved",
  },
  openSettingsError: {
    id: "app.error.openSettings",
    defaultMessage:
      "Cannot open settings storage. Your settings cannot be loaded or saved.",
    description: "Error message when settings storage cannot be opened",
  },
  saveCacheWarning: {
    id: "app.error.saveCache",
    defaultMessage: "Cannot save cache. Start up performance may be degraded.",
    description: "Warning message when cache cannot be saved",
  },
  openCacheWarning: {
    id: "app.error.openCache",
    defaultMessage: "Cannot open cache. Start up performance may be degraded.",
    description: "Warning message when cache storage cannot be opened",
  },
});

const Root: FC = () => {
  // Set page title
  const intl = useIntl();
  useEffect(() => {
    document.title = intl.formatMessage(messages.pageTitle);
  }, [intl]);

  // Configuration controls the dashboard shape and must be ready before the
  // first render. Cache hydration continues independently; only plugins that
  // declare a cache dependency wait for it.
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const themePreference = useValue(db, "themePreference");
  const systemIsDark = useSystemTheme();
  const accent = useValue(db, "accent");
  const highlightingEnabled = useValue(db, "highlightingEnabled");

  useEffect(() => {
    const isDark =
      themePreference === "system" ? systemIsDark : themePreference === "dark";
    document.body.classList.toggle("dark", isDark);
    document.body.classList.toggle(
      "no-highlight",
      highlightingEnabled === false,
    );
  }, [themePreference, systemIsDark, highlightingEnabled]);

  // Update CSS variable when accent color changes
  useEffect(() => {
    if (accent) {
      document.documentElement.style.setProperty("--accent-color", accent);
    }
  }, [accent]);

  useFavicon();

  const pushError = usePushError();

  useEffect(() => {
    const handleError =
      (message: string, showError: boolean) => (error: Error) => {
        pushError({ message });
        console.error(error);
        console.error("Caused by:", error.cause);
        if (showError) setError(true);
      };

    let mounted = true;

    const configSubscription = dbStorage
      .then((errors) =>
        Stream.subscribe(
          errors,
          handleError(intl.formatMessage(messages.saveSettingsError), true),
        ),
      )
      .catch(handleError(intl.formatMessage(messages.openSettingsError), true));

    const cacheSubscription = cacheStorage
      .then((errors) =>
        Stream.subscribe(
          errors,
          handleError(intl.formatMessage(messages.saveCacheWarning), false),
        ),
      )
      .catch(handleError(intl.formatMessage(messages.openCacheWarning), false));

    // Migrations depend on configuration, but the first render does not need
    // to wait for the independent cache storage.
    configSubscription
      .then(() => migrate())
      .catch(handleError(intl.formatMessage(messages.openSettingsError), true))
      .then(() => {
        if (mounted) setReady(true);
      });

    return () => {
      mounted = false;
      // Remove error subscriptions
      Promise.all([configSubscription, cacheSubscription]).then(
        ([dbSub, cacheSub]) => {
          if (dbSub) dbSub();
          if (cacheSub) cacheSub();
        },
      );
    };
  }, [intl, pushError]);

  const { errors, settings, toggleErrors } = useContext(UiContext);

  return (
    <>
      {ready ? <Dashboard /> : null}
      {ready && settings ? (
        <Suspense fallback={null}>
          <Settings />
        </Suspense>
      ) : null}
      {errors ? <Errors onClose={toggleErrors} /> : null}
      {error ? <StoreError onClose={() => setError(false)} /> : null}
    </>
  );
};

export default Root;
