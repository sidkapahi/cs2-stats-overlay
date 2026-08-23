// Session-scoped Win/Loss tracking, driven by Twitch live status.
//
// The default W/L pills tally every match in Leetify's recent window. When a
// Twitch channel is configured we instead want a *per-stream* record: it resets
// to 0-0 when the channel goes live, counts only matches finished during that
// stream, and freezes (keeping the last stream's record) once the channel goes
// offline.
//
// Leetify's `recent_matches` is a rolling window, so a naive "current total
// minus a snapshot total" undercounts a long session as early games fall out of
// the window. Instead we snapshot the set of match *ids* present at go-live
// (those are pre-session and never counted), then accumulate the outcome of any
// *new* id we see while live into a map keyed by id. Because outcomes are stored
// by id, a match still counts even after it later drops out of the window, and
// the whole thing survives an OBS source refresh via localStorage.

import type { LeetifyMatch } from './types';

export interface SessionState {
  // Last live status we acted on. Drives the go-live / go-offline transitions.
  live: boolean;
  // Match ids that already existed when the current session started. Counting
  // ignores these so a session begins cleanly at 0-0.
  preSessionIds: string[];
  // Outcomes of matches finished during the current session, keyed by match id.
  results: Record<string, 'win' | 'loss' | 'tie'>;
}

export interface SessionWinLoss {
  wins: number;
  losses: number;
  live: boolean;
  // 'session' → show these session numbers; 'fallback' → no session has begun
  // yet (Twitch never seen live and nothing counted), so the caller should show
  // the normal rolling-window W/L instead of an empty 0-0.
  mode: 'session' | 'fallback';
}

const STORAGE_PREFIX = 'cs2overlay:session:v1';

function emptyState(): SessionState {
  return { live: false, preSessionIds: [], results: {} };
}

// Advances the session state given the freshly polled live status and recent
// matches. `liveNow === null` means "status unknown" (e.g. the proxy blipped):
// we leave the live flag and the session untouched rather than misreading a
// transient failure as the stream ending. Pure — no I/O — so it's easy to reason
// about; persistence is handled by load/save around it.
export function advanceSession(
  prev: SessionState,
  liveNow: boolean | null,
  recent: LeetifyMatch[],
): SessionState {
  const state: SessionState = {
    live: prev.live,
    preSessionIds: [...prev.preSessionIds],
    results: { ...prev.results },
  };

  if (liveNow === true && !prev.live) {
    // Go-live: start a fresh session. Every current match is pre-session.
    state.live = true;
    state.preSessionIds = recent.map((m) => m.id);
    state.results = {};
  } else if (liveNow === false && prev.live) {
    // Go-offline: freeze. Keep results as the last stream's record.
    state.live = false;
  }

  // Accumulate only while live. A finished match lingers in the window across
  // many polls, so missing a single poll (e.g. a null blip) never drops a game.
  if (state.live) {
    const preSet = new Set(state.preSessionIds);
    for (const m of recent) {
      if (!preSet.has(m.id)) state.results[m.id] = m.outcome;
    }
  }

  return state;
}

// Reduces a session state to the numbers the widget shows.
export function readWinLoss(state: SessionState): SessionWinLoss {
  let wins = 0;
  let losses = 0;
  for (const outcome of Object.values(state.results)) {
    if (outcome === 'win') wins++;
    else if (outcome === 'loss') losses++;
  }
  // Before the first go-live (and with nothing counted) there's no meaningful
  // session yet, so tell the caller to fall back to the rolling-window W/L.
  const mode: 'session' | 'fallback' =
    state.live || wins + losses > 0 ? 'session' : 'fallback';
  return { wins, losses, live: state.live, mode };
}

function storageKey(steamId: string, login: string): string {
  return `${STORAGE_PREFIX}:${steamId}:${login}`;
}

// Loads the stored session for this steamId+login. Any read failure (private
// mode, cleared storage, corrupt JSON) yields a clean empty session.
export function loadSession(steamId: string, login: string): SessionState {
  try {
    const raw = localStorage.getItem(storageKey(steamId, login));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<SessionState>;
    return {
      live: typeof parsed.live === 'boolean' ? parsed.live : false,
      preSessionIds: Array.isArray(parsed.preSessionIds) ? parsed.preSessionIds : [],
      results: parsed.results && typeof parsed.results === 'object' ? parsed.results : {},
    };
  } catch {
    return emptyState();
  }
}

// Persists the session. Best-effort: storage may be unavailable or full, in
// which case the session simply won't survive a refresh — never an error.
export function saveSession(steamId: string, login: string, state: SessionState): void {
  try {
    localStorage.setItem(storageKey(steamId, login), JSON.stringify(state));
  } catch {
    // ignore: session persistence is a convenience, not a requirement
  }
}
