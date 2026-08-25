import posthog from "posthog-js";
import type { PostHogConfig } from "posthog-js";

// Customizer analytics (PostHog, cookie-based). The overlay does NOT use this
// module — it uses the lightweight, cookieless analyticsOverlay.ts instead, so
// posthog-js is never bundled into the OBS overlay.

type Props = Record<string, string | number | boolean>;

// PostHog project key + host, injected by Vite at build time. Empty key = no
// analytics at all (forks / local dev without their own project).
const POSTHOG_KEY: string = import.meta.env.VITE_POSTHOG_KEY ?? "";
const POSTHOG_HOST: string =
  import.meta.env.VITE_POSTHOG_HOST ?? "https://us.i.posthog.com";
const ENABLED = !!POSTHOG_KEY;

let started = false;

// Cookie-based, but starts OPTED OUT — nothing is captured until the visitor
// accepts via the consent banner (see mountConsentUi in customizer.ts).
export function initAnalytics() {
  if (!ENABLED || started || typeof window === "undefined") return;
  started = true;

  const config: Partial<PostHogConfig> = {
    api_host: POSTHOG_HOST,
    autocapture: false, // we send explicit, named events only
    disable_session_recording: true,
    advanced_disable_feature_flags: true,
    // Never build person profiles for anonymous events — cheaper and more
    // private; we only ever send anonymous counts.
    person_profiles: "identified_only",
    persistence: "localStorage+cookie",
    opt_out_capturing_by_default: true, // gated on banner consent
  };
  posthog.init(POSTHOG_KEY, config);
}

export function trackEvent(event: string, props?: Props) {
  if (!ENABLED || !started) return;
  try {
    posthog.capture(event, props);
  } catch {
    // analytics must never break the app
  }
}

// ---- Consent controls (cookie banner) ------------------------------------

// Whether analytics is configured at all — the banner only shows when true.
export function analyticsEnabled(): boolean {
  return ENABLED;
}

// True once the visitor has explicitly accepted or rejected, so the banner
// isn't shown again on return visits.
//
// NOTE: we must NOT use has_opted_out_capturing() here. With
// opt_out_capturing_by_default (set in initAnalytics), a first-time visitor is
// already reported as "opted out" before making any choice, so that check would
// always be true and the banner would never appear. get_explicit_consent_status
// reads the *stored* choice only ("pending" until the visitor actually decides).
export function consentDecided(): boolean {
  return consentStatus() !== "pending";
}

// The visitor's stored choice: "granted" (accepted), "denied" (rejected), or
// "pending" (no choice yet). Used to show which option is active in the modal.
export function consentStatus(): "granted" | "denied" | "pending" {
  if (!ENABLED || !started) return "pending";
  try {
    return posthog.get_explicit_consent_status();
  } catch {
    return "pending";
  }
}

export function grantConsent() {
  if (!ENABLED || !started) return;
  try {
    posthog.opt_in_capturing();
  } catch {
    /* ignore */
  }
}

export function revokeConsent() {
  if (!ENABLED || !started) return;
  try {
    posthog.opt_out_capturing();
  } catch {
    /* ignore */
  }
}
