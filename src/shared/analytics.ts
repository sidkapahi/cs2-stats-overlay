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

// Load Umami's script only when an ID is configured, so nothing is fetched (and
// no events are sent) unless the site owner has set VITE_UMAMI_WEBSITE_ID. Runs
// once on import; safe to call again (it no-ops if the tag already exists).
function loadUmami() {
  if (!UMAMI_WEBSITE_ID || typeof document === "undefined") return;
  if (document.querySelector("script[data-umami]")) return;
  const s = document.createElement("script");
  s.defer = true;
  s.src = UMAMI_SRC;
  s.dataset.websiteId = UMAMI_WEBSITE_ID;
  s.dataset.umami = "";
  document.head.appendChild(s);
}

loadUmami();

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
