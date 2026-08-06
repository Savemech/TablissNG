---
sidebar_position: 6
title: Fdial local builds
---

# Fdial local builds

Run `pnpm release:local` to build both browser targets and create packages in
`dist/packages/`. `release.json` and `SHA256SUMS` describe the exact output.

## Chromium

Unpack `fdial-chromium-2.0.0.zip`, open `chrome://extensions`, enable Developer
mode, choose **Load unpacked**, and select the unpacked directory. The manifest
contains a fork-specific public key, so unpacked copies use the stable extension
ID `iigokkiceigaecnpnojkbpjddodiafii`.

The matching private packaging key is generated locally at
`.keys/fdial-chromium.pem` and is excluded from Git. Back it up securely: losing
it makes it impossible to publish compatible signed updates under that ID.

## Firefox

The local package is named `fdial-firefox-2.0.0-unsigned.xpi` and uses the stable
add-on ID `fdial@savemech.github`. Load it from `about:debugging` → **This
Firefox** → **Load Temporary Add-on** for development. Normal permanent Firefox
installation requires Mozilla signing; submit this package through AMO or run
the signing workflow with your own credentials.

## Google Calendar

OAuth client IDs are intentionally not committed. Set
`GOOGLE_CALENDAR_CLIENT_ID` for Chromium and
`GOOGLE_CALENDAR_FIREFOX_CLIENT_ID` for Firefox before building, or configure a
client ID in Agenda settings and use the PKCE flow. Redirect URLs are shown in
the settings UI.

## Moving Chrome ↔ Firefox

Browser account sync cannot cross vendors. Use **Export** in Fdial settings;
the portable JSON includes settings, Speed Dial order, custom icon originals
and uploaded fonts. Import the same file in the other browser.
