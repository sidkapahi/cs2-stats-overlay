import type { PremierData } from './api';
import { brandLogoSvg } from './brandLogo';
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
// assets/kapKit_logo.svg, inlined via brandLogoSvg so mark + wordmark stay a
// single self-contained asset.
function brandHtml(): string {
  return `<div class="hist-brand">${brandLogoSvg}</div>`;
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

  const avatarHtml =
    config.showAvatar && data.avatarUrl
      ? `<img class="avatar" src="${esc(data.avatarUrl)}" alt="">`
      : '';

  const nameHtml = config.showName ? `<div class="name">${esc(data.name)}</div>` : '';

  // W/L pills — total wins and losses across the returned recent matches.
  const wlHtml = `
    <div class="wl">
      <div class="wl-pill wl-win">W${data.wins}</div>
      <div class="wl-pill wl-loss">L${data.losses}</div>
    </div>`;

  // Stats block: overall win rate, aim rating, and K/D over the tracked matches.
  let statsHtml = '';
  if (config.showStats) {
    const withKd = recent.filter((g) => g.kills != null && g.deaths != null);
    const totalKills = withKd.reduce((s, g) => s + g.kills!, 0);
    const totalDeaths = withKd.reduce((s, g) => s + g.deaths!, 0);
    const kd = totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : '—';
    const winPct = `${Math.round(data.winRate * 100)}%`;
    statsHtml = `
      <div class="stats">
        <div class="stat"><span class="stat-val">${winPct}</span><span class="stat-lbl">WIN</span></div>
        <div class="stat"><span class="stat-val">${data.aimRating.toFixed(1)}</span><span class="stat-lbl">AIM</span></div>
        <div class="stat"><span class="stat-val">${kd}</span><span class="stat-lbl">K/D</span></div>
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
    config.showAvatar && data.avatarUrl ? 'has-avatar' : 'no-avatar',
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
