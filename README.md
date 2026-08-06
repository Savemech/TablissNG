<p align="left">
  <img src="src/views/shared/tabliss.svg" alt="Fdial logo" width="400" />
</p>

> A fast, private and portable New Tab dashboard for Firefox and Chromium.

<img src="screenshots/screenshot_1.png" width="49%"/> <img src="screenshots/screenshot_2.png" width="50%"/>
<img src="screenshots/screenshot_3.png" width="49%"/> <img src="screenshots/screenshot_4.png" width="50%"/>
<img src="screenshots/screenshot_5.png" width="24%"/>
<img src="screenshots/screenshot_6.png" width="24%"/>
<img src="screenshots/screenshot_7.png" width="24%"/>
<img src="screenshots/screenshot_8.png" width="24%"/>

<div align="center">
    <a href="https://github.com/Savemech/TablissNG/stargazers">
        <img src="https://img.shields.io/github/stars/Savemech/TablissNG?style=flat"></a>
    <a href="https://github.com/Savemech/TablissNG/commits/fdial/main/">
        <img src="https://img.shields.io/github/last-commit/Savemech/TablissNG/fdial/main?color=0779ba"></a>
    <a href="https://www.gnu.org/licenses/gpl-3.0">
        <img src="https://img.shields.io/badge/License-GNU%20GPL%20v3-blue"></a>
</div>

## Fdial 2

Fdial is a GPL-3.0 fork of TablissNG focused on a small, fast startup core and
offline-first browser integration. It keeps the mature widget system while
adding a portable Speed Dial and Agenda suitable for moving from Chrome to
Firefox.

Highlights:

- Responsive 32–128 px Speed Dial tiles, folders and drag-and-drop ordering.
- Direct/private favicon fetching, manual icons, local cache and bounded sync.
- Multi-feed iCal Agenda and Google Calendar read-only OAuth/PKCE.
- Offline daypart background gallery with morning/day/evening/night schedules.
- Automatic black/white text contrast and opposite outline.
- Font presets plus local WOFF2/WOFF/TTF/OTF uploads.
- Live browser settings sync and a Chrome ↔ Firefox portable asset backup.
- Lazy widget/background chunks and background network jobs with strict size
  budgets.

The original Tabliss and TablissNG authors and contributors retain their
copyright; see the Git history and GPL license.

## Inherited TablissNG features

Fdial retains the broad TablissNG widget and customization library.

- Customization
  - Support for custom search engines and browser defaults
  - Many more style options in display/font settings (eg. scale, underline, text outline, custom css class)

- Widgets
  - Time Tracker, Bitcoin Mempool, Top Sites, Binary Clock, Bookmarks, Custom HTML.
  - Enhancements: Daily Routine for Todos, Bible verses in Quotes, Markdown in Notes
  - "Free Move" mode for dragging widgets

- Backgrounds & Visuals
  - Wikimedia Image of the Day, NASA APOD, Giphy Image of the Day
  - Support for Videos, GIFs, and online image URLs
  - Automatic night dimming and random gradients

- Interface & Accessibility
  - Full dark mode
  - Complete translation support for all settings

## Installation

Run `pnpm release:local`. Ready-to-load Chromium and unsigned Firefox packages,
checksums and a release manifest are written to `dist/packages/`. See
[Fdial local builds](docs/docs/getting-started/installation/fdial-local-builds.md)
for browser instructions, stable extension IDs, Firefox signing and Google
Calendar OAuth configuration.

## Running Locally

For local development, you'll need Node.js and pnpm installed. Latest versions should work.

First, clone the repo:

```sh
git clone https://github.com/Savemech/TablissNG.git
cd TablissNG
git switch fdial/main
```

Then install the dependencies:

```sh
pnpm install
```

### Available Commands

- `pnpm run dev` — Start a local development server
- `pnpm run build` — Build the project
- `pnpm run release:local` — Build and package Chromium + Firefox
- `pnpm run test` — Run tests
- `pnpm run translations` — Extract and sync translation files (see [TRANSLATING.md](TRANSLATING.md) for details)
- `pnpm run translations status` — Show translation status (pass language, e.g. `pnpm run translations status fr`)
- `pnpm run translations create` — Create a new locale file (pass language, e.g. `pnpm run translations create de-AT`)
- `pnpm run translations migrate` — Migrate renamed translation keys (e.g. `pnpm run translations migrate --map old.id=new.id`)
- `pnpm run lint:fix` — Run ESLint with --fix (or just `pnpm run lint` for checking)
- `pnpm run prettier` — Run Prettier with --write (or `pnpm run prettier:check` for checking)
- `pnpm run deps:update` — Run interactive dependency update tool (or `pnpm run deps:check` to just check for updates and unused dependencies)

By default, build and dev will target the web version. To specify a platform (Chromium or Firefox), append `:chromium` or `:firefox` to the command. For example:

```sh
pnpm run dev:chromium
pnpm run build:firefox
```

<details>
  <summary>To test extension locally</summary>
  <br>
  <p>Find the extension in <code>dist</code> folder.</p>

  <p>For Chrome, go to <code>chrome://extensions</code>, turn on devoloper mode and click on "Load unpacked".</p>

  <p>For Firefox, go to <code>about:debugging#/runtime/this-firefox</code> and click on "Load Temporary Add-on".</p>
</details>

### Environment variables

To develop with external services, you'll need to sign up for API keys and enter them into your `.env` file. Start by copying the example:

```sh
cp .env.example .env
```

Then, fill in your API keys:

```ini
GIPHY_API_KEY=your_key_here
UNSPLASH_API_KEY=your_key_here
NASA_API_KEY=your_key_here
TRELLO_API_KEY=your_key_here # this requires the correct redirect URI to be set up in your Trello app settings: https://53dad6be72180770ccc08f0a6e2fc8a64dcf7b42.extensions.allizom.org and https://dlaogejjiafeobgofajdlkkhjlignalk.chromiumapp.org should work for firefox and chromium respectively.
GOOGLE_CALENDAR_CLIENT_ID=your_chromium_extension_oauth_client_id
GOOGLE_CALENDAR_FIREFOX_CLIENT_ID=your_firefox_desktop_oauth_client_id
```

The Agenda widget can use Google Calendar with read-only scopes. Chromium's
client ID is embedded in the generated manifest and must be a Google Cloud
Chrome Extension OAuth client associated with this extension ID. Firefox uses
PKCE with a Desktop app client; when no Firefox client is compiled in, it can
be entered locally in the widget settings. OAuth tokens and calendar data are
kept in extension-local storage.

## Credits

Special thanks to **joelshepherd** for originally creating and maintaining this project.
Also, huge appreciation to everyone who contributed, especially those whose pull requests I merged!

<a href="https://github.com/BookCatKid/TablissNG/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=BookCatKid/TablissNG&max=30" />
</a>

## Contributing

Take a look at the guide to [contributing](CONTRIBUTING.md) before starting.

## Translations

Check out the guide to [adding translations](TRANSLATING.md).
