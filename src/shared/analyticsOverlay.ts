// Cookieless overlay analytics. The OBS overlay only needs to fire a few
// anonymous count events, so instead of bundling posthog-js (~120KB gzipped) it
// POSTs straight to PostHog's ingestion endpoint. No cookies, no storage, so
// nothing needs consent and there's no banner on stream.

type Props = Record<string, string | number | boolean>;

const POSTHOG_KEY: string = import.meta.env.VITE_POSTHOG_KEY ?? "";
// Use || (not ??) so an *empty* host falls back to the US default. CI passes an
// empty string (not undefined) when VITE_POSTHOG_HOST is unset; with ?? that
// would make the fetch below POST to a relative "/capture/" on our own origin
// and silently drop every overlay event.
const POSTHOG_HOST: string =
  import.meta.env.VITE_POSTHOG_HOST || "https://us.i.posthog.com";
const ENABLED = !!POSTHOG_KEY;

// Random id, held in memory only and regenerated every load — cookieless by
// construction. Two loads of the same overlay look like two anonymous visitors,
// which is the accepted trade-off for not storing anything.
let distinctId = "";

export function initOverlayAnalytics() {
  if (!ENABLED || distinctId || typeof window === "undefined") return;
  distinctId = crypto.randomUUID?.() ?? `anon-${Math.random().toString(36).slice(2)}`;
}

// Low-level cookieless capture. Properties are loosely typed so structured
// PostHog payloads (e.g. $exception_list, an array of objects) can pass through;
// trackOverlayEvent keeps the strict Props signature for ordinary count events.
function capture(event: string, properties: Record<string, unknown>) {
  if (!ENABLED || !distinctId) return;
  try {
    const body = JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      distinct_id: distinctId,
      // Keep these events anonymous — never create a PostHog person profile.
      properties: { ...properties, $process_person_profile: false },
    });
    // keepalive so an event fired right as the source reloads still sends.
    void fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics must never break the overlay
  }
}

export function trackOverlayEvent(event: string, props?: Props) {
  capture(event, { ...props });
}

// Report a genuinely-unexpected overlay failure to PostHog Error Tracking as a
// `$exception` event, sent over the same cookieless path (no SDK bundled). Only
// used for the buggy reason codes (`other`, `bad_response`) — expected outages
// like api_5xx or no_premier stay plain overlay_error counts and never clutter
// the Issues list. Grouped by `reason` via $exception_fingerprint so each
// failure class is one issue, not one-per-browser-message. Anonymous, and can't
// carry a stack trace worth reading (minified prod, no source maps uploaded) —
// the type/value pair is the useful signal.
export function trackOverlayException(error: unknown, reason: string) {
  const err = error instanceof Error ? error : new Error(String(error));
  capture("$exception", {
    reason,
    $exception_fingerprint: `overlay:${reason}`,
    $exception_list: [
      {
        type: err.name || "Error",
        value: err.message || String(error),
        mechanism: { handled: true, synthetic: false },
      },
    ],
  });
}
