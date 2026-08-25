declare global {
  interface Window {
    // Umami's tracking API, present once cloud.umami.is/script.js has loaded.
    // Custom events take a name plus an optional flat bag of properties; Umami
    // shows each property under the event's "Properties" breakdown.
    umami?: {
      track: (
        event: string,
        data?: Record<string, string | number | boolean>,
      ) => void;
    };
  }
}

type Props = Record<string, string | number | boolean>;

// Umami website ID, injected by Vite from the env var at build time. Empty when
// unset — which is the case for forks and local dev without their own account.
const UMAMI_WEBSITE_ID: string = import.meta.env.VITE_UMAMI_WEBSITE_ID ?? "";
const UMAMI_SRC = "https://cloud.umami.is/script.js";
const ENABLED = !!UMAMI_WEBSITE_ID;

// Umami's script is deferred, so window.umami isn't ready the instant the page
// loads. Events fired before then (e.g. overlay_active on load) are buffered
// here and flushed once the tracker is available.
const queue: Array<[string, Props | undefined]> = [];

function flush() {
  if (!window.umami?.track) return;
  for (const [event, props] of queue) {
    try {
      window.umami.track(event, props);
    } catch {
      // analytics must never break the app
    }
  }
  queue.length = 0;
}

// Loads Umami's script — but only when an ID is configured, so nothing is
// fetched (and no events are sent) unless the site owner has set
// VITE_UMAMI_WEBSITE_ID. Each entry point calls this once.
//
// autoTrack defaults to true (the customizer wants automatic pageviews so it
// gets visitor counts and referrers/UTM for free). The overlay passes
// autoTrack=false: it loads in manual mode so it does NOT page-track streamers'
// OBS sources — it only fires the explicit overlay_active / session / error
// events below.
export function initAnalytics(options: { autoTrack?: boolean } = {}) {
  if (!ENABLED || typeof document === "undefined") return;
  if (document.querySelector("script[data-umami]")) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = UMAMI_SRC;
  s.dataset.websiteId = UMAMI_WEBSITE_ID;
  s.dataset.umami = "";
  if (options.autoTrack === false) s.dataset.autoTrack = "false";
  s.addEventListener("load", flush);
  document.head.appendChild(s);
}

export function trackEvent(event: string, props?: Props) {
  if (!ENABLED) return;
  queue.push([event, props]);
  flush(); // sends immediately once Umami is ready; no-ops (stays queued) before
}

// A stable, random, anonymous id for one browser/overlay so retention and
// unique-overlay counts are possible. It is NOT derived from the Steam ID,
// Twitch login, or anything personal — just a random token in localStorage.
// (A persistent id like this is the one piece here a strict privacy/GDPR stance
// might want behind consent; drop this and the `uid` prop to remove it.)
export function anonId(): string {
  const KEY = "cs2overlay:anon";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID?.() ?? String(Math.random()).slice(2);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage unavailable (private mode, etc.) — skip the id rather than fail.
    return "";
  }
}
