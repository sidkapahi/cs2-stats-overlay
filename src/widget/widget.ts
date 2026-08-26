import { initOverlayAnalytics, trackOverlayEvent } from '../shared/analyticsOverlay';
import { classifyFetchError, fetchPremierData, type PremierData } from '../shared/api';
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
import { fetchLive, liveCheckAvailable } from '../shared/live';
import './widget.css';

// How often to check stream live status, independent of the (slower) stats
// refresh. Matches finish every 30+ minutes so there's no point polling Leetify
// fast, but we want a go-live / go-offline transition caught quickly. The proxy
// Workers cache their upstream calls, so a 15s (4/min) poll stays cheap even on
// YouTube's tight API quota.
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

  // Session-scoped W/L is active only when a live channel is set *and* that
  // platform's proxy is configured; otherwise the pills keep their default
  // rolling-window behaviour.
  const sessionMode =
    !!config.livePlatform &&
    !!config.liveChannel &&
    liveCheckAvailable(config.livePlatform);
  let sessionState: SessionState = sessionMode
    ? loadSession(config.steamId, config.livePlatform, config.liveChannel)
    : { live: false, preSessionIds: [], results: {} };

  // Overlay analytics: cookieless (no cookies, no storage, no consent banner on
  // stream). One overlay_active per load counts active overlays; go-live
  // sessions and fetch errors are tracked below. Cookieless means loads aren't
  // linked across sessions, so these are counts, not unique-user figures.
  initOverlayAnalytics();
  trackOverlayEvent('overlay_active', {
    live: sessionMode,
    platform: sessionMode ? config.livePlatform : '',
  });
  // Latest stats payload and latest known live status, updated by two separate
  // pollers and reconciled by render().
  let lastData: PremierData | null = null;
  let lastLive: boolean | null = null;
  // Tracks fetch health so an outage fires overlay_error once (on the failing
  // transition), not on every poll while Leetify stays down.
  let statsHealthy = true;

  // Renders whatever we currently know. In session mode it advances the session
  // from the newest live status + matches, then overrides the W/L pills with the
  // session record (falling back to the rolling window before the first stream).
  function render() {
    if (!lastData) return;
    let data = lastData;
    if (sessionMode) {
      const wasLive = sessionState.live;
      sessionState = advanceSession(sessionState, lastLive, lastData.recentGames);
      // A false→true flip is a fresh stream session starting; count it once.
      // (An OBS source refresh reloads the persisted live=true state, so it
      // won't re-fire — we count real go-live transitions, not refreshes.)
      if (!wasLive && sessionState.live) {
        trackOverlayEvent('live_session_started', { platform: config.livePlatform });
      }
      saveSession(config.steamId, config.livePlatform, config.liveChannel, sessionState);
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
      statsHealthy = true;
      render();
    } catch (e) {
      // Fire once per outage episode (on the healthy→failing transition), so a
      // sustained outage doesn't emit an event on every refresh.
      if (statsHealthy) trackOverlayEvent('overlay_error', { reason: classifyFetchError(e) });
      statsHealthy = false;
      // Keep the last good render if we already have one; only show the error
      // state on the very first failure.
      if (!lastData) {
        container.innerHTML = renderMessage('Error', e instanceof Error ? e.message : 'Failed to fetch');
      }
    }
  }

  async function updateLive() {
    const live = await fetchLive(config.livePlatform, config.liveChannel);
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
