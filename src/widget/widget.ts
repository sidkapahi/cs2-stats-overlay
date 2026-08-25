import { fetchPremierData, type PremierData } from '../shared/api';
import { paramsToConfig } from '../shared/config';
import { loadFont } from '../shared/fonts';
import { renderMessage, renderWidget } from '../shared/render';
import {
  advanceSession,
  loadSession,
  readWinLoss,
  saveSession,
  type SessionState,
} from '../shared/session';
import { fetchTwitchLive, twitchLiveCheckAvailable } from '../shared/twitch';
import './widget.css';

// How often to check Twitch live status, independent of the (slower) stats
// refresh. Matches finish every 30+ minutes so there's no point polling Leetify
// fast, but we want a go-live / go-offline transition caught quickly. Twitch's
// app-token Get Streams limit is 800/min, so 15s (4/min) is comfortably cheap.
const LIVE_POLL_INTERVAL = 15;

async function init() {
  const container = document.getElementById('app')!;
  const params = new URLSearchParams(window.location.search);
  const config = paramsToConfig(params);

  // Pull in the chosen Google Font at the chosen weight (Inter is already bundled).
  loadFont(config.font, config.fontWeight);

  if (!config.steamId) {
    container.innerHTML = renderMessage('Error', 'No Steam ID provided.');
    return;
  }

  container.innerHTML = `<div class="widget rank-gray no-badge no-avatar loading">
    <div class="widget-main"><div class="identity"><div class="identity-text">
      <div class="name">Loading…</div>
      <div class="rating-line"><span class="rating-plain">—</span></div>
    </div></div></div>
  </div>`;

  // Session-scoped W/L is active only when a Twitch login is set *and* the proxy
  // that performs the live check is configured; otherwise the pills keep their
  // default rolling-window behaviour.
  const sessionMode = !!config.twitchLogin && twitchLiveCheckAvailable();
  let sessionState: SessionState = sessionMode
    ? loadSession(config.steamId, config.twitchLogin)
    : { live: false, preSessionIds: [], results: {} };
  // Latest stats payload and latest known live status, updated by two separate
  // pollers and reconciled by render().
  let lastData: PremierData | null = null;
  let lastLive: boolean | null = null;

  // Renders whatever we currently know. In session mode it advances the session
  // from the newest live status + matches, then overrides the W/L pills with the
  // session record (falling back to the rolling window before the first stream).
  function render() {
    if (!lastData) return;
    let data = lastData;
    if (sessionMode) {
      sessionState = advanceSession(sessionState, lastLive, lastData.recentGames);
      saveSession(config.steamId, config.twitchLogin, sessionState);
      const wl = readWinLoss(sessionState);
      if (wl.mode === 'session') {
        data = { ...lastData, wins: wl.wins, losses: wl.losses };
      }
    }
    container.innerHTML = renderWidget(config, data);
  }

  async function updateStats() {
    try {
      lastData = await fetchPremierData(config.steamId);
      render();
    } catch (e) {
      // Keep the last good render if we already have one; only show the error
      // state on the very first failure.
      if (!lastData) {
        container.innerHTML = renderMessage('Error', e instanceof Error ? e.message : 'Failed to fetch');
      }
    }
  }

  async function updateLive() {
    const live = await fetchTwitchLive(config.twitchLogin);
    // null means "unknown" (transient) — leave lastLive as-is so a blip can't be
    // misread as the stream ending.
    if (live !== null) lastLive = live;
    render();
  }

  // Kick off the live check first so the very first stats render already knows
  // whether we're live (avoids a flash of the wrong W/L).
  if (sessionMode) await updateLive();
  await updateStats();

  setInterval(updateStats, config.refreshInterval * 1000);
  if (sessionMode) setInterval(updateLive, LIVE_POLL_INTERVAL * 1000);
}

init();
