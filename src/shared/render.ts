import type { PremierData } from './api';
import { brandLogoSrc } from './brandLogo';
import { defaultAvatarSrc } from './defaultAvatar';
import { fontStack } from './fonts';
import { formatRating, getRankTier } from './ranks';
import { STAT_LABELS, type RankTier, type StatKey, type WidgetConfig } from './types';

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

// Converts a #rrggbb hex + a 0..100 opacity into an rgba() string for the
// widget's configurable background. Falls back to the default tone on a bad hex.
function bgRgba(hex: string, opacity: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const value = m ? m[1] : '242424';
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = Math.max(0, Math.min(100, opacity)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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

  // Stats block: the user-picked subset of K/D, average kills, aim rating, and
  // win rate over the tracked matches (order follows config.stats).
  let statsHtml = '';
  if (config.showStats && config.stats.length > 0) {
    const withKd = recent.filter((g) => g.kills != null && g.deaths != null);
    const totalKills = withKd.reduce((s, g) => s + g.kills!, 0);
    const totalDeaths = withKd.reduce((s, g) => s + g.deaths!, 0);
    const statValues: Record<StatKey, string> = {
      kd: totalDeaths > 0 ? (totalKills / totalDeaths).toFixed(2) : '—',
      avg: withKd.length > 0 ? (totalKills / withKd.length).toFixed(1) : '—',
      aim: data.aimRating.toFixed(1),
      winpct: `${Math.round((data.winRate ?? 0) * 100)}%`,
      // FACEIT-only stats: lifetime ADR and headshot %, unset in Premier mode.
      adr: data.adr != null ? data.adr.toFixed(1) : '—',
      hs: data.hsPct != null ? `${Math.round(data.hsPct * 100)}%` : '—',
    };
    const cells = config.stats
      .map(
        (k) =>
          `<div class="stat"><span class="stat-val">${statValues[k]}</span><span class="stat-lbl">${STAT_LABELS[k]}</span></div>`,
      )
      .join('');
    statsHtml = `<div class="stats">${cells}</div>`;
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

  // Design overrides: configurable background tint/opacity, font family, and
  // weight. `--w-weight` drives the body/name text; `--w-weight-strong` is one
  // step heavier for the rating/diff, so the default (700) reproduces the
  // original 700/800 hierarchy exactly.
  const weight = Math.max(100, Math.min(900, config.fontWeight || 700));
  const weightStrong = Math.min(900, weight + 100);
  const rootStyle = `background: ${bgRgba(config.bgColor, config.bgOpacity)}; font-family: ${fontStack(
    config.font,
  )}; --w-weight: ${weight}; --w-weight-strong: ${weightStrong};`;

  return `
    <div class="widget ${modifiers}" style="${rootStyle}">
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
