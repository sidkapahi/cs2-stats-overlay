// Cloudflare Worker: Steam proxy (avatars + vanity-URL resolution) + Twitch
// live status.
//
// The widget is a static GitHub Pages site, so it can't call these APIs
// directly: they need keys/secrets (which must stay server-side) and Steam sends
// no CORS headers (so browsers block the request). This Worker sits in between,
// keeping the secrets server-side and adding the CORS headers the browser needs.
// It answers three lookups:
//   • GET ?steam64_id=<17-digit id>  → { avatarUrl }   (Steam avatar for that id)
//   • GET ?vanity=<custom-url-name>  → { steamId }      (resolve a vanity URL,
//        i.e. the `gabelogannewell` in steamcommunity.com/id/gabelogannewell)
//   • GET ?twitch=<channel-login>    → { live: bool }   (is that channel live)
//
// Setup (see worker/README.md for details):
//   1. Deploy this Worker (`wrangler deploy`, or paste it in the CF dashboard).
//   2. Add your Steam Web API key as a secret named STEAM_API_KEY:
//        wrangler secret put STEAM_API_KEY
//      (or dashboard → Settings → Variables and Secrets → Add). Get a key at
//      https://steamcommunity.com/dev/apikey
//   3. Optional (for Twitch session W/L): register an app at
//      https://dev.twitch.tv/console/apps and add its credentials as secrets
//      TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET. Without these the ?twitch=
//      lookup returns 501 and the widget falls back to rolling-window W/L.
//   4. Point the widget at the Worker's URL via VITE_AVATAR_PROXY_URL
//      (see the repo README).

// Only these site origins may call the Worker from a browser. CORS is what
// stops other websites from using your Steam key / Cloudflare quota. Add or
// remove entries here (scheme + host only, no trailing slash or path).
const ALLOWED_ORIGINS = new Set([
  'https://levanisart.github.io',
  'https://sidkapahi.github.io',
  'http://localhost:5173', // local dev (npm run dev)
]);

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

    // Twitch live status: channel login → { live: bool }.
    const twitch = url.searchParams.get('twitch');
    if (twitch !== null) return resolveTwitchLive(twitch, env, cors);

    // Vanity-URL resolution: steamcommunity.com/id/<name> → Steam64 ID.
    const vanity = url.searchParams.get('vanity');
    if (vanity !== null) return resolveVanity(vanity, env, cors);

    const steamId = url.searchParams.get('steam64_id');

    // Steam64 IDs are 17-digit numbers; reject anything else to avoid the
    // Worker being used as an open proxy for arbitrary Steam API calls.
    if (!steamId || !/^\d{17}$/.test(steamId)) {
      return json({ error: 'Invalid or missing steam64_id' }, 400, cors);
    }

    if (!env.STEAM_API_KEY) {
      return json({ error: 'Worker is missing the STEAM_API_KEY secret' }, 500, cors);
    }

    const api =
      'https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/' +
      `?key=${env.STEAM_API_KEY}&steamids=${steamId}`;

    let player;
    try {
      const res = await fetch(api);
      if (!res.ok) return json({ error: `Steam API error: ${res.status}` }, 502, cors);
      const data = await res.json();
      player = data?.response?.players?.[0];
    } catch {
      return json({ error: 'Failed to reach the Steam API' }, 502, cors);
    }

    // Private profile or unknown ID: no player returned. Reply 200 with an
    // empty avatar so the widget just hides the avatar slot rather than erroring.
    if (!player) return json({ avatarUrl: '' }, 200, cors);

    // avatarfull is the 184x184 image; avatarmedium (64x64) is also available.
    return json({ avatarUrl: player.avatarfull ?? '' }, 200, cors);
  },
};

// Resolves a Steam custom (vanity) URL name to a Steam64 ID using Steam's
// ResolveVanityURL API. Like the avatar lookup, this needs the secret API key,
// so it has to run here rather than in the browser.
async function resolveVanity(vanity, env, cors) {
  // Vanity names are letters/digits/dashes/underscores/dots. Reject anything
  // else so the Worker can't be used to smuggle arbitrary query params.
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(vanity)) {
    return json({ error: 'Invalid vanity name' }, 400, cors);
  }

  if (!env.STEAM_API_KEY) {
    return json({ error: 'Worker is missing the STEAM_API_KEY secret' }, 500, cors);
  }

  const api =
    'https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/' +
    `?key=${env.STEAM_API_KEY}&vanityurl=${encodeURIComponent(vanity)}`;

  try {
    const res = await fetch(api);
    if (!res.ok) return json({ error: `Steam API error: ${res.status}` }, 502, cors);
    const data = await res.json();
    // success === 1 means resolved; 42 (or anything else) means no such name.
    if (data?.response?.success === 1 && data.response.steamid) {
      return json({ steamId: data.response.steamid }, 200, cors);
    }
    return json({ error: 'No Steam profile found for that custom URL' }, 404, cors);
  } catch {
    return json({ error: 'Failed to reach the Steam API' }, 502, cors);
  }
}

// Twitch live status: is `login` currently streaming?
//
// Twitch's Helix Get Streams needs an *app access token*, which requires the
// client id AND secret (client-credentials flow) — hence server-side only. The
// token is cached in the module scope and reused across requests in the same
// warm isolate until shortly before it expires.
async function resolveTwitchLive(login, env, cors) {
  const name = login.trim().toLowerCase();
  // Twitch logins are letters/digits/underscores (up to 25). Reject anything
  // else so the Worker can't be used to smuggle arbitrary query params.
  if (!/^[a-z0-9_]{1,25}$/.test(name)) {
    return json({ error: 'Invalid Twitch login' }, 400, cors, 'no-store');
  }

  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    // Not configured — tell the widget so it falls back to rolling-window W/L.
    return json({ error: 'Twitch is not configured on this Worker' }, 501, cors, 'no-store');
  }

  let token;
  try {
    token = await getTwitchToken(env);
  } catch {
    return json({ error: 'Failed to get a Twitch token' }, 502, cors, 'no-store');
  }

  try {
    const res = await fetch(
      `https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(name)}`,
      { headers: { 'Client-Id': env.TWITCH_CLIENT_ID, Authorization: `Bearer ${token}` } },
    );
    // A 401 usually means the cached token was revoked; drop it so the next
    // request mints a fresh one.
    if (res.status === 401) TWITCH_TOKEN = null;
    if (!res.ok) return json({ error: `Twitch API error: ${res.status}` }, 502, cors, 'no-store');
    const data = await res.json();
    // Get Streams only returns entries for channels that are *currently live*;
    // an offline channel yields an empty `data` array.
    const stream = Array.isArray(data?.data) ? data.data[0] : null;
    const live = !!stream && stream.type === 'live';
    // Live status is time-sensitive, so never cache it (the widget polls often).
    return json({ live }, 200, cors, 'no-store');
  } catch {
    return json({ error: 'Failed to reach the Twitch API' }, 502, cors, 'no-store');
  }
}

// App access token cache, shared across requests in a warm isolate. Refreshed
// when missing or within 60s of expiry.
let TWITCH_TOKEN = null; // { value: string, expiresAt: number(ms) }

async function getTwitchToken(env) {
  const now = Date.now();
  if (TWITCH_TOKEN && TWITCH_TOKEN.expiresAt - 60_000 > now) {
    return TWITCH_TOKEN.value;
  }
  const params = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID,
    client_secret: env.TWITCH_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });
  const res = await fetch(`https://id.twitch.tv/oauth2/token?${params}`, { method: 'POST' });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  if (!data?.access_token) throw new Error('no access_token');
  TWITCH_TOKEN = {
    value: data.access_token,
    // expires_in is seconds; default to 1h if it's somehow missing.
    expiresAt: now + (Number(data.expires_in) || 3600) * 1000,
  };
  return TWITCH_TOKEN.value;
}

// `cacheControl` overrides the default (cache 200s for an hour, never cache
// errors) — used for time-sensitive lookups like live status that must not be
// cached even on success.
function json(body, status, cors, cacheControl) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // Cache only successful lookups (avatars / resolved IDs rarely change).
      // Never cache errors: a 4xx/5xx with a long max-age would stick in the
      // browser for an hour and keep masking an already-fixed Worker or a
      // transient Steam hiccup — exactly the kind of stale error that makes a
      // redeploy look like it didn't work.
      'Cache-Control':
        cacheControl ?? (status === 200 ? 'public, max-age=3600' : 'no-store'),
      ...cors,
    },
  });
}
