<div align="center">

<img src="assets/header.png?v=2" alt="CS2 Stats Overlay" width="100%" />

# CS2 Stats Overlay

An OBS browser-source widget that shows your CS2 Premier rating, rank badge, <br/> stats, and recent match history — powered by the Leetify API.

**Free & open source** · Built with [TypeScript](https://www.typescriptlang.org) and [Vite](https://vitejs.dev)

[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![built with TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/sidkapahi/cs2-stats-overlay/pulls)

**[Open Customizer](https://sidkapahi.github.io/cs2-stats-overlay/)** · **[Report a Bug](https://github.com/sidkapahi/cs2-stats-overlay/issues)**

</div>

> [!WARNING]
> **This project was built with AI assistance (vibe coded).** While it works, the
> code hasn't been professionally audited — use at your own risk. If you get a
> chance, feel free to review the code before deploying. PRs and fixes are always
> welcome. Thank You!

## Overview

CS2 Stats Overlay renders a compact, transparent stats card you can drop straight
into OBS as a Browser Source. Data is fetched live from the
[Leetify API](https://leetify.com).

- **Live Premier rating** with a per-tier **rank badge** (Gray, Light Blue, Blue,
  Purple, Pink, Red, Gold) — or a plain rank-coloured number when the badge is off
- **Rank-point change** from your last Premier match (e.g. `+250`)
- **Win / loss pills** and core stats: win rate, aim rating, K/D
- **Twitch session W/L** (optional) — enter your Twitch name and the W/L resets
  when you go live and freezes when you go offline (see below)
- **Recent match-history strip** (W / L / T)
- **Customizer UI** to configure options and generate widget URLs
- **Auto-refresh** on a configurable interval
- **Transparent background** — works on any stream layout

## Getting Started

```bash
npm install
cp .env.example .env.local   # then paste your Leetify Public API key
npm run dev
```

The customizer runs at `http://localhost:5173/` and the widget at `http://localhost:5173/widget/`.

`VITE_LEETIFY_KEY` is optional locally — without it, requests still work but hit
Leetify's stricter unauthenticated rate limits. For the deployed site, set the
same name as a **GitHub Actions repository secret** (Settings → Secrets and
variables → Actions) so it's injected into the build.

## Requirements

- **Leetify account** with match tracking enabled — create one at
  [leetify.com](https://leetify.com) and make sure your profile is connected to Steam
- **Matchmaking share code** — required for Leetify to automatically sync your
  matches. Without it, data updates will be delayed.
  1. Get your Authentication Code from [Steam](https://help.steampowered.com/en/wizard/HelpWithGameIssue?appid=730&issueid=128)
  2. Enter it on Leetify's [Data Sources](https://leetify.com/app/data-sources) page under the Matchmaking tab
  3. Once active, Leetify will pick up your matches shortly after they finish
- **Steam64 ID or profile link** — paste your Steam profile URL straight into
  the customizer and it pulls out the Steam64 ID for you. A
  `steamcommunity.com/profiles/…` link (or a raw Steam64 ID) works out of the
  box; a custom `steamcommunity.com/id/…` link needs the optional Steam proxy
  Worker deployed (see below). You can still look up a raw ID at
  [steamid.io](https://steamid.io) if you prefer.

## Usage

1. Open the [customizer](https://sidkapahi.github.io/cs2-stats-overlay/)
2. Enter your Steam64 ID or paste your Steam profile link
3. Toggle display options (avatar, name, rank badge, rank change, stats, match history)
4. Set the number of recent matches and refresh interval
5. Copy the generated widget URL
6. In OBS, add a **Browser Source** and paste the URL
7. Set the recommended size to **660 × 180** (adjust as needed)

### Add to your stream (StreamElements Custom Widget)

Under the widget URL, the customizer has a **Download Zip for StreamElements**
button. It grabs a **StreamElements Custom Widget** bundle (`widget.html`,
`widget.css`, `widget.js`, `fields.json`, `data.json`, plus `widget-url.txt` and
a `README.txt`). Paste each file into its matching tab in the Custom Widget
editor (HTML / CSS / JS / FIELDS / DATA). The fields come pre-filled with your
chosen options and stay editable **inside StreamElements** — Steam ID, toggles,
stats, font, background colour and opacity — so you can tweak the overlay there
without coming back to the customizer.

Prefer OBS or Streamlabs? Just copy the **widget URL** above and add it as a
**Browser Source** (recommended size 660 × 180).

> [!NOTE]
> There's no server behind this site, so it can't push an overlay straight into
> your StreamElements account (that needs an account login and a backend). The
> bundle is the file set you paste into the Custom Widget editor, pre-filled to
> save you the manual setup.

## Query Parameters

The widget URL supports these parameters:

| Parameter    | Default | Description                        |
| ------------ | ------- | ---------------------------------- |
| `steamId`    | —       | Steam64 ID (required)              |
| `twitch`     | —       | Twitch login → session-scoped W/L  |
| `avatar`     | `1`     | Show avatar (`0` to hide)          |
| `name`       | `1`     | Show player name                   |
| `badge`      | `1`     | Show rank badge (`0` for plain)    |
| `change`     | `1`     | Show rank-point change (+/-)       |
| `stats`      | `1`     | Show WIN%, AIM, K/D                 |
| `history`    | `1`     | Show W/L/T match history            |
| `matchCount` | `10`    | Number of recent matches           |
| `refresh`    | `60`    | Refresh interval in seconds        |

## Player Avatars & custom profile links (optional)

Leetify's public API doesn't return a player avatar, and this static site can't
call Steam's Web API directly (it needs a secret key and sends no CORS headers).
The small Cloudflare Worker in [`worker/`](./worker) covers both: it fetches
avatars **and** resolves custom `steamcommunity.com/id/…` profile links to a
Steam64 ID. Deploy it and set `VITE_AVATAR_PROXY_URL` to its URL — full steps in
[worker/README.md](./worker/README.md). Your Steam API key stays on the Worker
and never reaches the browser. Skip this and the widget still runs — just without
avatars, and custom-URL links must be entered as a Steam64 ID or a
`/profiles/…` link instead.

## Twitch session win/loss (optional)

By default the W/L pills tally every match in Leetify's recent window. Enter your
**Twitch username** in the customizer and they become a **per-stream record**
instead:

- Resets to `W0 L0` when your channel **goes live**
- Counts only matches finished **during that stream**
- **Freezes** (keeping the last stream's record) when you **go offline**

State is kept per player in the browser's `localStorage`, so refreshing the OBS
source mid-stream doesn't lose your session. Live status is polled every ~15
seconds, independent of the slower stats refresh. The streamer never logs in —
it only reads the **public** "is this channel live?" status, using the username
as a lookup key.

This uses a **second Cloudflare Worker** (`worker/twitch-live-proxy.js`, separate
from the avatar proxy so the credentials live apart). You register a Twitch app,
deploy the Worker with your `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` as
secrets, and point the site at it with `VITE_TWITCH_PROXY_URL`. Full steps in
[worker/README.md](./worker/README.md#twitch-live-status-proxy-cloudflare-worker).
Without it, the pills simply keep their normal rolling-window behaviour.

## Tech Stack

| Tool | Purpose |
| ---- | ------- |
| [TypeScript](https://www.typescriptlang.org) | Application logic |
| [Vite](https://vitejs.dev) | Multi-page build & dev server |
| [Leetify API](https://leetify.com) | Live CS2 stats & match data |
| [Cloudflare Workers](https://workers.cloudflare.com) | Optional avatar + Twitch live-status proxies |

## License

[MIT](LICENSE) © Sid
