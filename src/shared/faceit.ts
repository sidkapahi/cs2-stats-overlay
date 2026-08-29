import type { PremierData } from './api';
import type { LeetifyGame } from './types';

// FACEIT provider client. The static site can't call the FACEIT Data API
// directly (secret key, no CORS), so everything goes through the FACEIT proxy
// Worker (worker/faceit-proxy.js), which resolves a nickname to the full overlay
// payload in one request. This module just calls that Worker and normalizes its
// response into the same `PremierData` shape the Premier (Leetify) path returns,
// so `render.ts` and `widget.ts` stay provider-agnostic.
const FACEIT_PROXY = import.meta.env.VITE_FACEIT_PROXY_URL as string | undefined;

// Shape the Worker returns (see worker/faceit-proxy.js response docs).
interface FaceitProfile {
  nickname: string;
  playerId: string;
  country: string | null;
  avatarUrl: string;
  elo: number | null;
  level: number | null;
  region: string | null;
  winRate: number | null; // 0..1
  kd: number | null;
  adr: number | null;
  hs: number | null; // 0..1
  position: number | null;
  matches: FaceitMatch[];
}

interface FaceitMatch {
  matchId: string | null;
  outcome: 'win' | 'loss' | 'tie';
  kills: number | null;
  deaths: number | null;
  adr: number | null;
  hs: number | null;
}

// Builds a minimal LeetifyGame from a FACEIT match. `render.ts` reads only
// `outcome`, `kills`, and `deaths` off recent games (for the history strip and
// the K/D · AVG stat cells), so the other fields are filled with inert defaults
// to satisfy the shared type without inventing data.
function toGame(m: FaceitMatch): LeetifyGame {
  return {
    id: m.matchId ?? '',
    data_source: 'faceit',
    outcome: m.outcome,
    rank: null,
    rank_type: null,
    map_name: '',
    leetify_rating: 0,
    score: [0, 0],
    preaim: 0,
    reaction_time_ms: 0,
    accuracy_enemy_spotted: 0,
    accuracy_head: 0,
    spray_accuracy: 0,
    kills: m.kills ?? undefined,
    deaths: m.deaths ?? undefined,
  };
}

// Fetches a FACEIT player's overlay data by nickname and normalizes it to
// PremierData. Throws Errors whose messages classifyFetchError() (in api.ts)
// maps to the same analytics reason codes as the Leetify path, so a FACEIT
// outage is measurable the same way.
export async function fetchFaceitData(nickname: string): Promise<PremierData> {
  const nick = nickname.trim();
  if (!nick) throw new Error('No FACEIT nickname provided');
  if (!FACEIT_PROXY) {
    throw new Error('need the FACEIT proxy — set VITE_FACEIT_PROXY_URL');
  }

  let res: Response;
  try {
    res = await fetch(
      `${FACEIT_PROXY}?nickname=${encodeURIComponent(nick)}`,
      { cache: 'no-store' },
    );
  } catch {
    throw new Error('Failed to reach the FACEIT proxy');
  }

  // 404 = nickname not found. Surface a friendly message the customizer can show;
  // classifyFetchError picks it up as `faceit_not_found` via the 404 branch.
  if (res.status === 404) {
    throw new Error("Couldn't find that FACEIT nickname — check the spelling");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);

  const p = (await res.json()) as FaceitProfile;

  const recentGames = (Array.isArray(p.matches) ? p.matches : []).map(toGame);
  const wins = recentGames.filter((g) => g.outcome === 'win').length;
  const losses = recentGames.filter((g) => g.outcome === 'loss').length;

  return {
    name: p.nickname ?? nick,
    avatarUrl: p.avatarUrl ?? '',
    rating: p.elo ?? 0,
    // FACEIT has no reliable per-match ELO delta; the session-scoped change is
    // derived client-side (see session.ts / widget.ts), so 0 here.
    ratingDiff: 0,
    winRate: p.winRate ?? 0,
    wins,
    losses,
    recentGames,
    aimRating: 0, // FACEIT has no aim rating
    country: typeof p.country === 'string' && p.country ? p.country.toLowerCase() : undefined,
    skillLevel: p.level ?? undefined,
    leaderboardPosition: p.position ?? undefined,
    adr: p.adr ?? undefined,
    hsPct: p.hs ?? undefined,
  };
}
