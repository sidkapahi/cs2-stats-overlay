import { DEFAULT_CONFIG, STAT_KEYS, STAT_MAX, type StatKey, type WidgetConfig } from './types';

const DEFAULT_STATS = DEFAULT_CONFIG.stats.join(',');

// Keeps only valid, unique stat keys, in the order given, capped at STAT_MAX.
function sanitizeStats(keys: string[]): StatKey[] {
  const seen = new Set<StatKey>();
  for (const k of keys) {
    if ((STAT_KEYS as string[]).includes(k)) seen.add(k as StatKey);
  }
  return [...seen].slice(0, STAT_MAX);
}

// Normalizes whatever the user types for their Twitch channel — a bare login, a
// twitch.tv/<name> link, or an @handle — into the lowercase login Twitch's API
// expects. Returns '' for anything that isn't a valid login (4–25 chars of
// letters, digits, or underscores) so an unusable value simply disables the
// session feature rather than firing broken lookups.
export function normalizeTwitchLogin(raw: string): string {
  let s = raw.trim().toLowerCase();
  // Pull the channel name out of a pasted URL, e.g. https://twitch.tv/foo?x=1.
  const urlMatch = /(?:twitch\.tv\/)([^/?#]+)/.exec(s);
  if (urlMatch) s = urlMatch[1];
  s = s.replace(/^@/, '');
  return /^[a-z0-9_]{4,25}$/.test(s) ? s : '';
}

export function configToParams(config: WidgetConfig): URLSearchParams {
  const params = new URLSearchParams();
  params.set('steamId', config.steamId);
  // Twitch login drives session-scoped W/L; only include it when set.
  if (config.twitchLogin) params.set('twitch', config.twitchLogin);
  if (!config.showAvatar) params.set('avatar', '0');
  if (!config.showName) params.set('name', '0');
  // Badge defaults OFF now, so encode the ON case explicitly.
  if (config.showBadge) params.set('badge', '1');
  if (!config.showChange) params.set('change', '0');
  if (!config.showWinLoss) params.set('wl', '0');
  // Stats: 'off' when the block is hidden; otherwise the chosen list, but only
  // when it differs from the default trio (keeps the common URL clean).
  if (!config.showStats) {
    params.set('stats', 'off');
  } else if (config.stats.join(',') !== DEFAULT_STATS) {
    params.set('stats', config.stats.join(','));
  }
  // Match history defaults OFF now, so encode the ON case explicitly.
  if (config.showMatchHistory) params.set('history', '1');
  if (config.matchCount !== DEFAULT_CONFIG.matchCount) {
    params.set('matchCount', String(config.matchCount));
  }
  if (config.refreshInterval !== DEFAULT_CONFIG.refreshInterval) {
    params.set('refresh', String(config.refreshInterval));
  }
  if (config.font !== DEFAULT_CONFIG.font) params.set('font', config.font);
  if (config.bgColor !== DEFAULT_CONFIG.bgColor) {
    params.set('bg', config.bgColor.replace(/^#/, ''));
  }
  if (config.bgOpacity !== DEFAULT_CONFIG.bgOpacity) {
    params.set('bgo', String(config.bgOpacity));
  }
  return params;
}

export function paramsToConfig(params: URLSearchParams): WidgetConfig {
  // Stats: 'off' hides the block; a comma list picks specific stats; absent uses
  // the default trio.
  const statsParam = params.get('stats');
  let showStats = true;
  let stats = [...DEFAULT_CONFIG.stats];
  if (statsParam === 'off' || statsParam === '0') {
    showStats = false;
  } else if (statsParam) {
    const parsed = sanitizeStats(statsParam.split(','));
    if (parsed.length > 0) stats = parsed;
  }

  const bg = params.get('bg');
  const bgo = params.get('bgo');

  return {
    steamId: params.get('steamId') ?? DEFAULT_CONFIG.steamId,
    twitchLogin: normalizeTwitchLogin(params.get('twitch') ?? ''),
    showAvatar: params.get('avatar') !== '0',
    showName: params.get('name') !== '0',
    showBadge: params.get('badge') === '1',
    showChange: params.get('change') !== '0',
    showWinLoss: params.get('wl') !== '0',
    showStats,
    stats,
    showMatchHistory: params.get('history') === '1',
    matchCount: parseInt(params.get('matchCount') ?? String(DEFAULT_CONFIG.matchCount), 10),
    refreshInterval: parseInt(params.get('refresh') ?? String(DEFAULT_CONFIG.refreshInterval), 10),
    font: params.get('font') ?? DEFAULT_CONFIG.font,
    bgColor: bg ? `#${bg.replace(/^#/, '')}` : DEFAULT_CONFIG.bgColor,
    bgOpacity: bgo != null ? Math.max(0, Math.min(100, parseInt(bgo, 10) || 0)) : DEFAULT_CONFIG.bgOpacity,
  };
}
