import type { PremierData } from './api';
import { brandLogoSrc } from './brandLogo';
import { defaultAvatarSrc } from './defaultAvatar';
import { formatRating, getRankTier } from './ranks';
import type { RankTier, WidgetConfig } from './types';

// Escapes user-controlled text (the player name) before it goes into innerHTML.
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// The Premier rank emblem shown behind the rating when the badge is enabled — a
// right-leaning parallelogram with the tier's deep fill and two bright "//"
// slashes on the left, recreated from the Figma badge sheet (prem_1..prem_7).
// preserveAspectRatio="none" lets the vector stretch to the rating box while the
// box keeps the source 206:74 ratio, so the lean stays true.
export function badgeSvg(tier: RankTier): string {
  return `<svg class="badge-svg" viewBox="0 0 206 74" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <polygon points="20,0 206,0 186,74 0,74" fill="${tier.badgeBg}"/>
    <polygon points="26,0 35,0 15,74 6,74" fill="${tier.badgeAccent}"/>
    <polygon points="44,0 53,0 33,74 24,74" fill="${tier.badgeAccent}"/>
  </svg>`;
}

// The kapKit brand logo shown in the match-history footer — the uploaded
// assets/kapKit_logo.png, embedded via brandLogoSrc so mark + wordmark stay a
// single self-contained asset.
function brandHtml(): string {
  return `<div class="hist-brand"><img class="hist-logo" src="${brandLogoSrc}" alt="kapKit"></div>`;
}

// Builds the full widget markup for a config + data pair. Shared by the live
// widget and the customizer preview so both stay pixel-identical.
export function renderWidget(config: WidgetConfig, data: PremierData): string {
  const tier = getRankTier(data.rating);
  const recent = data.recentGames.slice(0, config.matchCount);

  // Rating — either the rank badge or a plain rank-coloured number.
  const ratingText = formatRating(data.rating);
  const ratingHtml = config.showBadge
    ? `<div class="rating-badge">${badgeSvg(tier)}<span class="rating-badge-text">${ratingText}</span></div>`
    : `<span class="rating-plain">${ratingText}</span>`;

  // Rank-point diff (e.g. +250). Hidden when disabled or not derivable.
  let diffHtml = '';
  if (config.showChange && data.ratingDiff !== 0) {
    const cls = data.ratingDiff > 0 ? 'positive' : 'negative';
    const prefix = data.ratingDiff > 0 ? '+' : '';
    diffHtml = `<span class="rating-diff ${cls}">${prefix}${data.ratingDiff}</span>`;
  }

  // When the avatar is enabled, always fill the slot: use the player's real
  // Steam avatar when it resolved, otherwise fall back to the default blue
  // "smiley" mark so a missing/private avatar still shows a face rather than a
  // gap.
  const avatarSrc = data.avatarUrl ? esc(data.avatarUrl) : defaultAvatarSrc;
  const avatarHtml = config.showAvatar
    ? `<img class="avatar" src="${avatarSrc}" alt="">`
    : '';

  const nameHtml = config.showName ? `<div class="name">${esc(data.name)}</div>` : '';

  // W/L pills — total wins and losses across the returned recent matches.
  let wlHtml = '';
  if (config.showWinLoss) {
    wlHtml = `
    <div class="wl">
      <div class="wl-pill wl-win">W${data.wins}</div>
      <div class="wl-pill wl-loss">L${data.losses}</div>
    </div>`;
  }

  // Stats block: K/D, average kills, and aim rating over the tracked matches
  // (order + metrics per the Figma design, node 1-470).
  let statsHtml = '';
  if (config.showStats) {
    const withKd = recent.filter((g) => g.kills != null && g.deaths != null);
    const totalKills = withKd.reduce((s, g) => s + g.kills!, 0);
    const totalDeaths = withKd.reduce((s, g) => s + g.deaths!, 0);
    const kd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : '—';
    const avgKills = withKd.length > 0 ? (totalKills / withKd.length).toFixed(1) : '—';
    statsHtml = `
      <div class="stats">
        <div class="stat"><span class="stat-val">${kd}</span><span class="stat-lbl">K/D</span></div>
        <div class="stat"><span class="stat-val">${avgKills}</span><span class="stat-lbl">AVG</span></div>
        <div class="stat"><span class="stat-val">${data.aimRating.toFixed(1)}</span><span class="stat-lbl">AIM</span></div>
      </div>`;
  }

  // Match-history strip: W/L/T letters (oldest → newest) plus the wordmark.
  let historyHtml = '';
  if (config.showMatchHistory) {
    const letters = [...recent]
      .reverse()
      .map((g) => {
        const cls = g.outcome === 'win' ? 'w' : g.outcome === 'tie' ? 't' : 'l';
        const lbl = g.outcome === 'win' ? 'W' : g.outcome === 'tie' ? 'T' : 'L';
        return `<span class="${cls}">${lbl}</span>`;
      })
      .join('');
    historyHtml = `
      <div class="widget-history">
        <div class="hist-letters">${letters}</div>
        ${brandHtml()}
      </div>`;
  }

  const modifiers = [
    `rank-${tier.key}`,
    config.showBadge ? 'has-badge' : 'no-badge',
    config.showAvatar ? 'has-avatar' : 'no-avatar',
  ].join(' ');

  return `
    <div class="widget ${modifiers}">
      <div class="widget-main">
        <div class="identity">
          ${avatarHtml}
          <div class="identity-text">
            ${nameHtml}
            <div class="rating-line">
              ${ratingHtml}
              ${diffHtml}
            </div>
          </div>
        </div>
        ${wlHtml}
        ${statsHtml}
      </div>
      ${historyHtml}
    </div>`;
}

// Simple single-line state (loading / error / prompt) styled like the widget.
export function renderMessage(title: string, value: string): string {
  return `
    <div class="widget rank-gray no-badge no-avatar">
      <div class="widget-main">
        <div class="identity">
          <div class="identity-text">
            <div class="name">${esc(title)}</div>
            <div class="rating-line"><span class="rating-plain">${esc(value)}</span></div>
          </div>
        </div>
      </div>
    </div>`;
}
