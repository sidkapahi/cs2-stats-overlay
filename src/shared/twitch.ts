// Twitch live-status lookup, via the same proxy Worker used for Steam avatars.
//
// Checking whether a channel is live uses Twitch's Helix `Get Streams` endpoint,
// which needs an *app access token* — and that requires a client id AND secret
// (the client-credentials flow). A browser can't hold the secret, so the Worker
// does the token dance and the streams call, and the widget just asks it
// `GET {PROXY}?twitch=<login>` → `{ live: boolean }`.

const AVATAR_PROXY = import.meta.env.VITE_AVATAR_PROXY_URL as string | undefined;

// True when a Twitch live-check can actually be performed (the proxy is set).
export function twitchLiveCheckAvailable(): boolean {
  return !!AVATAR_PROXY;
}

// Resolves whether the given Twitch login is currently live. Never throws: on a
// missing proxy, network error, or unexpected payload it returns `null`, which
// the caller treats as "status unknown" and leaves the session state untouched
// (so a transient blip can't be misread as the stream ending).
export async function fetchTwitchLive(login: string): Promise<boolean | null> {
  if (!AVATAR_PROXY || !login) return null;
  try {
    const res = await fetch(
      `${AVATAR_PROXY}?twitch=${encodeURIComponent(login)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { live?: unknown };
    return typeof body.live === 'boolean' ? body.live : null;
  } catch {
    return null;
  }
}
