import type { LeetifyGame, LeetifyMatch, LeetifyMatchDetails, LeetifyProfile } from './types';

// Leetify's real, documented Public API (see https://api-public-docs.cs-prod.leetify.com/).
// The old cs-prod.leetify.com/api/profile/id/{steamId} endpoint this widget used to call
// doesn't exist on that API at all — hence the persistent 404s.
const API_BASE = 'https://api-public.cs-prod.leetify.com/v3/profile';
// Match-list endpoint. The profile payload has no kills/deaths, but this returns
// all recent matches in one call, each with a per-player `stats` array that does
// — keyed by steam64_id — so we join it back onto the profile's matches by id.
const MATCHES_BASE = 'https://api-public.cs-prod.leetify.com/v3/profile/matches';
const LEETIFY_KEY = import.meta.env.VITE_LEETIFY_KEY as string | undefined;

// Optional Steam avatar proxy (a small Cloudflare Worker — see worker/README.md).
// Leetify's public API doesn't return an avatar, and the browser can't call
// Steam's Web API directly (needs a secret key, no CORS), so when this is set
// the widget fetches the avatar from the Worker instead.
const AVATAR_PROXY = import.meta.env.VITE_AVATAR_PROXY_URL as string | undefined;

export interface PremierData {
  name: string;
  avatarUrl: string;
  rating: number;
  // Premier rank-point swing from the previous Premier match to the most recent
  // one (e.g. +250). 0 when it can't be derived from the recent matches.
  ratingDiff: number;
  // Overall win rate as a fraction (0..1), from the profile payload.
  winRate: number;
  // Win / loss counts across the returned recent matches (ties excluded).
  wins: number;
  losses: number;
  recentGames: LeetifyGame[];
  aimRating: number;
}

export async function fetchPremierData(steamId: string): Promise<PremierData> {
  const headers: Record<string, string> = {};
  if (LEETIFY_KEY) headers._leetify_key = LEETIFY_KEY;

  const res = await fetch(`${API_BASE}?steam64_id=${encodeURIComponent(steamId)}`, { headers });
  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const data: LeetifyProfile = await res.json();

  if (data.ranks.premier == null) throw new Error('No Premier rank found');

  const recentGames = data.recent_matches ?? [];
  // Kills/deaths aren't in the profile payload, so fetch them from the match-list
  // endpoint (one call) and attach them to these matches. Runs alongside the
  // avatar lookup so both happen in parallel.
  const [avatarUrl] = await Promise.all([
    // Leetify's public API doesn't expose an avatar URL. If an avatar proxy is
    // configured we resolve it from the Steam Web API; otherwise this stays blank
    // and config.showAvatar hides the avatar slot entirely.
    fetchAvatarUrl(steamId),
    enrichWithKills(steamId, recentGames, headers),
  ]);
  // Premier rank-point swing: the profile payload has no historical deltas, but
  // each match carries the Premier rank it ended at, so the diff between the two
  // most recent Premier matches is the last game's point change (e.g. +250).
  const premierRanks = recentGames
    .filter((g) => g.rank_type === 'premier' && g.rank != null)
    .map((g) => g.rank as number);
  const ratingDiff = premierRanks.length >= 2 ? premierRanks[0] - premierRanks[1] : 0;

  // Win / loss tallies across the returned recent matches (ties are shown in the
  // history strip but don't count toward the W/L pills).
  const wins = recentGames.filter((g) => g.outcome === 'win').length;
  const losses = recentGames.filter((g) => g.outcome === 'loss').length;

  return {
    name: data.name,
    avatarUrl,
    rating: data.ranks.premier,
    ratingDiff,
    winRate: data.winrate ?? 0,
    wins,
    losses,
    recentGames,
    aimRating: data.rating.aim,
  };
}

// Attaches kills/deaths to each match from the match-list endpoint, which the
// profile payload doesn't carry. One request returns every recent match with a
// per-player `stats` array; we index the player's kills/deaths by match id and
// join them onto the passed matches (mutating them). Best-effort: if the request
// fails, matches keep undefined kills/deaths and the stats row falls back.
async function enrichWithKills(
  steamId: string,
  matches: LeetifyMatch[],
  headers: Record<string, string>,
): Promise<void> {
  try {
    const res = await fetch(
      `${MATCHES_BASE}?steam64_id=${encodeURIComponent(steamId)}`,
      { headers },
    );
    if (!res.ok) return;
    const details = (await res.json()) as LeetifyMatchDetails[];

    const byId = new Map<string, { kills: number; deaths: number }>();
    for (const detail of details) {
      const me = detail.stats?.find((p) => p.steam64_id === steamId);
      if (me) byId.set(detail.id, { kills: me.total_kills, deaths: me.total_deaths });
    }

    for (const m of matches) {
      const stat = byId.get(m.id);
      if (stat) {
        m.kills = stat.kills;
        m.deaths = stat.deaths;
      }
    }
  } catch {
    // Leave kills/deaths undefined; the widget handles missing data.
  }
}

// Resolves a Steam custom (vanity) URL name (e.g. the `gabelogannewell` in
// steamcommunity.com/id/gabelogannewell) to a Steam64 ID via the proxy Worker.
// Steam's ResolveVanityURL API needs the secret key, so it can only run
// server-side — the same Worker used for avatars also handles this. Throws a
// friendly message when the proxy isn't configured or the name can't be
// resolved, so the customizer can surface it to the user.
export async function resolveVanityUrl(vanity: string): Promise<string> {
  if (!AVATAR_PROXY) {
    throw new Error(
      "Custom profile URLs need the Steam proxy. Paste your Steam64 ID or a " +
        "steamcommunity.com/profiles/… link instead.",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${AVATAR_PROXY}?vanity=${encodeURIComponent(vanity)}`);
  } catch {
    throw new Error("Couldn't reach the Steam resolver");
  }

  let body: { steamId?: unknown; error?: unknown } = {};
  try {
    body = (await res.json()) as { steamId?: unknown; error?: unknown };
  } catch {
    // Non-JSON response; fall through to status-based handling below.
  }

  if (res.ok && typeof body.steamId === "string" && /^\d{17}$/.test(body.steamId)) {
    return body.steamId;
  }

  // 404 means the name genuinely has no matching Steam profile. Any other
  // status usually means the proxy Worker itself is misconfigured or out of
  // date — e.g. a Worker deployed before vanity support was added doesn't
  // understand `?vanity=` and replies with an "Invalid or missing steam64_id"
  // error. Surface the Worker's own message so that's diagnosable instead of
  // masking every failure as "no profile found".
  if (res.status === 404) {
    throw new Error("No Steam profile found for that custom URL");
  }
  const detail =
    typeof body.error === "string" ? body.error : `HTTP ${res.status}`;
  throw new Error(`Couldn't resolve custom URL — ${detail}`);
}

// Resolves a Steam avatar URL via the optional proxy Worker. Never throws:
// if the proxy is unset, unreachable, or the profile is private, the widget
// just renders without an avatar rather than failing the whole update.
async function fetchAvatarUrl(steamId: string): Promise<string> {
  if (!AVATAR_PROXY) return '';
  try {
    const res = await fetch(`${AVATAR_PROXY}?steam64_id=${encodeURIComponent(steamId)}`);
    if (!res.ok) return '';
    const body = (await res.json()) as { avatarUrl?: unknown };
    return typeof body.avatarUrl === 'string' ? body.avatarUrl : '';
  } catch {
    return '';
  }
}
