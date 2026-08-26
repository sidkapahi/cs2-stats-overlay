# Analytics events reference

Every "ping" this app sends to PostHog, and what it means. There are two
surfaces:

- **Customizer** — the web page at the root. Uses `posthog-js`, **cookie-based**,
  and starts **opted out**: nothing is sent until the visitor explicitly clicks
  **Accept** on the consent banner (or in the Privacy & Cookies modal). Code:
  [`src/shared/analytics.ts`](../src/shared/analytics.ts).
- **Overlay** — the OBS browser source at `/widget/`. **Cookieless**: it POSTs a
  few anonymous events straight to PostHog with an in-memory random id, no
  cookies, no consent needed. Code:
  [`src/shared/analyticsOverlay.ts`](../src/shared/analyticsOverlay.ts).

Two kinds of events show up in PostHog:

- **`snake_case`** names → **our custom events** (listed below).
- **`$`-prefixed** names (e.g. `$pageview`, `$web_vitals`) → **PostHog's automatic
  events**. We didn't write these; PostHog's library sends them. See
  [PostHog automatic events](#posthog-automatic-events).

Nothing is sent with the Steam ID. The live **channel** (a public Twitch,
YouTube, or Kick handle) is the only identifying value we attach anywhere.

---

## Customizer events (our own)

| Event | Fires when | Properties |
| --- | --- | --- |
| `steam_id_entered` | A typed Steam ID / profile link successfully resolves | — |
| `live_selected` | A valid live channel is entered (once per new channel) | `platform` — `twitch` \| `youtube` \| `kick`; `channel` — the public handle |
| `social_click` | A header link is clicked | `target` — `github` \| `kofi` \| `twitch` |
| `preview_error` | The live preview fails to load | `stage` — `resolve` \| `stats`; `reason` — see [reason codes](#error-reason-codes) |
| `widget_url_copied` | "Copy URL" is clicked | the [settings properties](#settings-properties) |
| `export_zip_downloaded` | "Export ZIP" is clicked | the [settings properties](#settings-properties) |

## Overlay events (our own, cookieless)

| Event | Fires when | Properties |
| --- | --- | --- |
| `overlay_active` | The overlay loads in OBS (once per load) | `live` — `true` if a live session is active; `platform` — `twitch` \| `youtube` \| `kick` \| `''` |
| `live_session_started` | The stream goes live and a new W/L session begins (once per go-live; an OBS refresh doesn't re-count) | `platform` — the live platform |
| `overlay_error` | A stats fetch fails — fires **once per outage episode**, not every poll | `reason` — see [reason codes](#error-reason-codes) |

> The overlay is cookieless, so each load looks like a new anonymous visitor.
> These are **counts**, not unique-user figures.

---

## Settings properties

`widget_url_copied` and `export_zip_downloaded` describe the exact widget
someone built:

| Property | Meaning |
| --- | --- |
| `combo` | The **whole configuration** as one stable string (e.g. `badge=1&history=1&stats=kd,avg,winpct&font=Roboto`). Break down by this in PostHog to rank the most popular setups. |
| `font` | Chosen font |
| `fontWeight` | Chosen font weight (100–900) |
| `stats` | Comma list of chosen stats, or `off` if the stats block is hidden |
| `showBadge` | Rank badge on/off |
| `showMatchHistory` | Match-history strip on/off |
| `showWinLoss` | W/L pills on/off |
| `showChange` | Rating-change indicator on/off |
| `matchCount` | How many recent matches are considered |
| `bgOpacity` | Background opacity (0–100) |
| `usesLive` | `true` if a live channel is set (the channel itself is **not** in these events) |
| `livePlatform` | The live platform (`twitch` \| `youtube` \| `kick`), or `''` when no live session |

## Error reason codes

Attached as `reason` on `preview_error` and `overlay_error`:

| `reason` | Meaning | Actionable? |
| --- | --- | --- |
| `api_5xx` | Leetify returned a 5xx — their API is down/erroring | Yes — real outage |
| `api_rate_limited` | Leetify returned 429 — we're being throttled | Yes — consider a Leetify API key |
| `api_404` | Leetify returned 404 | Maybe |
| `api_<status>` | Any other Leetify HTTP status | Depends |
| `no_premier` | The profile has no Premier data | No — expected user state, not a bug |
| `vanity_not_found` | A custom `/id/` vanity URL didn't resolve | No — user typo |
| `resolver_error` | The Steam vanity-resolver proxy is unreachable/misconfigured | Yes — check the Worker |
| `network_error` | The `fetch()` itself failed (dropped connection, DNS, CORS, timeout) — no HTTP status, request never reached Leetify | Usually no — a client-side connectivity blip; watch the *rate*, not one event |
| `bad_response` | Leetify returned 200 but the body was unparseable or an unexpected shape | Yes — a bug or a Leetify payload change |
| `other` | Anything uncategorized | Yes — investigate |

## Error Tracking (PostHog Issues)

Most reason codes are *operational counts* — an outage (`api_5xx`), throttling
(`api_rate_limited`), or an expected user state (`no_premier`, `vanity_not_found`)
is something to measure, not a code bug to triage. Those stay plain
`overlay_error` / `preview_error` events and never enter the Issues list.

The two reasons that mean *our code hit something it didn't expect* — `other`
and `bad_response` — are **additionally** reported to
[PostHog Error Tracking](https://posthog.com/docs/error-tracking) as `$exception`
events:

- **Overlay** — has no posthog-js bundled, so it POSTs a hand-built `$exception`
  (via `trackOverlayException` in `analyticsOverlay.ts`) over the same cookieless
  path. Grouped by `reason` (`$exception_fingerprint: overlay:<reason>`), so each
  failure class is one issue. Anonymous, no stack trace (minified prod).
- **Customizer** — uses posthog-js, so `capture_exceptions: true` autocaptures
  uncaught errors / unhandled rejections, and `captureException()` reports the
  caught buggy-reason failures. Consent-gated like everything else — nothing
  sends until the visitor accepts the banner.

---

## PostHog automatic events

These appear in PostHog even though we never call them — `posthog-js` sends them
on the **customizer** (the overlay sends none of these). They're the `$`-prefixed
events you'll see mixed in:

| Event | What it is |
| --- | --- |
| `$pageview` | A customizer page load. Powers visitor counts and referrer/UTM attribution. |
| `$pageleave` | Fires when the visitor leaves the page (used for bounce/time-on-page). |
| `$web_vitals` | Browser performance metrics (LCP, FCP, CLS, INP) — Google's Core Web Vitals, batched per page. This is the "web vitals" you saw. |
| `$opt_in` | Recorded the moment the visitor consents (when we call PostHog's opt-in). One per acceptance. |

We **have disabled** several other PostHog defaults, so you should **not** see:
`$autocapture` / `$rageclick` (autocapture off), `$feature_flag_called` (feature
flags off), and `$snapshot` (session recording off).

### Turning the automatic ones off

If `$web_vitals` / `$pageview` noise bothers you, they're config flags in
[`src/shared/analytics.ts`](../src/shared/analytics.ts):

- Web vitals: add `capture_performance: { web_vitals: false }`
- Pageviews: add `capture_pageview: false` (you'd lose referrer/UTM auto-capture)
- Page leaves: add `capture_pageleave: false`

Ask and it's a one-line change — but `$pageview` is what gives you
acquisition/referrers, so it's usually worth keeping.

---

## Reverse proxy (optional)

PostHog's **Installation health → Reverse proxy** check flags that events go
straight to `us.i.posthog.com`, a host ad/tracking blockers block — so some
visitors' events never arrive. Routing analytics through a subdomain of **your
own** domain fixes it: blockers see same-origin requests and leave them alone.

The simplest way is PostHog's own **Managed reverse proxy** (Settings → project
→ *Managed reverse proxy*) — PostHog hosts it and handles TLS; you just add a
CNAME. No Worker needed.

1. **Add a generic subdomain** in PostHog, e.g. `t.kapkit.ca`. **Do not** use
   `ph.`, `posthog.`, or `analytics.` — those are themselves on blocklists and
   defeat the purpose (PostHog warns about this on that screen).
2. **Add the CNAME** PostHog gives you in Cloudflare DNS, set to **DNS-only
   (grey cloud)** — PostHog terminates TLS, so it must *not* be Cloudflare-
   proxied. Wait for its status to go green.
3. **Point the app at it** via the repository **variable**
   `VITE_POSTHOG_HOST = https://t.kapkit.ca` (a bare subdomain, **no path**;
   see [`.env.example`](../.env.example)). Re-run the deploy workflow so the new
   host is baked into the bundle.

Both surfaces pick this up automatically: the customizer's `posthog-js`
(`api_host`) and the cookieless overlay (which POSTs to `${host}/capture/`).
[`analytics.ts`](../src/shared/analytics.ts) also detects the custom host and
sets PostHog's `ui_host`, so the customizer's toolbar / "open in PostHog" links
still reach the real app. **EU forks:** set that `ui_host` to
`https://eu.posthog.com`.

To undo, clear `VITE_POSTHOG_HOST` (it falls back to `us.i.posthog.com`) and
remove the managed-proxy domain + CNAME.

---

## Where things live

| File | Role |
| --- | --- |
| [`src/shared/analytics.ts`](../src/shared/analytics.ts) | Customizer PostHog init + consent + `trackEvent` |
| [`src/shared/analyticsOverlay.ts`](../src/shared/analyticsOverlay.ts) | Cookieless overlay capture |
| [`src/customizer/customizer.ts`](../src/customizer/customizer.ts) | Fires the customizer events + the consent banner/modal |
| [`src/widget/widget.ts`](../src/widget/widget.ts) | Fires the overlay events |

_Last updated: 2026-08-26._
