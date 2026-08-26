import {
  analyticsEnabled,
  consentDecided,
  consentStatus,
  grantConsent,
  initAnalytics,
  revokeConsent,
  trackEvent,
} from "../shared/analytics";
import {
  classifyFetchError,
  fetchPremierData,
  resolveVanityUrl,
  type PremierData,
} from "../shared/api";
import { brandLogoSrc } from "../shared/brandLogo";
import {
  configToParams,
  parseLiveInput,
  settingsFingerprint,
} from "../shared/config";
import { downloadOverlayZip } from "../shared/export";
import { FONT_WEIGHTS, GOOGLE_FONTS, fontStack, loadFont } from "../shared/fonts";
import { renderMessage, renderWidget } from "../shared/render";
import {
  gitHubLogo,
  koFiLogo,
  streamElementsLogo,
  twitchLogo,
} from "../shared/socialLogos";
import { parseSteamInput } from "../shared/steamId";
import {
  DEFAULT_CONFIG,
  STAT_KEYS,
  STAT_LABELS,
  STAT_MAX,
  type StatKey,
  type WidgetConfig,
} from "../shared/types";
import "../widget/widget.css";
import "./customizer.css";

// External links for the header button row.
const REPO_URL = "https://github.com/sidkapahi/cs2-stats-overlay";
const KOFI_URL = "https://ko-fi.com/kapahi";
const TWITCH_URL = "https://twitch.tv/kapowhi";

// ---- Inline icons (self-contained; no expiring remote assets) -------------
// The GitHub, Ko-fi, Twitch, and StreamElements marks are loaded from
// assets/logos/*.svg (see ../shared/socialLogos). Drop your own SVG into that
// folder to swap any of them out — no code change needed.
const ICON_GITHUB = gitHubLogo;
const ICON_KOFI = koFiLogo;
const ICON_TWITCH = twitchLogo;
const ICON_STREAMELEMENTS = streamElementsLogo;
const ICON_CARET = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
// Phosphor "Copy" and "Check" (bold weight) — the copy button crossfades from
// one to the other when the URL is copied.
const ICON_COPY = `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M216,28H88A12,12,0,0,0,76,40V76H40A12,12,0,0,0,28,88V216a12,12,0,0,0,12,12H168a12,12,0,0,0,12-12V180h36a12,12,0,0,0,12-12V40A12,12,0,0,0,216,28ZM156,204H52V100H156Zm48-48H180V88a12,12,0,0,0-12-12H100V52H204Z"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,0,1,17-17L96,183.51,215.51,63.51a12,12,0,0,1,17,17Z"/></svg>`;
const ICON_WARNING = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>`;

// Prompt shown in the preview before a Steam ID resolves.
const PROMPT_TEXT = "ENTER YOUR STEAM NAME OR PROFILE LINK";
// Stat pills are shown in the Figma order (K/D, AIM, AVG, WIN %).
const STAT_PILL_ORDER: StatKey[] = ["kd", "aim", "avg", "winpct"];

let currentConfig: WidgetConfig = { ...DEFAULT_CONFIG, stats: [...DEFAULT_CONFIG.stats] };

// Analytics properties describing the setup someone landed on. `combo` is the
// whole configuration as one string, so a PostHog breakdown ranks the
// most popular combinations directly; the individual fields let you slice a
// single setting (e.g. how many people pick each font). No steamId here — the
// question is which *settings* are popular, not who chose them.
function configEventProps(
  config: WidgetConfig,
): Record<string, string | number | boolean> {
  return {
    combo: settingsFingerprint(config),
    font: config.font,
    fontWeight: config.fontWeight,
    stats: config.showStats ? config.stats.join(",") : "off",
    showBadge: config.showBadge,
    showMatchHistory: config.showMatchHistory,
    showWinLoss: config.showWinLoss,
    showChange: config.showChange,
    matchCount: config.matchCount,
    bgOpacity: config.bgOpacity,
    usesLive: Boolean(config.livePlatform),
    livePlatform: config.livePlatform,
  };
}
let previewData: PremierData | null = null;
let previewError: string | null = null;
let previewLoading = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTrackedSteamId: string | null = null;
// Last live channel we counted, so adopting a channel fires one adoption event
// (not one per keystroke).
let lastTrackedLive = "";
// Which source drives the W/L pills: 'leetify' = rolling window, 'live' =
// per-stream session (reveals the live-channel field). Mirrors whether a live
// channel is set on the config.
let wlMode: "leetify" | "live" = "leetify";
// Bumped on every new resolve so a slow vanity lookup that finishes after the
// user has typed something else can't overwrite the newer input's result.
let resolveToken = 0;

function getWidgetUrl(): string {
  const params = configToParams(currentConfig);
  const base =
    window.location.origin + window.location.pathname.replace(/\/$/, "");
  return `${base}/widget/?${params.toString()}`;
}

// Never render the widget larger than natural size in the preview; fitPreview
// only ever scales further *down* to fit the (responsive) preview panel.
const MAX_PREVIEW_SCALE = 1;

// Scales the rendered widget so it always fits inside the preview panel, however
// long the name or however much content is enabled — the panel flexes with the
// window and the widget shrinks to stay within it.
function fitPreview() {
  const area = document.getElementById("preview-widget");
  if (!area) return;
  const widget = area.querySelector<HTMLElement>(".widget");
  if (!widget) return;

  widget.style.transform = "scale(1)";
  const style = getComputedStyle(area);
  const availW =
    area.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
  const availH =
    area.clientHeight -
    parseFloat(style.paddingTop) -
    parseFloat(style.paddingBottom);

  const natW = widget.offsetWidth;
  const natH = widget.offsetHeight;
  if (natW === 0 || natH === 0) return;

  const scale = Math.min(MAX_PREVIEW_SCALE, availW / natW, availH / natH);
  widget.style.transform = `scale(${scale})`;
}

function promptCardHtml(text: string): string {
  return `<div class="preview-prompt">${text}</div>`;
}

function renderPreview() {
  const body = document.getElementById("preview-widget");
  const banner = document.getElementById("preview-banner");
  const bannerText = document.getElementById("preview-banner-text");
  if (!body || !banner || !bannerText) return;

  if (previewError) {
    bannerText.textContent = previewError;
    banner.hidden = false;
    // Keep the last good widget behind the banner if we have one; otherwise the
    // prompt card so the panel never looks broken.
    body.innerHTML = previewData
      ? renderWidget(currentConfig, previewData)
      : promptCardHtml(PROMPT_TEXT);
  } else {
    banner.hidden = true;
    if (previewLoading) {
      body.innerHTML = renderMessage("Loading", "…");
    } else if (!previewData) {
      body.innerHTML = promptCardHtml(PROMPT_TEXT);
    } else {
      body.innerHTML = renderWidget(currentConfig, previewData);
    }
  }

  fitPreview();
}

function updateGeneratedUrl() {
  const urlEl = document.getElementById("generated-url") as HTMLInputElement;
  const url = currentConfig.steamId ? getWidgetUrl() : "";
  urlEl.value = url;

  const zipBtn = document.getElementById("export-zip") as HTMLButtonElement | null;
  if (zipBtn) zipBtn.disabled = !url;
  // Dim the whole export bar until there's a real widget URL to hand off.
  const bar = document.getElementById("exportbar");
  if (bar) bar.classList.toggle("is-empty", !url);
}

// Turns whatever is in the Steam-ID box (a raw Steam64 ID, a full profile URL,
// or a custom /id/ vanity URL) into a Steam64 ID, then loads the preview for it.
async function resolveAndLoad(rawInput: string) {
  const token = ++resolveToken;
  const parsed = parseSteamInput(rawInput);

  if (parsed.kind === "empty") {
    currentConfig.steamId = "";
    previewData = null;
    previewError = null;
    previewLoading = false;
    renderPreview();
    updateGeneratedUrl();
    return;
  }

  if (parsed.kind === "invalid") {
    currentConfig.steamId = "";
    previewData = null;
    previewError = "Enter a Steam64 ID or a steamcommunity.com profile link";
    previewLoading = false;
    renderPreview();
    updateGeneratedUrl();
    return;
  }

  let steamId: string;
  if (parsed.kind === "vanity") {
    // Resolving a vanity URL is a network round-trip; show a loading state.
    previewLoading = true;
    previewError = null;
    renderPreview();
    try {
      steamId = await resolveVanityUrl(parsed.vanity);
    } catch (e) {
      if (token !== resolveToken) return; // superseded by newer input
      trackEvent("preview_error", { stage: "resolve", reason: classifyFetchError(e) });
      previewError = e instanceof Error ? e.message : "Failed to resolve";
      previewData = null;
      previewLoading = false;
      currentConfig.steamId = "";
      renderPreview();
      updateGeneratedUrl();
      return;
    }
    if (token !== resolveToken) return; // superseded by newer input
  } else {
    steamId = parsed.steamId;
  }

  currentConfig.steamId = steamId;
  updateGeneratedUrl();
  await loadPreview(token);
}

async function loadPreview(token = ++resolveToken) {
  if (!currentConfig.steamId) {
    previewData = null;
    previewError = null;
    previewLoading = false;
    renderPreview();
    return;
  }

  previewLoading = true;
  previewError = null;
  renderPreview();

  try {
    const data = await fetchPremierData(currentConfig.steamId);
    if (token !== resolveToken) return; // superseded by newer input
    previewData = data;
    if (currentConfig.steamId !== lastTrackedSteamId) {
      // Just a funnel count — no Steam ID sent (we only want *that* someone got
      // this far, not *who*).
      trackEvent("steam_id_entered");
      lastTrackedSteamId = currentConfig.steamId;
    }
  } catch (e) {
    if (token !== resolveToken) return; // superseded by newer input
    trackEvent("preview_error", { stage: "stats", reason: classifyFetchError(e) });
    previewError = e instanceof Error ? e.message : "Failed to load";
    previewData = null;
  }
  previewLoading = false;
  renderPreview();
  updateGeneratedUrl();
}

function debouncedLoadPreview(rawInput: string) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => resolveAndLoad(rawInput), 600);
}

// Simple display toggles → config keys. Stats and win/loss gate nested controls,
// so they're bound separately.
const checkboxMap: Record<string, keyof WidgetConfig> = {
  "show-avatar": "showAvatar",
  "show-name": "showName",
  "show-change": "showChange",
  "show-history": "showMatchHistory",
  "show-badge": "showBadge",
};

// ---- Stats picker (pill row) ---------------------------------------------
function syncStatsUi() {
  const on = currentConfig.showStats;
  const row = document.getElementById("stats-pills")!;
  // Collapse the stat pills entirely when the block is off, rather than showing
  // them dimmed — the sub-options only belong in the list when their parent is on.
  row.hidden = !on;

  const atMax = currentConfig.stats.length >= STAT_MAX;
  for (const btn of row.querySelectorAll<HTMLButtonElement>(".pill")) {
    const key = btn.dataset.stat as StatKey;
    const selected = currentConfig.stats.includes(key);
    btn.classList.toggle("selected", selected);
    // Disable when the block is off, or when the cap is hit and this one isn't
    // already selected (so you must deselect before picking another).
    btn.disabled = !on || (atMax && !selected);
  }
}

function bindStats() {
  const showStats = document.getElementById("show-stats") as HTMLInputElement;
  showStats.checked = currentConfig.showStats;
  showStats.addEventListener("change", () => {
    currentConfig.showStats = showStats.checked;
    syncStatsUi();
    renderPreview();
    updateGeneratedUrl();
  });

  const row = document.getElementById("stats-pills")!;
  row.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".pill");
    if (!btn || btn.disabled) return;
    const key = btn.dataset.stat as StatKey;
    if (currentConfig.stats.includes(key)) {
      currentConfig.stats = currentConfig.stats.filter((k) => k !== key);
    } else {
      if (currentConfig.stats.length >= STAT_MAX) return; // cap enforced
      // Insert keeping STAT_KEYS order.
      currentConfig.stats = STAT_KEYS.filter(
        (k) => currentConfig.stats.includes(k) || k === key,
      );
    }
    syncStatsUi();
    renderPreview();
    updateGeneratedUrl();
  });
}

// ---- Win/Loss source toggle (Leetify vs live session) ---------------------
function syncWlUi() {
  const on = currentConfig.showWinLoss;
  const row = document.getElementById("wl-mode")!;
  // Hide the Leetify/Live source picker entirely when W/L is off — the sub-
  // options only belong in the list when their parent is on.
  row.hidden = !on;
  for (const seg of row.querySelectorAll<HTMLButtonElement>(".seg")) {
    seg.classList.toggle("selected", seg.dataset.mode === wlMode);
    seg.disabled = !on;
  }
  const liveField = document.getElementById("live-channel") as HTMLInputElement;
  liveField.hidden = !(on && wlMode === "live");
}

// Reads the live-channel input, detects the platform, and writes the parsed
// result onto the config. Returns the config's channel (or '' if unusable).
function applyLiveInput(): string {
  const liveField = document.getElementById("live-channel") as HTMLInputElement;
  const parsed = parseLiveInput(liveField.value);
  currentConfig.livePlatform = parsed?.platform ?? "";
  currentConfig.liveChannel = parsed?.channel ?? "";
  return currentConfig.liveChannel;
}

// Fires one `live_selected` event the first time a valid channel is adopted (and
// again if it's changed to a different one), tagged with the platform and the
// channel (a public handle) so you can see which channels use it.
function trackLiveSelected() {
  const key = `${currentConfig.livePlatform}:${currentConfig.liveChannel}`;
  if (currentConfig.liveChannel && key !== lastTrackedLive) {
    lastTrackedLive = key;
    trackEvent("live_selected", {
      platform: currentConfig.livePlatform,
      channel: currentConfig.liveChannel,
    });
  }
}

function bindWl() {
  const showWl = document.getElementById("show-wl") as HTMLInputElement;
  showWl.checked = currentConfig.showWinLoss;
  showWl.addEventListener("change", () => {
    currentConfig.showWinLoss = showWl.checked;
    syncWlUi();
    renderPreview();
    updateGeneratedUrl();
  });

  const row = document.getElementById("wl-mode")!;
  row.addEventListener("click", (e) => {
    const seg = (e.target as HTMLElement).closest<HTMLButtonElement>(".seg");
    if (!seg || seg.disabled) return;
    wlMode = seg.dataset.mode === "live" ? "live" : "leetify";
    // Leetify mode drops the live channel entirely; Live mode adopts whatever is
    // already typed in the (now visible) field.
    if (wlMode === "live") {
      applyLiveInput();
    } else {
      currentConfig.livePlatform = "";
      currentConfig.liveChannel = "";
    }
    trackLiveSelected();
    syncWlUi();
    updateGeneratedUrl();
  });

  const liveField = document.getElementById("live-channel") as HTMLInputElement;
  liveField.addEventListener("input", () => {
    applyLiveInput();
    trackLiveSelected();
    updateGeneratedUrl();
  });
}

// ---- Font combobox -------------------------------------------------------
function renderFontList(filter: string) {
  const list = document.getElementById("font-list")!;
  const q = filter.trim().toLowerCase();
  const matches = GOOGLE_FONTS.filter((f) => f.toLowerCase().includes(q));
  list.innerHTML = matches
    .map(
      (f) =>
        `<div class="combo-item${
          f === currentConfig.font ? " selected" : ""
        }" data-font="${f}" style="font-family:${fontStack(f)}">${f}</div>`,
    )
    .join("");
  // Preload the fonts shown so the list previews in their own typeface.
  for (const f of matches.slice(0, 40)) loadFont(f);
}

function bindFont() {
  const search = document.getElementById("font-search") as HTMLInputElement;
  const list = document.getElementById("font-list")!;

  const open = () => {
    renderFontList("");
    list.hidden = false;
  };
  const close = () => {
    list.hidden = true;
    search.value = currentConfig.font;
    search.style.fontFamily = fontStack(currentConfig.font);
  };

  search.addEventListener("focus", () => {
    search.value = "";
    open();
  });
  search.addEventListener("input", () => renderFontList(search.value));
  search.addEventListener("blur", () => {
    // Delay so a click on an item registers before the list hides.
    setTimeout(close, 150);
  });

  list.addEventListener("mousedown", (e) => {
    const item = (e.target as HTMLElement).closest(".combo-item");
    if (!item) return;
    e.preventDefault();
    const font = (item as HTMLElement).dataset.font!;
    currentConfig.font = font;
    loadFont(font, currentConfig.fontWeight);
    close();
    renderPreview();
    updateGeneratedUrl();
  });
}

// ---- Font weight select --------------------------------------------------
function bindWeight() {
  const sel = document.getElementById("font-weight") as HTMLSelectElement;
  sel.value = String(currentConfig.fontWeight);
  sel.addEventListener("change", () => {
    currentConfig.fontWeight = parseInt(sel.value, 10);
    loadFont(currentConfig.font, currentConfig.fontWeight);
    renderPreview();
    updateGeneratedUrl();
  });
}

// ---- Background color + opacity -----------------------------------------
function bindBackground() {
  const color = document.getElementById("bg-color") as HTMLInputElement;
  const hex = document.getElementById("bg-hex") as HTMLInputElement;
  const opacity = document.getElementById("bg-opacity") as HTMLInputElement;

  const applyColor = (value: string) => {
    currentConfig.bgColor = value;
    color.value = value;
    hex.value = value;
    renderPreview();
    updateGeneratedUrl();
  };

  color.addEventListener("input", () => applyColor(color.value));

  hex.addEventListener("input", () => {
    const v = hex.value.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
      applyColor(v.startsWith("#") ? v.toLowerCase() : `#${v.toLowerCase()}`);
    }
  });

  // Opacity reads as "100%" but accepts a raw number while typing.
  opacity.addEventListener("focus", () => {
    opacity.value = String(currentConfig.bgOpacity);
  });
  opacity.addEventListener("input", () => {
    const digits = opacity.value.replace(/[^\d]/g, "");
    currentConfig.bgOpacity = Math.max(0, Math.min(100, parseInt(digits || "0", 10)));
    renderPreview();
    updateGeneratedUrl();
  });
  opacity.addEventListener("blur", () => {
    opacity.value = `${currentConfig.bgOpacity}%`;
  });
}

// Pushes currentConfig into every control (used on init).
function syncControlsFromConfig() {
  for (const [id, key] of Object.entries(checkboxMap)) {
    (document.getElementById(id) as HTMLInputElement).checked = currentConfig[
      key
    ] as boolean;
  }

  (document.getElementById("show-stats") as HTMLInputElement).checked =
    currentConfig.showStats;
  syncStatsUi();

  (document.getElementById("show-wl") as HTMLInputElement).checked =
    currentConfig.showWinLoss;
  wlMode = currentConfig.livePlatform ? "live" : "leetify";
  (document.getElementById("live-channel") as HTMLInputElement).value =
    currentConfig.liveChannel;
  syncWlUi();

  const search = document.getElementById("font-search") as HTMLInputElement;
  search.value = currentConfig.font;
  search.style.fontFamily = fontStack(currentConfig.font);
  loadFont(currentConfig.font, currentConfig.fontWeight);
  (document.getElementById("font-weight") as HTMLSelectElement).value = String(
    currentConfig.fontWeight,
  );

  (document.getElementById("bg-color") as HTMLInputElement).value =
    currentConfig.bgColor;
  (document.getElementById("bg-hex") as HTMLInputElement).value =
    currentConfig.bgColor;
  (document.getElementById("bg-opacity") as HTMLInputElement).value =
    `${currentConfig.bgOpacity}%`;
}

function bindControls() {
  const steamInput = document.getElementById("steam-id") as HTMLInputElement;
  steamInput.addEventListener("input", () => {
    // The raw input may be a URL or vanity name, not a Steam64 ID yet, so clear
    // the generated URL until resolveAndLoad has a real Steam64 ID to put in it.
    currentConfig.steamId = "";
    updateGeneratedUrl();
    debouncedLoadPreview(steamInput.value);
  });

  for (const [id, key] of Object.entries(checkboxMap)) {
    const el = document.getElementById(id) as HTMLInputElement;
    el.checked = currentConfig[key] as boolean;
    el.addEventListener("change", () => {
      (currentConfig as unknown as Record<string, boolean>)[key] = el.checked;
      renderPreview();
      updateGeneratedUrl();
    });
  }

  bindStats();
  bindWl();
  bindFont();
  bindWeight();
  bindBackground();

  // Outbound header links (GitHub / Ko-fi / Twitch). One delegated listener
  // reads data-link so a single social_click event, broken down by `target`,
  // covers all three. They open in a new tab, so the page stays put and the
  // event has time to send.
  document.querySelector(".link-row")?.addEventListener("click", (e) => {
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("[data-link]");
    if (link) trackEvent("social_click", { target: link.dataset.link ?? "unknown" });
  });

  document.getElementById("copy-url")!.addEventListener("click", () => {
    const urlEl = document.getElementById("generated-url") as HTMLInputElement;
    // Ignore repeat clicks while the "Link Copied!" confirmation is showing so
    // we don't capture that placeholder as the URL to restore.
    if (urlEl.value && urlEl.dataset.copiedRestore === undefined) {
      navigator.clipboard.writeText(urlEl.value);
      trackEvent("widget_url_copied", configEventProps(currentConfig));
      const box = document.getElementById("copy-url")!.closest(".url-box")!;
      box.classList.add("copied");
      // Swap the icon to a check mark and the URL text to a confirmation, then
      // restore both after a short beat.
      urlEl.dataset.copiedRestore = urlEl.value;
      urlEl.value = "Link Copied!";
      setTimeout(() => {
        box.classList.remove("copied");
        if (urlEl.dataset.copiedRestore !== undefined) {
          urlEl.value = urlEl.dataset.copiedRestore;
          delete urlEl.dataset.copiedRestore;
        }
      }, 1500);
    }
  });

  const zipBtn = document.getElementById("export-zip")!;
  zipBtn.addEventListener("click", () => {
    if (!currentConfig.steamId) return;
    downloadOverlayZip(currentConfig, getWidgetUrl());
    trackEvent("export_zip_downloaded", configEventProps(currentConfig));
    const label = zipBtn.querySelector(".zip-label");
    if (label) {
      const original = label.textContent;
      label.textContent = "DOWNLOADED ✓";
      setTimeout(() => (label.textContent = original), 1600);
    }
  });
}

function statPillsHtml(): string {
  return STAT_PILL_ORDER.map(
    (key) =>
      `<button type="button" class="pill" data-stat="${key}">${STAT_LABELS[key]}</button>`,
  ).join("");
}

function weightOptionsHtml(): string {
  return FONT_WEIGHTS.map(
    (w) => `<option value="${w.value}">${w.label}</option>`,
  ).join("");
}

// Cookie consent banner + Privacy & Cookies modal. Analytics starts opted out
// (see initAnalytics) and stays that way until the visitor explicitly clicks
// Accept or Reject — nothing else counts as consent, so the banner remains
// until they choose. The banner is a card pinned to the bottom of the setup
// sidebar. The overlay is cookieless and shows none of this.
function mountConsentUi() {
  if (!analyticsEnabled()) return; // no analytics configured → nothing to consent to

  // The modal is an overlay, so it lives on <body>.
  const root = document.createElement("div");
  root.className = "consent-root";
  root.innerHTML = `
    <div class="modal-overlay" id="privacy-overlay" hidden>
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="privacy-title">
        <div class="modal-head">
          <h2 id="privacy-title" class="modal-title">Privacy &amp; Cookies</h2>
          <button type="button" class="modal-close" id="privacy-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-updated">Last updated: 2026-08-26</p>
          <p>kapKit's CS2 overlay customizer uses <strong>PostHog</strong>, a privacy-friendly analytics service, to understand how the tool is used so it can be improved. We keep this to a minimum and never sell your data.</p>

          <h3>What we collect on the customizer</h3>
          <p>Anonymous usage events only:</p>
          <ul>
            <li>Pages viewed, and where you arrived from (referrer / UTM tags)</li>
            <li>That a Steam ID was entered — <strong>not the ID itself</strong></li>
            <li>The live channel you enter (a public Twitch, YouTube, or Kick handle) and which platform it is, if you use a live session</li>
            <li>Which widget settings you build (fonts, stats, colors, and so on)</li>
            <li>When you copy the widget URL or export the ZIP</li>
            <li>Clicks on the GitHub, Ko-fi, and Twitch links</li>
            <li>Errors, so broken states can be found and fixed</li>
          </ul>

          <h3>What we do NOT collect</h3>
          <ul>
            <li>Your Steam ID is never attached to analytics</li>
            <li>No session recording, no keystrokes, no personal profiles</li>
            <li>We don't sell or share your data</li>
          </ul>

          <h3>Live-session status checks</h3>
          <p>If you set a live session, the overlay checks whether your channel is streaming by asking the matching platform — <strong>Twitch</strong>, <strong>YouTube</strong>, or <strong>Kick</strong> — through a small proxy service. Only your <strong>public channel handle</strong> is sent (never your Steam ID), and the proxy shields your viewers' IP addresses from the platform. The YouTube check uses <strong>YouTube API Services</strong>; by using it you're also subject to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener">YouTube Terms of Service</a>, and Google's handling of any data is covered by the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Google Privacy Policy</a>.</p>

          <h3>The overlay is cookieless</h3>
          <p>The OBS overlay itself sets <strong>no cookies</strong> and stores nothing on your machine for analytics. It sends only anonymous counts (that it loaded, that a stream went live, and errors), so it needs no consent and shows no banner on stream.</p>

          <h3>Cookies &amp; your choice</h3>
          <p>On this customizer, analytics uses first-party cookies to recognise return visits. You choose whether to allow them — rejecting means no analytics cookies are set. You can change your mind any time right here:</p>
          <div class="cookie-actions modal-consent">
            <span class="consent-state" id="consent-state"></span>
            <button type="button" class="cookie-btn cookie-reject" id="modal-reject">Reject</button>
            <button type="button" class="cookie-btn cookie-accept" id="modal-accept">Accept</button>
          </div>

          <h3>Questions?</h3>
          <p>Reach out any time at <a class="modal-mail" href="mailto:hey@sidkapahi.com">hey@sidkapahi.com</a>.</p>

          <p class="modal-fine">Analytics is processed by PostHog on our behalf. This notice is provided in good faith and isn't legal advice.</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // The banner is a small card pinned to the bottom of the setup sidebar.
  const banner = document.createElement("div");
  banner.className = "cookie-banner";
  banner.hidden = true;
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Cookie consent");
  banner.innerHTML = `
    <img class="cookie-logo" src="${brandLogoSrc}" alt="kapKit">
    <div class="cookie-copy">
      <p class="cookie-title">Delicious Cookies</p>
      <p class="cookie-text">We use privacy-friendly analytics to help improve CS2 Stats Overlay and its features.</p>
    </div>
    <button type="button" class="cookie-privacy" id="cookie-privacy">Privacy Policy</button>
    <div class="cookie-actions">
      <button type="button" class="cookie-btn cookie-reject" id="cookie-reject">No thanks</button>
      <button type="button" class="cookie-btn cookie-accept" id="cookie-accept">Allow</button>
    </div>
  `;
  document.body.appendChild(banner);

  const overlay = root.querySelector<HTMLElement>("#privacy-overlay")!;
  const stateEl = root.querySelector<HTMLElement>("#consent-state")!;
  const modalAccept = root.querySelector<HTMLElement>("#modal-accept")!;
  const modalReject = root.querySelector<HTMLElement>("#modal-reject")!;

  // Reflect the saved choice: label it in the status line and mark the active
  // button (aria-pressed + .is-active) so it's clear which option is selected.
  const refreshState = () => {
    const status = consentStatus();
    stateEl.textContent =
      status === "granted"
        ? "You've allowed analytics cookies."
        : status === "denied"
          ? "You've rejected analytics cookies."
          : "No choice made yet.";
    const accepted = status === "granted";
    const rejected = status === "denied";
    modalAccept.classList.toggle("is-active", accepted);
    modalReject.classList.toggle("is-active", rejected);
    modalAccept.setAttribute("aria-pressed", String(accepted));
    modalReject.setAttribute("aria-pressed", String(rejected));
  };
  const openModal = () => {
    refreshState();
    overlay.hidden = false;
  };
  const closeModal = () => {
    overlay.hidden = true;
  };

  // Applies a choice and hides the banner. The choice is only ever made by
  // explicitly clicking Accept or Reject — nothing else counts as consent, so
  // the banner stays until the visitor decides.
  function decide(accepted: boolean) {
    if (accepted) grantConsent();
    else revokeConsent();
    banner.hidden = true;
    refreshState();
  }

  banner.querySelector("#cookie-accept")!.addEventListener("click", () => decide(true));
  banner.querySelector("#cookie-reject")!.addEventListener("click", () => decide(false));
  banner.querySelector("#cookie-privacy")!.addEventListener("click", openModal);
  modalAccept.addEventListener("click", () => decide(true));
  modalReject.addEventListener("click", () => decide(false));
  root.querySelector("#privacy-close")!.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModal();
  });
  document.getElementById("open-privacy")?.addEventListener("click", openModal);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  // Show the banner until an explicit choice is made (nothing on return visits).
  if (!consentDecided()) banner.hidden = false;
}

function init() {
  // Customizer analytics: cookie-based, but starts opted out — nothing is
  // captured until the visitor accepts via the consent banner (mounted below).
  initAnalytics();

  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div class="shell">
      <aside class="setup">
        <div class="setup-head">
          <div class="brand-block">
            <h1 class="setup-title">CS2 Overlay Widget</h1>
            <p class="setup-sub">Customize and use your own overlay widget for CS2. Paste your Twitch, YouTube, or Kick link to get a live-session W/L.</p>
          </div>
          <div class="link-row">
            <a class="link-chip link-repo" data-link="github" href="${REPO_URL}" target="_blank" rel="noopener">${ICON_GITHUB}<span>cs2-stats-overlay</span></a>
            <a class="link-chip link-kofi" data-link="kofi" href="${KOFI_URL}" target="_blank" rel="noopener" aria-label="Ko-fi">${ICON_KOFI}</a>
            <a class="link-chip link-twitch" data-link="twitch" href="${TWITCH_URL}" target="_blank" rel="noopener" aria-label="Twitch">${ICON_TWITCH}</a>
          </div>
        </div>

        <div class="setup-body">
          <section class="group group-steam">
            <h2 class="group-label">STEAM</h2>
            <input type="text" id="steam-id" class="field-input" placeholder="Steam64 ID, profile link, or vanity name" autocomplete="off" spellcheck="false">
          </section>

          <div class="divider" role="separator"></div>

          <section class="group">
            <h2 class="group-label">DESIGN</h2>
            <div class="stack">
              <label class="check"><input type="checkbox" id="show-name"><span class="check-text">Name</span></label>
              <label class="check"><input type="checkbox" id="show-avatar"><span class="check-text">Avatar</span></label>
              <label class="check"><input type="checkbox" id="show-badge"><span class="check-text">In-game Styled Badge</span></label>

              <div class="dual">
                <div class="field field-grow">
                  <label class="field-label" for="font-search">Font</label>
                  <div class="combo">
                    <div class="combo-box">
                      <input type="text" id="font-search" class="field-input combo-input" placeholder="Search Google Fonts…" autocomplete="off" spellcheck="false">
                      <span class="combo-caret">${ICON_CARET}</span>
                    </div>
                    <div class="combo-list" id="font-list" hidden></div>
                  </div>
                </div>
                <div class="field field-weight">
                  <label class="field-label" for="font-weight">Weight</label>
                  <select id="font-weight" class="field-input select">${weightOptionsHtml()}</select>
                </div>
              </div>

              <div class="dual">
                <div class="field field-grow">
                  <label class="field-label" for="bg-hex">Background Color</label>
                  <div class="color-row">
                    <label class="swatch">
                      <input type="color" id="bg-color" value="#242424" aria-label="Background color">
                    </label>
                    <input type="text" id="bg-hex" class="field-input hex" value="#242424" spellcheck="false" aria-label="Background hex">
                  </div>
                </div>
                <div class="field field-opacity">
                  <label class="field-label" for="bg-opacity">Opacity</label>
                  <input type="text" id="bg-opacity" class="field-input opacity" value="100%" inputmode="numeric" aria-label="Background opacity percent">
                </div>
              </div>
            </div>
          </section>

          <div class="divider" role="separator"></div>

          <section class="group">
            <h2 class="group-label">DATA</h2>
            <div class="stack">
              <label class="check"><input type="checkbox" id="show-change"><span class="check-text">Loss/Gain</span></label>

              <div class="check-group">
                <label class="check"><input type="checkbox" id="show-wl"><span class="check-text">Win Loss Record</span></label>
                <div class="seg-row" id="wl-mode">
                  <button type="button" class="seg" data-mode="leetify">LEETIFY</button>
                  <button type="button" class="seg" data-mode="live">LIVE SESSION</button>
                </div>
                <input type="text" id="live-channel" class="field-input" placeholder="Twitch, YouTube, or Kick link" autocomplete="off" spellcheck="false" hidden>
              </div>

              <div class="check-group">
                <label class="check"><input type="checkbox" id="show-stats"><span class="check-text">Stats (${STAT_MAX} Max)</span></label>
                <div class="pill-row" id="stats-pills">${statPillsHtml()}</div>
              </div>

              <label class="check"><input type="checkbox" id="show-history"><span class="check-text">Match History</span></label>
            </div>
          </section>
        </div>

        <div class="setup-foot">
          <img class="foot-logo" src="${brandLogoSrc}" alt="kapKit">
          <span class="foot-tag">Made with ❤️ in Toronto</span>
          <button type="button" class="foot-link" id="open-privacy">Privacy &amp; Cookies</button>
        </div>
      </aside>

      <div class="stage">
        <div class="exportbar is-empty" id="exportbar">
          <div class="export-url">
            <label class="field-label" for="generated-url">OBS Browser Source URL</label>
            <div class="url-box">
              <input type="text" id="generated-url" class="url-input" readonly placeholder="Enter a Steam ID to generate the URL">
              <button type="button" id="copy-url" class="icon-btn" aria-label="Copy URL"><span class="icon-copy">${ICON_COPY}</span><span class="icon-check">${ICON_CHECK}</span></button>
            </div>
          </div>
          <div class="export-zip">
            <label class="field-label">Custom Widget</label>
            <button type="button" id="export-zip" class="zip-btn" disabled><span class="se-logo">${ICON_STREAMELEMENTS}</span><span class="zip-label">DOWNLOAD ZIP</span></button>
          </div>
        </div>

        <div class="preview" id="preview">
          <div class="preview-banner" id="preview-banner" hidden>${ICON_WARNING}<span id="preview-banner-text"></span></div>
          <div class="preview-body" id="preview-widget"></div>
        </div>
      </div>
    </div>
  `;

  bindControls();
  syncControlsFromConfig();
  mountConsentUi();

  // Re-fit the preview when the responsive layout changes the panel size.
  window.addEventListener("resize", fitPreview);

  const params = new URLSearchParams(window.location.search);
  const idFromUrl = params.get("id");
  if (idFromUrl) {
    const steamInput = document.getElementById("steam-id") as HTMLInputElement;
    steamInput.value = idFromUrl;
    resolveAndLoad(idFromUrl);
  } else {
    renderPreview();
  }
}

init();
