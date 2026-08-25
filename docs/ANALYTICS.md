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

Nothing is sent with the Steam ID. The Twitch **channel** (a public handle) is
the only identifying value we attach anywhere.

---

## Customizer events (our own)

| Event | Fires when | Properties |
| --- | --- | --- |
| `steam_id_entered` | A typed Steam ID / profile link successfully resolves | — |
| `twitch_selected` | A valid Twitch channel is entered (once per new channel) | `channel` — the public Twitch handle |
| `social_click` | A header link is clicked | `target` — `github` \| `kofi` \| `twitch` |
| `preview_error` | The live preview fails to load | `stage` — `resolve` \| `stats`; `reason` — see [reason codes](#error-reason-codes) |
| `widget_url_copied` | "Copy URL" is clicked | the [settings properties](#settings-properties) |
| `export_zip_downloaded` | "Export ZIP" is clicked | the [settings properties](#settings-properties) |

## Overlay events (our own, cookieless)

| Event | Fires when | Properties |
| --- | --- | --- |
| `overlay_active` | The overlay loads in OBS (once per load) | `twitch` — `true` if Twitch session mode is on |
| `twitch_session_started` | The stream goes live and a new W/L session begins (once per go-live; an OBS refresh doesn't re-count) | — |
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
| `usesTwitch` | `true` if a Twitch channel is set (the channel itself is **not** in these events) |

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
| `other` | Anything uncategorized | Investigate |

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

## Where things live

| File | Role |
| --- | --- |
| [`src/shared/analytics.ts`](../src/shared/analytics.ts) | Customizer PostHog init + consent + `trackEvent` |
| [`src/shared/analyticsOverlay.ts`](../src/shared/analyticsOverlay.ts) | Cookieless overlay capture |
| [`src/customizer/customizer.ts`](../src/customizer/customizer.ts) | Fires the customizer events + the consent banner/modal |
| [`src/widget/widget.ts`](../src/widget/widget.ts) | Fires the overlay events |

_Last updated: 2026-08-25._
