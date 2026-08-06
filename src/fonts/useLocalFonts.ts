import { useCallback, useEffect, useState } from "react";

import { FONT_LIBRARY_CHANGED_EVENT, listLocalFonts } from "./store";
import type { LocalFontRecord } from "./types";

type LocalFontsState = {
  fonts: LocalFontRecord[];
  loading: boolean;
  error?: string;
  reload: () => Promise<void>;
};

export function useLocalFonts(): LocalFontsState {
  const [fonts, setFonts] = useState<LocalFontRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const reload = useCallback(async () => {
    try {
      setFonts(await listLocalFonts());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Font library failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const handleChange = () => void reload();
    window.addEventListener(FONT_LIBRARY_CHANGED_EVENT, handleChange);
    return () =>
      window.removeEventListener(FONT_LIBRARY_CHANGED_EVENT, handleChange);
  }, [reload]);

  return { fonts, loading, error, reload };
}
