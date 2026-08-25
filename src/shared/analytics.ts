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

// Umami website ID, injected by Vite from the env var at build time. Empty when
// unset — which is the case for forks and local dev without their own account.
const UMAMI_WEBSITE_ID: string = import.meta.env.VITE_UMAMI_WEBSITE_ID ?? "";
const UMAMI_SRC = "https://cloud.umami.is/script.js";

// Loads Umami's script — but only when an ID is configured, so nothing is
// fetched (and no events are sent) unless the site owner has set
// VITE_UMAMI_WEBSITE_ID. Each entry point calls this once.
//
// autoTrack defaults to true (the customizer wants automatic pageviews so it
// gets visitor counts and referrers/UTM for free). The overlay passes
// autoTrack=false: it loads in manual mode so it does NOT page-track streamers'
// OBS sources — it only fires the one explicit twitch_session_started event.
export function initAnalytics(options: { autoTrack?: boolean } = {}) {
  if (!UMAMI_WEBSITE_ID || typeof document === "undefined") return;
  if (document.querySelector("script[data-umami]")) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = UMAMI_SRC;
  s.dataset.websiteId = UMAMI_WEBSITE_ID;
  s.dataset.umami = "";
  if (options.autoTrack === false) s.dataset.autoTrack = "false";
  document.head.appendChild(s);
}

export function trackEvent(
  event: string,
  props?: Record<string, string | number | boolean>,
) {
  try {
    window.umami?.track(event, props);
  } catch {
    // analytics must never break the app
  }
}
