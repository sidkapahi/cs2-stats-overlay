<div align="center">

<img src="assets/header.png?v=2" alt="CS2 Stats Overlay" width="100%" />

# CS2 Stats Overlay

A free OBS / StreamElements overlay that shows your CS2 Premier rating, rank badge, <br/> stats, and recent match history live on stream — powered by the Leetify API.

[![license MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![built with TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/sidkapahi/cs2-stats-overlay/pulls)

<br/>

<a href="https://cs2widget.kapkit.ca/"><img src="assets/create-overlay-button.svg" alt="Use Overlay" height="54"></a>

<br/><br/>

**[How-To Guide](#how-to-guide)** · **[Report a Bug](https://github.com/sidkapahi/cs2-stats-overlay/issues)**

</div>

---

## Overview

CS2 Stats Overlay puts a clean stats card on your stream that stays
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
> **Built with [Claude Code](https://claude.com/claude-code) from a [Figma](https://www.figma.com) design, with security in mind.**
> There's **no login, no accounts, and nothing personal to hand over** — it's a
> static site that only reads your **public** CS2 stats. It's actively used on
> live streams, and I'd love help making it even better — **developers and
> contributors, [PRs are very welcome](https://github.com/sidkapahi/cs2-stats-overlay/pulls)!**

## How-To Guide

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
2. Paste your **Steam profile link** or Steam64 ID (can be found on [SteamID I/O](https://steamid.io/))
3. Toggle what to show — avatar, name, rank badge, rank change, stats, match history
4. Set how many recent matches to show and how often it refreshes
5. Copy the generated **widget URL** (or download the StreamElements bundle — see below)

### Add it to OBS/Streamlabs OBS

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

Running locally, self-hosting, the optional Cloudflare Workers, analytics setup,
environment variables, and contributing are all in
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**. The full analytics event
reference is in **[docs/ANALYTICS.md](docs/ANALYTICS.md)**.

## License

[MIT](LICENSE) © Sid
