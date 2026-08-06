import { type FC, useEffect } from "react";

import { useLocalFonts } from "./useLocalFonts";

const LocalFontRegistry: FC = () => {
  const { fonts } = useLocalFonts();

  useEffect(() => {
    if (typeof FontFace === "undefined" || !document.fonts) return;
    let disposed = false;
    const loaded: Array<{ face: FontFace; url: string }> = [];
    for (const font of fonts) {
      const url = URL.createObjectURL(font.blob);
      const face = new FontFace(font.family, `url(${JSON.stringify(url)})`, {
        display: "swap",
      });
      loaded.push({ face, url });
      void face
        .load()
        .then((ready) => {
          if (!disposed) document.fonts.add(ready);
        })
        .catch(() => undefined);
    }
    return () => {
      disposed = true;
      for (const { face, url } of loaded) {
        document.fonts.delete(face);
        URL.revokeObjectURL(url);
      }
    };
  }, [fonts]);

  return null;
};

export default LocalFontRegistry;
