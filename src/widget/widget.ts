import { trackEvent } from '../shared/analytics';
import { fetchPremierData } from '../shared/api';
import { paramsToConfig } from '../shared/config';
import { loadFont } from '../shared/fonts';
import { renderMessage, renderWidget } from '../shared/render';
import './widget.css';

async function init() {
  const container = document.getElementById('app')!;
  const params = new URLSearchParams(window.location.search);
  const config = paramsToConfig(params);

  // Pull in the chosen Google Font (Inter is already bundled).
  loadFont(config.font);

  if (!config.steamId) {
    container.innerHTML = renderMessage('Error', 'No Steam ID provided.');
    return;
  }

  trackEvent('widget_loaded', { steamId: config.steamId });

  container.innerHTML = `<div class="widget rank-gray no-badge no-avatar loading">
    <div class="widget-main"><div class="identity"><div class="identity-text">
      <div class="name">Loading…</div>
      <div class="rating-line"><span class="rating-plain">—</span></div>
    </div></div></div>
  </div>`;

  async function update() {
    try {
      const data = await fetchPremierData(config.steamId);
      container.innerHTML = renderWidget(config, data);
    } catch (e) {
      container.innerHTML = renderMessage('Error', e instanceof Error ? e.message : 'Failed to fetch');
    }
  }

  await update();
  setInterval(update, config.refreshInterval * 1000);
}

init();
