---
title: Local and built-in fonts
sidebar_position: 3
---

# Local and built-in fonts

Open a widget's **Font Settings** to choose a system, humanist, serif,
monospace, rounded, or display stack. The custom family field remains
available for CSS font stacks and OpenType feature suffixes.

You can also upload WOFF2, WOFF, TTF, or OTF files directly. TablissNG stores
up to 20 local fonts, with a 6 MiB limit per file. Font binaries stay in the
browser's local IndexedDB and are never written to browser sync; a second
device falls back to its available fonts until the same file is uploaded
there.

Uploaded fonts use an internal CSS family name, so file names cannot inject
CSS. They are loaded after the dashboard starts and do not block the new-tab
critical path.
