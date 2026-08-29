// Cloudflare Worker: FACEIT proxy (player + stats + recent matches)
//
// The widget is a static GitHub Pages site, so it can't call FACEIT's Data API
// itself: that API needs a secret key (an `Authorization: Bearer <key>` header)
// and doesn't send CORS headers, so the browser would both leak the key and be
// blocked. This Worker keeps the key server-side (adding CORS) and answers a
// single lookup that returns everything the FACEIT overlay needs in one call:
//   • GET ?steam64_id=<17-digit id>[&history=<n>]  → combined player payload
//
// Keyed by Steam64 ID (a CS2 player's FACEIT game_player_id is their Steam64
// ID), so the widget keeps one identity input and just toggles Premier ⇄ FACEIT.
// FACEIT has no batched endpoint for per-match stats (unlike Leetify), so the
// chain — resolve Steam ID → player, lifetime stats, recent history, per-match
// kills/deaths/ADR/HS, and (for Challenger) the leaderboard position — is done
// here, server-side, so the browser still makes just one request instead of the
// N+1 it would otherwise need. It's deliberately a separate Worker from the
// Steam/Twitch/Kick proxies so each set of credentials lives apart.
//
// Setup (see worker/README.md for details):
//   1. Create a FACEIT app at https://developers.faceit.com/ (App Studio) and
//      generate a SERVER-SIDE API key.
//   2. Deploy this Worker:
//        wrangler deploy --config wrangler.faceit.toml
//      (or create a Worker in the dashboard and paste in this file).
//   3. Add the key as a secret:
//        wrangler secret put FACEIT_API_KEY --config wrangler.faceit.toml
//   4. Point the widget at this Worker's URL via VITE_FACEIT_PROXY_URL
//      (see the repo README).

// Only these site origins may call the Worker from a browser. CORS is what stops
// other websites from spending your FACEIT API key's rate limit. Add or remove
// entries here (scheme + host only, no trailing slash or path).
const ALLOWED_ORIGINS = new Set([
  'https://levanisart.github.io',
  'https://sidkapahi.github.io',
  'https://cs2widget.kapkit.ca',
  'http://localhost:5173', // local dev (npm run dev)
]);

const FACEIT_BASE = 'https://open.faceit.com/data/v4';

// How many recent matches to pull per-match stats for. The history strip shows
// up to matchCount (default 10) and K/D is averaged over the same window, so 20
// is a safe cap. Each match is one extra FACEIT request, done in parallel.
const HISTORY_MAX = 20;
const HISTORY_DEFAULT = 10;

// Builds the CORS headers for a request. When the caller's Origin is on the
// allowlist we echo it back (the CORS spec allows only one origin per response,
// so it can't be a static list); otherwise no Allow-Origin is sent and the
// browser blocks the response. `Vary: Origin` keeps caches from mixing origins.
function corsHeaders(request) {
  const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    const url = new URL(request.url);

    // Nickname → Steam64 resolution, so the customizer's "Account" field can
    // accept a FACEIT nickname / profile link: it returns the player's CS2
    // `game_player_id` (their Steam ID), which both providers then key off.
    const nickname = url.searchParams.get('nickname');
    if (nickname !== null) return resolveNickname(nickname, env, cors);

    const steam64 = url.searchParams.get('steam64_id');
    if (steam64 === null) {
      return json({ error: 'Missing steam64_id or nickname query parameter' }, 400, cors);
    }

    // Clamp the requested history length to a sane range.
    const rawHistory = Number(url.searchParams.get('history'));
    const history = Number.isFinite(rawHistory)
      ? Math.max(1, Math.min(HISTORY_MAX, Math.trunc(rawHistory)))
      : HISTORY_DEFAULT;

    return resolveProfile(steam64, history, env, cors);
  },
};

// Resolves a FACEIT nickname to the player's Steam64 ID (their CS2
// `game_player_id`). Used only to turn a FACEIT identity typed in the Account
// field into the Steam ID the rest of the app keys off — the full profile is
// then fetched by `?steam64_id=` like any other.
async function resolveNickname(rawNickname, env, cors) {
  const nickname = rawNickname.trim();
  // FACEIT nicknames are letters/digits and a small set of punctuation.
  if (!/^[A-Za-z0-9_.\-[\]|~]{1,64}$/.test(nickname)) {
    return json({ error: 'Invalid FACEIT nickname' }, 400, cors);
  }
  if (!env.FACEIT_API_KEY) {
    return json({ error: 'Worker is missing the FACEIT_API_KEY secret' }, 500, cors);
  }
  const auth = { headers: { Authorization: `Bearer ${env.FACEIT_API_KEY}` } };
  try {
    const res = await fetch(
      `${FACEIT_BASE}/players?nickname=${encodeURIComponent(nickname)}&game=cs2`,
      auth,
    );
    if (res.status === 404) {
      return json({ error: 'No FACEIT player found for that nickname' }, 404, cors);
    }
    if (!res.ok) return json({ error: `FACEIT API error: ${res.status}` }, 502, cors);
    const player = await res.json();
    const steamId = String(player?.games?.cs2?.game_player_id ?? '');
    if (!/^\d{17}$/.test(steamId)) {
      return json({ error: 'That FACEIT player has no linked Steam CS2 account' }, 404, cors);
    }
    return json({ steamId }, 200, cors);
  } catch {
    return json({ error: 'Failed to reach the FACEIT API' }, 502, cors);
  }
}

// Resolves a Steam64 ID to the full FACEIT overlay payload: player identity +
// ELO + level, lifetime stats, recent matches (with per-match kills/deaths/ADR/
// HS), and — for Challenger-tier players — their leaderboard position. The same
// Steam ID drives Premier mode, so the widget keeps a single identity input and
// just toggles the data source.
async function resolveProfile(rawSteam64, history, env, cors) {
  const steam64 = rawSteam64.trim();
  // Steam64 IDs are 17-digit numbers; reject anything else so the Worker can't
  // be used as an open proxy for arbitrary FACEIT API calls.
  if (!/^\d{17}$/.test(steam64)) {
    return json({ error: 'Invalid steam64_id' }, 400, cors);
  }

  if (!env.FACEIT_API_KEY) {
    return json({ error: 'Worker is missing the FACEIT_API_KEY secret' }, 500, cors);
  }
  const auth = { headers: { Authorization: `Bearer ${env.FACEIT_API_KEY}` } };

  // 1. Resolve the Steam ID to a FACEIT player. For CS2 a player's FACEIT
  // `game_player_id` is their Steam64 ID, so this looks them up directly.
  let player;
  try {
    const res = await fetch(
      `${FACEIT_BASE}/players?game=cs2&game_player_id=${encodeURIComponent(steam64)}`,
      auth,
    );
    if (res.status === 404) {
      return json({ error: 'No FACEIT player found for that Steam account' }, 404, cors);
    }
    if (!res.ok) return json({ error: `FACEIT API error: ${res.status}` }, 502, cors);
    player = await res.json();
  } catch {
    return json({ error: 'Failed to reach the FACEIT API' }, 502, cors);
  }

  const cs2 = player?.games?.cs2 ?? {};
  const playerId = player?.player_id;
  const level = num(cs2.skill_level);
  const region = cs2.region ?? player?.country ?? null;
  if (!playerId) {
    // A player with no CS2 data (never played CS2 on FACEIT) — nothing to show.
    return json({ error: 'That FACEIT player has no CS2 data' }, 404, cors);
  }

  // 2-4. Lifetime stats, recent history, and (only for Challenger) leaderboard
  // position run in parallel — none depends on the others once we have the id.
  const [stats, matches, position] = await Promise.all([
    fetchLifetime(playerId, auth),
    fetchRecentMatches(playerId, history, auth),
    level === 10 && region ? fetchPosition(playerId, region, auth) : Promise.resolve(null),
  ]);

  return json(
    {
      nickname: player.nickname ?? '',
      playerId,
      country: typeof player.country === 'string' ? player.country.toLowerCase() : null,
      avatarUrl: typeof player.avatar === 'string' ? player.avatar : '',
      elo: num(cs2.faceit_elo),
      level,
      region: typeof region === 'string' ? region : null,
      // Lifetime aggregates (nulls when FACEIT doesn't expose the field).
      winRate: stats.winRate,
      kd: stats.kd,
      adr: stats.adr,
      hs: stats.hs,
      // Challenger leaderboard position (the `#528` pill), else null.
      position,
      matches,
    },
    200,
    cors,
  );
}

// Lifetime CS2 stats. FACEIT returns every value as a string and the exact key
// set has shifted over time, so read tolerantly and fall back to null so the
// widget can hide a stat rather than show a wrong number.
async function fetchLifetime(playerId, auth) {
  const empty = { winRate: null, kd: null, adr: null, hs: null };
  try {
    const res = await fetch(`${FACEIT_BASE}/players/${playerId}/stats/cs2`, auth);
    if (!res.ok) return empty;
    const data = await res.json();
    const life = data?.lifetime ?? {};
    const winPct = num(life['Win Rate %']);
    const hsPct = num(life['Average Headshots %']);
    return {
      winRate: winPct == null ? null : winPct / 100, // 0..1 to match Leetify's winrate
      kd: num(life['Average K/D Ratio']) ?? num(life['K/D Ratio']),
      adr: num(life['ADR']) ?? num(life['Average Damage per Round']),
      hs: hsPct == null ? null : hsPct / 100, // 0..1 fraction
    };
  } catch {
    return empty;
  }
}

// Recent matches with the player's per-match kills/deaths/ADR/HS. The history
// list has no per-match stats, so each match needs its own /matches/{id}/stats
// call — fired in parallel. A finished match's stats never change, so they're
// cached hard at the edge; a match whose stats can't be fetched still appears
// (with its win/loss outcome) but without kills/deaths.
async function fetchRecentMatches(playerId, limit, auth) {
  let items;
  try {
    const res = await fetch(
      `${FACEIT_BASE}/players/${playerId}/history?game=cs2&offset=0&limit=${limit}`,
      auth,
    );
    if (!res.ok) return [];
    const data = await res.json();
    items = Array.isArray(data?.items) ? data.items : [];
  } catch {
    return [];
  }

  return Promise.all(
    items.map(async (item) => {
      const matchId = item?.match_id ?? null;
      const outcome = outcomeFor(item, playerId);
      const base = { matchId, outcome, kills: null, deaths: null, adr: null, hs: null };
      if (!matchId) return base;

      try {
        const res = await fetch(`${FACEIT_BASE}/matches/${matchId}/stats`, {
          ...auth,
          // Finished-match stats are immutable — cache them hard so a widget
          // refresh doesn't re-fetch every match every minute.
          cf: { cacheTtl: 86400, cacheEverything: true },
        });
        if (!res.ok) return base;
        const stats = await res.json();
        const me = findPlayerStats(stats, playerId);
        if (!me) return base;
        const hs = num(me['Headshots %']);
        return {
          ...base,
          kills: num(me['Kills']),
          deaths: num(me['Deaths']),
          adr: num(me['ADR']) ?? num(me['Average Damage per Round']),
          hs: hs == null ? null : hs / 100,
        };
      } catch {
        return base;
      }
    }),
  );
}

// Determines win/loss/tie for a player from a history item. The item carries
// both factions' rosters and which faction won, so we find the player's faction
// and compare. Returns 'loss' as the safe default when it can't be determined.
function outcomeFor(item, playerId) {
  const teams = item?.teams ?? {};
  const winner = item?.results?.winner ?? null; // 'faction1' | 'faction2'
  const inFaction = (key) =>
    Array.isArray(teams?.[key]?.players) &&
    teams[key].players.some((p) => p?.player_id === playerId);

  let faction = null;
  if (inFaction('faction1')) faction = 'faction1';
  else if (inFaction('faction2')) faction = 'faction2';

  if (!faction || !winner) return 'loss';
  return faction === winner ? 'win' : 'loss';
}

// Digs the player's per-match stat block out of a /matches/{id}/stats payload.
// A CS2 match is a single entry in `rounds`; each team lists its players with a
// `player_stats` object keyed by human-readable stat names.
function findPlayerStats(stats, playerId) {
  const rounds = Array.isArray(stats?.rounds) ? stats.rounds : [];
  for (const round of rounds) {
    const teams = Array.isArray(round?.teams) ? round.teams : [];
    for (const team of teams) {
      const players = Array.isArray(team?.players) ? team.players : [];
      const me = players.find((p) => p?.player_id === playerId);
      if (me?.player_stats) return me.player_stats;
    }
  }
  return null;
}

// Challenger leaderboard position. Only meaningful for level-10 players; the
// endpoint returns the player's ranking within their region's CS2 leaderboard.
async function fetchPosition(playerId, region, auth) {
  try {
    const res = await fetch(
      `${FACEIT_BASE}/rankings/games/cs2/regions/${encodeURIComponent(region)}/players/${playerId}?limit=1`,
      { ...auth, cf: { cacheTtl: 300, cacheEverything: true } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    // The player's own rank is on `position` (1-based). Absent when they're not
    // actually on the leaderboard (region mismatch, etc.).
    return num(data?.position);
  } catch {
    return null;
  }
}

// Parses a FACEIT numeric value (often a string) to a finite number, or null.
function num(v) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Cache successful profiles briefly (ELO/matches change per game, and the
      // widget polls on its own refresh interval), but never cache errors — a
      // cached 4xx/5xx with a long max-age would stick in the browser and keep
      // masking an already-fixed Worker or a transient FACEIT hiccup.
      'Cache-Control': status === 200 ? 'public, max-age=30' : 'no-store',
      ...cors,
    },
  });
}
