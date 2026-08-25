<div align="center">

<img src="assets/header.png?v=2" alt="CS2 Stats Overlay" width="100%" />

# CS2 Stats Overlay

A free OBS / StreamElements overlay that shows your CS2 Premier rating, rank badge, <br/> stats, and recent match history live on stream — powered by the Leetify API.

**Free & open source** · No login, no install for streamers — just paste a URL

[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![built with TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/sidkapahi/cs2-stats-overlay/pulls)

<br/>

<a href="https://cs2widget.kapkit.ca/"><img src="assets/create-overlay-button.svg" alt="Use Overlay" height="54"></a>

<sub>No account, no install — build your widget URL in the browser.</sub>

<br/><br/>

**[How it works](#use-or-create-an-overlay)** · **[Report a Bug](https://github.com/sidkapahi/cs2-stats-overlay/issues)**

</div>

---

## Overview

CS2 Stats Overlay puts a clean, transparent stats card on your stream that stays
up to date on its own. You point it at your Steam profile, pick what to show, and
drop the generated URL into OBS, Streamlabs, or StreamElements. Stats come live
from [Leetify](https://leetify.com) and refresh automatically — no software to
run, no account to make on this site.

**What viewers see:**

- **Live Premier rating** with a per-tier **rank badge** (Gray, Light Blue, Blue,
  Purple, Pink, Red, Gold) — or a plain rank-coloured number if you prefer
- **Rank-point change** from your last Premier match (e.g. `+250`)
- **Win / loss pills** and core stats: win rate, aim rating, K/D
- **Recent match-history strip** (W / L / T)
- **Twitch session W/L** (optional) — resets when you go live, freezes when you
  go offline, so it tracks *today's* stream instead of a rolling window
- **Transparent background** that sits on any layout

Everything is toggleable, so you can run a minimal rating-only badge or the full
stats card — your call.

> [!NOTE]
> This project was built with AI assistance ("vibe coded"). It works and is used
> on live streams, but the code hasn't had a formal security audit. It's a static
> site that only reads public stats — use at your own discretion, and PRs are
> always welcome.

## Use or Create an Overlay

You don't need to install anything to use the overlay. The hosted customizer
builds your URL for you.

### Before you start

You'll need your CS2 stats flowing into Leetify:

- **A [Leetify](https://leetify.com) account** connected to your Steam account,
  with match tracking enabled.
- **A matchmaking share code** so Leetify syncs your matches automatically:
  1. Get your Authentication Code from
     [Steam](https://help.steampowered.com/en/wizard/HelpWithGameIssue?appid=730&issueid=128)
  2. Enter it on Leetify's [Data Sources](https://leetify.com/app/data-sources)
     page under the **Matchmaking** tab
  3. Leetify then picks up your matches shortly after each one finishes
- **Your Steam profile link** (or Steam64 ID). Paste your profile URL into the
  customizer and it pulls the ID out for you. A `steamcommunity.com/profiles/…`
  link or a raw Steam64 ID works out of the box.

### Create your overlay

1. Open the **[customizer](https://cs2widget.kapkit.ca/)**
2. Paste your **Steam profile link** or Steam64 ID
3. Toggle what to show — avatar, name, rank badge, rank change, stats, match history
4. Set how many recent matches to show and how often it refreshes
5. Copy the generated **widget URL** (or download the StreamElements bundle — see below)

### Add it to OBS or Streamlabs

1. Add a new **Browser Source**
2. Paste your widget URL
3. Set the size to about **660 × 180** (adjust to taste)

That's it — the overlay refreshes on its own.

### Add it to StreamElements

Under the widget URL, the customizer has a **Download Zip for StreamElements**
button. It builds a **Custom Widget** bundle (`widget.html`, `widget.css`,
`widget.js`, `fields.json`, `data.json`, plus `widget-url.txt` and a
`README.txt`). Paste each file into its matching tab in the Custom Widget editor
(HTML / CSS / JS / FIELDS / DATA). The fields come pre-filled with your chosen
options and stay editable **inside StreamElements** — Steam ID, toggles, stats,
font, background colour and opacity — so you can tweak the overlay there without
returning to the customizer.

> [!NOTE]
> There's no server behind this site, so it can't push an overlay straight into
> your StreamElements account (that needs a login and a backend). The bundle is
> the file set you paste into the Custom Widget editor, pre-filled to save you
> the manual setup.

### Twitch session win/loss (optional)

By default the W/L pills tally every match in Leetify's recent window. Enter your
**Twitch username** in the customizer and they become a **per-stream record**
instead:

- Resets to `W0 L0` when your channel **goes live**
- Counts only matches finished **during that stream**
- **Freezes** (keeping the last stream's record) when you go **offline**

Your session is saved in the browser, so refreshing the OBS source mid-stream
doesn't lose it. It only reads the **public** "is this channel live?" status —
you never log in.

> This feature relies on a small proxy the project owner hosts. If it's not
> available on the site you're using, the pills fall back to the normal
> rolling-window behaviour.

## Query Parameters

If you'd rather hand-craft the URL, the widget accepts these parameters:

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

## For Developers

Want to run it locally, self-host it, or contribute? Here's the setup.

### Run locally

```bash
npm install
cp .env.example .env.local   # optional: paste your Leetify Public API key
npm run dev
```

- Customizer: `http://localhost:5173/`
- Widget: `http://localhost:5173/widget/`

`VITE_LEETIFY_KEY` is optional — without it, requests still work but hit
Leetify's stricter unauthenticated rate limits. For a deployed site, set the
same name as a **GitHub Actions repository secret** (Settings → Secrets and
variables → Actions) so it's injected into the build.

### Build

```bash
npm run build     # tsc + vite build → static output
npm run preview   # preview the production build
```

The output is a plain static site (the customizer and the widget), deployable to
any static host — the project ships with GitHub Pages via a `CNAME`.

### Optional: avatars & custom profile links (Cloudflare Worker)

Leetify's public API doesn't return a player avatar, and a static site can't call
Steam's Web API directly (it needs a secret key and sends no CORS headers). The
small Cloudflare Worker in [`worker/`](./worker) covers both: it fetches avatars
**and** resolves custom `steamcommunity.com/id/…` profile links to a Steam64 ID.
Deploy it and set `VITE_AVATAR_PROXY_URL` to its URL — full steps in
[worker/README.md](./worker/README.md). Your Steam API key stays on the Worker
and never reaches the browser. Skip this and the widget still runs — just without
avatars, and custom-URL links must be entered as a Steam64 ID or a `/profiles/…`
link instead.

### Optional: Twitch live-status (second Cloudflare Worker)

The Twitch session W/L feature uses a **second** Cloudflare Worker
(`worker/twitch-live-proxy.js`, separate from the avatar proxy so the credentials
live apart). Register a Twitch app, deploy the Worker with your
`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` as secrets, and point the site at it
with `VITE_TWITCH_PROXY_URL`. Full steps in
[worker/README.md](./worker/README.md#twitch-live-status-proxy-cloudflare-worker).
Without it, the pills keep their normal rolling-window behaviour.

### Optional: analytics (PostHog)

Analytics runs on [PostHog](https://posthog.com) — how people find the site
(referrers/UTM), which **settings combinations** they build, adoption,
retention, and errors. To collect this for your own site:

1. Create a free project at [posthog.com](https://posthog.com).
2. Copy the **Project API Key** (starts with `phc_`) into `VITE_POSTHOG_KEY`,
   and set `VITE_POSTHOG_HOST` to your region (`https://us.i.posthog.com` or
   `https://eu.i.posthog.com`) — in `.env.local` for local dev, and as GitHub
   Actions **repository variables** for the deployed site.

Nothing loads without a key. Custom events:

| Event                    | When                                    | Key properties                              | Page      |
| ------------------------ | --------------------------------------- | ------------------------------------------- | --------- |
| `steam_id_entered`       | A Steam ID resolves                     | — (count only)                              | Customizer|
| `twitch_selected`        | A valid Twitch channel is adopted       | — (count only)                              | Customizer|
| `social_click`           | A header link is clicked                | `target` (github/kofi/twitch)               | Customizer|
| `preview_error`          | A preview fails to load                 | `stage` (resolve/stats), `reason`           | Customizer|
| `widget_url_copied`      | "Copy URL" clicked                      | `combo`, `font`, `stats`, `showBadge`, …    | Customizer|
| `export_zip_downloaded`  | "Export ZIP" clicked                    | `combo`, `font`, `stats`, `showBadge`, …    | Customizer|
| `overlay_active`         | The overlay loads (in OBS)              | `twitch`                                    | Overlay   |
| `twitch_session_started` | The stream goes live (new W/L session)  | — (count only)                              | Overlay   |
| `overlay_error`          | A stats fetch fails (per outage)        | `reason`                                    | Overlay   |

**Cookies & consent:** the **customizer** uses cookie-based analytics but starts
**opted out** — nothing is captured until the visitor accepts the cookie banner
(they can review/change the choice via the footer's *Privacy & Cookies* modal).
The **overlay** runs PostHog **cookieless** (memory persistence — no cookies, no
storage, no consent banner on stream); the trade-off is overlay loads aren't
linked across sessions, so `overlay_active` is a count, not a unique-user figure.

**Adoption:** `twitch_selected` counts how many people turn on Twitch mode; the
copy/export events also carry a `usesTwitch` property.

**Reliability:** `preview_error` / `overlay_error` turn otherwise-silent failures
into a signal. `reason` is a coarse code — `api_5xx` / `api_rate_limited`
(Leetify down or throttling), `no_premier` (visitor has no Premier data — not a
bug), `vanity_not_found`, `resolver_error`, `other`. `overlay_error` fires once
per outage episode, not per poll.

No event sends the Steam ID or Twitch channel. To find the **most common setup**,
open PostHog → the event → break down by the `combo` property: each value is a
whole configuration (e.g. `badge=1&history=1&stats=kd,avg,winpct`). PostHog
captures `utm_*` params automatically, so any `?utm_source=…` link you share is
attributed with no extra setup.

### Environment variables

| Variable                  | Required | Purpose                                                   |
| ------------------------- | -------- | --------------------------------------------------------- |
| `VITE_LEETIFY_KEY`        | No       | Leetify Public API key — raises rate limits (secret)      |
| `VITE_AVATAR_PROXY_URL`   | No       | Steam avatar / custom-link proxy Worker URL (public)      |
| `VITE_TWITCH_PROXY_URL`   | No       | Twitch live-status proxy Worker URL (public)              |
| `VITE_POSTHOG_KEY`        | No       | PostHog project API key for analytics (public)            |
| `VITE_POSTHOG_HOST`       | No       | PostHog API host / region (default US)                    |

See [`.env.example`](.env.example) for details on each.

### Project layout

```
src/customizer/   Customizer UI (build & preview widget URLs)
src/widget/       The overlay itself (rendered in OBS / browser source)
src/shared/       API client, rank logic, rendering, session, export helpers
worker/           Optional Cloudflare Workers (avatar + Twitch proxies)
public/           Static assets (fonts, CNAME)
```

### Tech Stack

| Tool | Purpose |
| ---- | ------- |
| [TypeScript](https://www.typescriptlang.org) | Application logic |
| [Vite](https://vitejs.dev) | Multi-page build & dev server |
| [Leetify API](https://leetify.com) | Live CS2 stats & match data |
| [Cloudflare Workers](https://workers.cloudflare.com) | Optional avatar + Twitch live-status proxies |
| [PostHog](https://posthog.com) | Optional product analytics (consent-gated) |

### Contributing

Issues and PRs are welcome — bug fixes, new display options, and code review of
the AI-assisted parts especially. Open an
[issue](https://github.com/sidkapahi/cs2-stats-overlay/issues) or send a PR.

## License

[MIT](LICENSE) © Sid
