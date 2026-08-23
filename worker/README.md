# Steam proxy (Cloudflare Worker)

Leetify's public API doesn't return a player avatar, and the widget is a static
GitHub Pages site, so it can't call Steam's Web API itself — that API needs a
secret key and doesn't send CORS headers. This tiny Worker keeps the key
server-side (adding CORS) and answers three lookups:

- **Avatar** — resolves a Steam64 ID to a Steam avatar URL.
- **Vanity URL** — resolves a custom `steamcommunity.com/id/<name>` profile link
  to a Steam64 ID, so the customizer can accept those links directly.
- **Twitch live status** — reports whether a Twitch channel is currently live,
  which drives the widget's optional session-scoped win/loss.

It's **optional**. Without it, the widget simply doesn't show an avatar, the
customizer only accepts a Steam64 ID or a `steamcommunity.com/profiles/…` link
(both of which need no server call) rather than custom `/id/…` links, and the
Twitch session W/L falls back to the normal rolling-window W/L.

## Deploy

1. **Get a Steam Web API key** (free): https://steamcommunity.com/dev/apikey

2. **Deploy the Worker** with [Wrangler](https://developers.cloudflare.com/workers/wrangler/):

   ```bash
   cd worker
   npx wrangler deploy
   ```

   (Or create a Worker in the Cloudflare dashboard and paste in
   `steam-avatar-proxy.js`.)

3. **Add your key as a secret** — never commit it:

   ```bash
   npx wrangler secret put STEAM_API_KEY
   ```

   (Dashboard equivalent: your Worker → Settings → Variables and Secrets → add a
   **secret** named `STEAM_API_KEY`.)

4. **Point the widget at the Worker.** Note the Worker's URL (e.g.
   `https://cs2-steam-avatar-proxy.<you>.workers.dev`) and set it as the build
   variable `VITE_AVATAR_PROXY_URL`:

   - **Local dev:** add it to `.env.local`.
   - **Deployed site:** add a repository **variable** (or secret)
     `VITE_AVATAR_PROXY_URL` under Settings → Secrets and variables → Actions.
     The URL is not sensitive — it gets inlined into the public bundle — so a
     plain repository *variable* is fine.

That's it. The widget calls `GET {VITE_AVATAR_PROXY_URL}?steam64_id=<id>` and
renders the returned avatar. The **Steam key stays on Cloudflare** and never
reaches the browser.

# Twitch live-status proxy (Cloudflare Worker)

This is a **second, separate Worker** (`twitch-live-proxy.js`), so the Twitch
credentials live apart from the Steam key. It's what powers the widget's optional
**session win/loss**: setting a Twitch username in the customizer switches the
W/L pills to a **per-stream record** — they reset to `W0 L0` when the channel
goes live, count only matches finished during that stream, and freeze (keeping
the last stream's record) once the channel goes offline. The session is stored
per player in the browser's `localStorage`, so an OBS source refresh mid-stream
doesn't lose it.

Checking whether a channel is live uses Twitch's Helix **Get Streams**, which
needs an *app access token* — and that requires a client id **and secret** (the
client-credentials flow), so it has to run on a Worker. Note this reads only
**public** data ("is channel X live?"); the streamer never logs in or authorizes
anything — the username is just a lookup key.

## Deploy

1. **Register a Twitch application** at
   <https://dev.twitch.tv/console/apps> → **Register Your Application**. Any name
   works; set the OAuth redirect URL to `http://localhost` (unused by the
   client-credentials flow). Note the **Client ID** and generate a **Client
   Secret**.

2. **Deploy this Worker** (its own wrangler config points at
   `twitch-live-proxy.js`):

   ```bash
   cd worker
   npx wrangler deploy --config wrangler.twitch.toml
   ```

   (Or create a second Worker in the Cloudflare dashboard and paste in
   `twitch-live-proxy.js`.)

3. **Add the credentials as secrets** — never commit them:

   ```bash
   npx wrangler secret put TWITCH_CLIENT_ID --config wrangler.twitch.toml
   npx wrangler secret put TWITCH_CLIENT_SECRET --config wrangler.twitch.toml
   ```

   (Dashboard equivalent: the Twitch Worker → Settings → Variables and Secrets →
   add two **secrets** with those names.)

4. **Point the widget at this Worker** via `VITE_TWITCH_PROXY_URL` (distinct from
   the avatar proxy's `VITE_AVATAR_PROXY_URL`):

   - **Local dev:** add it to `.env.local`.
   - **Deployed site:** add a repository **variable** `VITE_TWITCH_PROXY_URL`
     under Settings → Secrets and variables → Actions.

The widget calls `GET {VITE_TWITCH_PROXY_URL}?twitch=<login>` every ~15 seconds
(independent of the slower stats refresh), well within Twitch's app-token rate
limit. If the credentials aren't set the lookup returns `501` and the widget
falls back to the rolling-window W/L — as it also does when this Worker isn't
deployed at all.

## Allowed origins (CORS)

**Both** Workers gate browser requests by an `ALLOWED_ORIGINS` set at the top of
their file — that's what stops other websites from spending your keys / quota.
Edit that list in each of `steam-avatar-proxy.js` and `twitch-live-proxy.js`
(scheme + host only, no trailing slash) to match wherever the widget is hosted,
e.g. `https://<you>.github.io`, plus `http://localhost:5173` for local dev. After
changing it, redeploy that Worker.

## Response shape

**Avatar lookup:**

```
GET /?steam64_id=76561198123894701
→ 200 { "avatarUrl": "https://avatars.steamstatic.com/<hash>_full.jpg" }
```

A private profile or unknown ID returns `{ "avatarUrl": "" }` (the widget then
just hides the avatar). Invalid IDs return `400`.

**Vanity-URL resolution:**

```
GET /?vanity=gabelogannewell
→ 200 { "steamId": "76561197960287930" }
```

A name with no matching profile returns `404 { "error": … }`; invalid names
return `400`.

**Twitch live status:**

```
GET /?twitch=ninja
→ 200 { "live": true }   // or { "live": false } when offline
```

Invalid logins return `400`; when the Twitch secrets aren't configured the
lookup returns `501 { "error": … }` (the widget then falls back to the normal
rolling-window W/L). This response is never cached, since live status changes.
