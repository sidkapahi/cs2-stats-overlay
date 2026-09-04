// A `fetch` that gives up after a deadline instead of hanging indefinitely.
//
// The overlay runs for hours inside OBS's embedded Chromium browser source. Over
// a connection that long, keep-alive sockets silently go dead — the socket looks
// open but no bytes ever come back — and a plain `fetch()` against a dead socket
// never resolves *and* never rejects. In a poller that's fatal: `updateStats()`
// awaits a fetch that hangs forever, so the on-screen stats freeze at their last
// values with no error shown, and only a manual source refresh (which tears down
// every stale socket) recovers it.
//
// Aborting after a deadline turns that silent hang into a normal rejection, so
// the caller's retry — and the next poll — open a fresh connection instead of
// waiting on the dead one. Callers already treat a rejection as a transient miss
// (keep the last good render, try again next tick), so the failure mode is a
// brief non-update rather than a permanent freeze.

// Default per-request deadline. Comfortably longer than a healthy proxy round
// trip (including a Worker cold start) yet well under the 60s stats refresh, so a
// stalled request is abandoned long before the next poll would fire.
export const DEFAULT_FETCH_TIMEOUT_MS = 15000;

export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
