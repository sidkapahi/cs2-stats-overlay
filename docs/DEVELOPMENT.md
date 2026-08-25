# Development & self-hosting

Everything you need to run CS2 Stats Overlay locally, self-host it, or
contribute. For a plain user guide (build a widget URL, add it to OBS), see the
[README](../README.md).

## Run locally

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

## Build

```bash
npm run build     # tsc + vite build → static output
npm run preview   # preview the production build
```

The output is a plain static site (the customizer and the widget), deployable to
any static host — the project ships with GitHub Pages via a `CNAME`.

## Optional: avatars & custom profile links (Cloudflare Worker)

Leetify's public API doesn't return a player avatar, and a static site can't call
Steam's Web API directly (it needs a secret key and sends no CORS headers). The
small Cloudflare Worker in [`worker/`](../worker) covers both: it fetches avatars
**and** resolves custom `steamcommunity.com/id/…` profile links to a Steam64 ID.
Deploy it and set `VITE_AVATAR_PROXY_URL` to its URL — full steps in
[worker/README.md](../worker/README.md). Your Steam API key stays on the Worker
and never reaches the browser. Skip this and the widget still runs — just without
avatars, and custom-URL links must be entered as a Steam64 ID or a `/profiles/…`
link instead.

## Optional: Twitch live-status (second Cloudflare Worker)

The Twitch session W/L feature uses a **second** Cloudflare Worker
(`worker/twitch-live-proxy.js`, separate from the avatar proxy so the credentials
live apart). Register a Twitch app, deploy the Worker with your
`TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` as secrets, and point the site at it
with `VITE_TWITCH_PROXY_URL`. Full steps in
[worker/README.md](../worker/README.md#twitch-live-status-proxy-cloudflare-worker).
Without it, the pills keep their normal rolling-window behaviour.

## Optional: analytics (PostHog)

Analytics runs on [PostHog](https://posthog.com) — how people find the site
(referrers/UTM), which settings combinations they build, adoption, retention, and
errors. To collect this for your own site:

1. Create a free project at [posthog.com](https://posthog.com).
2. Copy the **Project API Key** (starts with `phc_`) into `VITE_POSTHOG_KEY`, and
   set `VITE_POSTHOG_HOST` to your region (`https://us.i.posthog.com` or
   `https://eu.i.posthog.com`) — in `.env.local` for local dev, and as GitHub
   Actions **repository variables** for the deployed site.

Nothing loads without a key. The **customizer** uses cookie-based analytics but
starts **opted out** — nothing is captured until the visitor accepts the cookie
banner (reviewable via the footer's *Privacy & Cookies* modal). The **overlay**
runs PostHog **cookieless** (no cookies, no storage, no consent banner on stream).

> **The full event reference** — every event, its properties, the reason codes,
> and the automatic PostHog events (`$pageview`, `$web_vitals`, …) — lives in
> [ANALYTICS.md](./ANALYTICS.md).

## Environment variables

| Variable                  | Required | Purpose                                                   |
| ------------------------- | -------- | --------------------------------------------------------- |
| `VITE_LEETIFY_KEY`        | No       | Leetify Public API key — raises rate limits (secret)      |
| `VITE_AVATAR_PROXY_URL`   | No       | Steam avatar / custom-link proxy Worker URL (public)      |
| `VITE_TWITCH_PROXY_URL`   | No       | Twitch live-status proxy Worker URL (public)              |
| `VITE_POSTHOG_KEY`        | No       | PostHog project API key for analytics (public)            |
| `VITE_POSTHOG_HOST`       | No       | PostHog API host / region (default US)                    |

See [`.env.example`](../.env.example) for details on each.

## Project layout

```
src/customizer/   Customizer UI (build & preview widget URLs)
src/widget/       The overlay itself (rendered in OBS / browser source)
src/shared/       API client, rank logic, rendering, session, export helpers
worker/           Optional Cloudflare Workers (avatar + Twitch proxies)
public/           Static assets (fonts, CNAME)
docs/             This guide + the analytics event reference
```

## Tech Stack

| Tool | Purpose |
| ---- | ------- |
| [TypeScript](https://www.typescriptlang.org) | Application logic |
| [Vite](https://vitejs.dev) | Multi-page build & dev server |
| [Leetify API](https://leetify.com) | Live CS2 stats & match data |
| [Cloudflare Workers](https://workers.cloudflare.com) | Optional avatar + Twitch live-status proxies |
| [PostHog](https://posthog.com) | Optional product analytics (consent-gated) |

## Contributing

Issues and PRs are welcome — bug fixes, new display options, and code review of
the AI-assisted parts especially. Open an
[issue](https://github.com/sidkapahi/cs2-stats-overlay/issues) or send a PR.
