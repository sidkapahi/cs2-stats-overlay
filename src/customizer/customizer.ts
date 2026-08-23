import { trackEvent } from "../shared/analytics";
import {
  fetchPremierData,
  resolveVanityUrl,
  type PremierData,
} from "../shared/api";
import { configToParams, normalizeTwitchLogin } from "../shared/config";
import { GOOGLE_FONTS, fontStack, loadFont } from "../shared/fonts";
import { renderMessage, renderWidget } from "../shared/render";
import { parseSteamInput } from "../shared/steamId";
import {
  DEFAULT_CONFIG,
  STAT_KEYS,
  STAT_LABELS,
  STAT_MAX,
  type WidgetConfig,
} from "../shared/types";
import "../widget/widget.css";
import "./customizer.css";

let currentConfig: WidgetConfig = { ...DEFAULT_CONFIG, stats: [...DEFAULT_CONFIG.stats] };
let previewData: PremierData | null = null;
let previewError: string | null = null;
let previewLoading = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTrackedSteamId: string | null = null;
// Bumped on every new resolve so a slow vanity lookup that finishes after the
// user has typed something else can't overwrite the newer input's result.
let resolveToken = 0;

function getWidgetUrl(): string {
  const params = configToParams(currentConfig);
  const base =
    window.location.origin + window.location.pathname.replace(/\/$/, "");
  return `${base}/widget/?${params.toString()}`;
}

// Never render the widget larger than this in the preview (keeps the original
// look for light configs); fitPreview only ever scales further *down* to fit.
const MAX_PREVIEW_SCALE = 0.72;

// Scales the rendered widget so it always fits inside the fixed preview panel,
// however long the name or however much content is enabled — the panel size
// stays put and the widget shrinks to stay within it.
function fitPreview() {
  const area = document.getElementById("preview-widget")!;
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

function renderPreview() {
  const previewEl = document.getElementById("preview-widget")!;

  if (previewError) {
    previewEl.innerHTML = renderMessage("Error", previewError);
  } else if (previewLoading) {
    previewEl.innerHTML = renderMessage("Loading", "…");
  } else if (!previewData) {
    previewEl.innerHTML = renderMessage("Enter a Steam ID or profile link", "—");
  } else {
    previewEl.innerHTML = renderWidget(currentConfig, previewData);
  }

  fitPreview();
}

function updateGeneratedUrl() {
  const urlEl = document.getElementById("generated-url") as HTMLInputElement;
  urlEl.value = currentConfig.steamId ? getWidgetUrl() : "";
}

// Turns whatever is in the Steam-ID box (a raw Steam64 ID, a full profile URL,
// or a custom /id/ vanity URL) into a Steam64 ID, then loads the preview for it.
// Vanity URLs are resolved server-side via the proxy Worker.
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
    previewError =
      "Enter a Steam64 ID or a steamcommunity.com profile link";
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
      trackEvent("steam_id_entered", { steamId: currentConfig.steamId });
      lastTrackedSteamId = currentConfig.steamId;
    }
  } catch (e) {
    if (token !== resolveToken) return; // superseded by newer input
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

// Simple display toggles → config keys. Stats are handled separately because
// they gate a nested picker (see bindStats).
const checkboxMap: Record<string, keyof WidgetConfig> = {
  "show-avatar": "showAvatar",
  "show-name": "showName",
  "show-change": "showChange",
  "show-wl": "showWinLoss",
  "show-history": "showMatchHistory",
  "show-badge": "showBadge",
};

// ---- Stats picker --------------------------------------------------------
// "Show stats" gates a nested set of stat checkboxes (K/D, AVG, AIM, WIN %),
// capped at STAT_MAX selections. config.stats is kept in STAT_KEYS order.
function syncStatsUi() {
  const on = currentConfig.showStats;
  const group = document.getElementById("stats-group")!;
  group.classList.toggle("disabled", !on);

  const atMax = currentConfig.stats.length >= STAT_MAX;
  for (const key of STAT_KEYS) {
    const el = document.getElementById(`stat-${key}`) as HTMLInputElement;
    const checked = currentConfig.stats.includes(key);
    el.checked = checked;
    // Disable when the block is off, or when the cap is hit and this one isn't
    // already selected (so you must deselect before picking another).
    el.disabled = !on || (atMax && !checked);
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

  for (const key of STAT_KEYS) {
    const el = document.getElementById(`stat-${key}`) as HTMLInputElement;
    el.addEventListener("change", () => {
      if (el.checked) {
        if (currentConfig.stats.length >= STAT_MAX) {
          el.checked = false; // guard against races; cap is enforced
          return;
        }
        // Insert keeping STAT_KEYS order.
        currentConfig.stats = STAT_KEYS.filter(
          (k) => currentConfig.stats.includes(k) || k === key,
        );
      } else {
        currentConfig.stats = currentConfig.stats.filter((k) => k !== key);
      }
      syncStatsUi();
      renderPreview();
      updateGeneratedUrl();
    });
  }
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
    loadFont(font);
    close();
    renderPreview();
    updateGeneratedUrl();
  });
}

// ---- Background color + opacity -----------------------------------------
function bindBackground() {
  const color = document.getElementById("bg-color") as HTMLInputElement;
  const hex = document.getElementById("bg-hex") as HTMLInputElement;
  const opacity = document.getElementById("bg-opacity") as HTMLInputElement;
  const opacityVal = document.getElementById("bg-opacity-val")!;

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

  opacity.addEventListener("input", () => {
    currentConfig.bgOpacity = parseInt(opacity.value, 10);
    opacityVal.textContent = `${currentConfig.bgOpacity}%`;
    renderPreview();
    updateGeneratedUrl();
  });
}

// Pushes currentConfig into every control (used on init and Restore defaults).
function syncControlsFromConfig() {
  for (const [id, key] of Object.entries(checkboxMap)) {
    (document.getElementById(id) as HTMLInputElement).checked = currentConfig[
      key
    ] as boolean;
  }
  (document.getElementById("twitch-login") as HTMLInputElement).value =
    currentConfig.twitchLogin;

  (document.getElementById("show-stats") as HTMLInputElement).checked =
    currentConfig.showStats;
  syncStatsUi();

  (document.getElementById("match-count") as HTMLSelectElement).value = String(
    currentConfig.matchCount,
  );
  (document.getElementById("refresh-interval") as HTMLSelectElement).value =
    String(currentConfig.refreshInterval);

  const search = document.getElementById("font-search") as HTMLInputElement;
  search.value = currentConfig.font;
  search.style.fontFamily = fontStack(currentConfig.font);
  loadFont(currentConfig.font);

  (document.getElementById("bg-color") as HTMLInputElement).value =
    currentConfig.bgColor;
  (document.getElementById("bg-hex") as HTMLInputElement).value =
    currentConfig.bgColor;
  const opacity = document.getElementById("bg-opacity") as HTMLInputElement;
  opacity.value = String(currentConfig.bgOpacity);
  document.getElementById("bg-opacity-val")!.textContent =
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

  const twitchInput = document.getElementById("twitch-login") as HTMLInputElement;
  twitchInput.addEventListener("input", () => {
    // Accepts a bare login, a twitch.tv/<name> link, or an @handle; the URL only
    // carries the normalized login (empty when it isn't a valid channel name).
    currentConfig.twitchLogin = normalizeTwitchLogin(twitchInput.value);
    updateGeneratedUrl();
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
  bindFont();
  bindBackground();

  const matchCountEl = document.getElementById(
    "match-count",
  ) as HTMLSelectElement;
  matchCountEl.value = String(currentConfig.matchCount);
  matchCountEl.addEventListener("change", () => {
    currentConfig.matchCount = parseInt(matchCountEl.value, 10);
    renderPreview();
    updateGeneratedUrl();
  });

  const refreshEl = document.getElementById(
    "refresh-interval",
  ) as HTMLSelectElement;
  refreshEl.value = String(currentConfig.refreshInterval);
  refreshEl.addEventListener("change", () => {
    currentConfig.refreshInterval = parseInt(refreshEl.value, 10);
    updateGeneratedUrl();
  });

  const mapEl = document.getElementById("preview-map") as HTMLSelectElement;
  mapEl.addEventListener("change", () => {
    const previewArea = document.getElementById("preview-widget")!;
    previewArea.style.backgroundImage = `url('https://leetify.com/assets/images/maps/${mapEl.value}.jpg')`;
  });

  document.getElementById("copy-url")!.addEventListener("click", () => {
    const urlEl = document.getElementById("generated-url") as HTMLInputElement;
    if (urlEl.value) {
      navigator.clipboard.writeText(urlEl.value);
      trackEvent("widget_url_copied", { steamId: currentConfig.steamId });
      const btn = document.getElementById("copy-url")!;
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    }
  });

  document.getElementById("reset-btn")!.addEventListener("click", () => {
    const { steamId, twitchLogin } = currentConfig;
    currentConfig = {
      ...DEFAULT_CONFIG,
      stats: [...DEFAULT_CONFIG.stats],
      steamId,
      twitchLogin,
    };
    syncControlsFromConfig();
    renderPreview();
    updateGeneratedUrl();
  });
}

function statRowsHtml(): string {
  return STAT_KEYS.map(
    (key) =>
      `<label class="checkbox-row stat-option"><input type="checkbox" id="stat-${key}"><span>${STAT_LABELS[key]}</span></label>`,
  ).join("");
}

function init() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div class="customizer">
      <header class="header">
        <div class="header-left">
          <h1 class="title">CS2 Stats Overlay</h1>
          <p class="subtitle">OBS browser source widget for your CS2 Premier stats</p>
        </div>
        <a class="header-link" href="https://leetify.com" target="_blank" rel="noopener">Powered by Leetify</a>
      </header>

      <div class="layout">
        <div class="panel settings-panel">
          <h2 class="panel-title">Settings</h2>

          <div class="field">
            <label class="field-label" for="steam-id">Steam ID</label>
            <input type="text" id="steam-id" class="input" placeholder="Steam64 ID, profile link, or vanity name (e.g. kapahiii)">
            <span class="field-hint">Paste your profile URL, a Steam64 ID, or just your custom URL name.</span>
          </div>

          <div class="field">
            <label class="field-label" for="twitch-login">Twitch username <span class="field-optional">(optional)</span></label>
            <input type="text" id="twitch-login" class="input" placeholder="your channel name" autocomplete="off" spellcheck="false">
            <span class="field-hint">When set, win/loss resets each time you go live and freezes (keeping the last stream's record) when you go offline. Needs the Steam proxy Worker with Twitch keys — see the README.</span>
          </div>

          <div class="field">
            <label class="field-label" for="match-count">Recent matches for data</label>
            <select id="match-count" class="input">
              <option value="5">5</option>
              <option value="10" selected>10</option>
            </select>
            <span class="field-hint">How many games we'll use to compute the stats (not including win/loss).</span>
          </div>

          <div class="section">
            <h3 class="section-title">Data displayed</h3>
            <label class="checkbox-row"><input type="checkbox" id="show-avatar" checked><span>Show avatar</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-name" checked><span>Show player name</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-change" checked><span>Show rank change</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-wl" checked><span>Show win/loss</span></label>

            <label class="checkbox-row"><input type="checkbox" id="show-stats" checked><span>Show stats</span></label>
            <div class="sub-options" id="stats-group">
              <span class="sub-hint">Pick up to ${STAT_MAX}</span>
              ${statRowsHtml()}
            </div>

            <label class="checkbox-row"><input type="checkbox" id="show-history"><span>Show match history</span></label>
          </div>

          <div class="section">
            <h3 class="section-title">Design</h3>
            <label class="checkbox-row"><input type="checkbox" id="show-badge"><span>Show in-game badge instead</span></label>

            <div class="field" style="margin-top: 12px;">
              <label class="field-label" for="font-search">Font</label>
              <div class="combo">
                <input type="text" id="font-search" class="input" placeholder="Search Google Fonts…" autocomplete="off" spellcheck="false">
                <div class="combo-list" id="font-list" hidden></div>
              </div>
            </div>

            <div class="field">
              <label class="field-label">Background</label>
              <div class="bg-row">
                <input type="color" id="bg-color" class="color-swatch" value="#242424" aria-label="Background color">
                <input type="text" id="bg-hex" class="input bg-hex" value="#242424" spellcheck="false" aria-label="Background hex">
              </div>
              <span class="field-hint">Click the swatch to pick a color.</span>
            </div>

            <div class="field">
              <label class="field-label" for="bg-opacity">Opacity <span id="bg-opacity-val">100%</span></label>
              <input type="range" id="bg-opacity" class="range" min="0" max="100" value="100">
            </div>
          </div>

          <div class="field">
            <label class="field-label" for="refresh-interval">Refresh interval</label>
            <select id="refresh-interval" class="input">
              <option value="30">30 seconds</option>
              <option value="60" selected>1 minute</option>
              <option value="180">3 minutes</option>
              <option value="300">5 minutes</option>
            </select>
            <span class="field-hint">Leetify takes a few minutes to sync a finished match, so faster than ~30s rarely shows results sooner — it mainly uses more of your API rate limit.</span>
          </div>

          <button class="btn btn-secondary" id="reset-btn">Restore defaults</button>
        </div>

        <div class="panel preview-panel">
          <h2 class="panel-title">Widget Preview</h2>
          <div id="preview-widget" class="preview-area"></div>

          <div class="field" style="margin-top: 16px;">
            <select id="preview-map" class="input">
              <option value="de_anubis">Anubis</option>
              <option value="de_ancient">Ancient</option>
              <option value="de_dust2">Dust 2</option>
              <option value="de_inferno">Inferno</option>
              <option value="de_mirage">Mirage</option>
              <option value="de_nuke">Nuke</option>
              <option value="de_overpass">Overpass</option>
              <option value="de_train">Train</option>
              <option value="de_vertigo">Vertigo</option>
            </select>
          </div>

          <div class="field" style="margin-top: 16px;">
            <label class="field-label">Widget URL</label>
            <div class="url-row">
              <input type="text" id="generated-url" class="input url-input" readonly placeholder="Enter a Steam ID to generate URL">
              <button class="btn btn-primary" id="copy-url">Copy</button>
            </div>
            <span class="field-hint">Add this URL as a Browser Source in OBS (recommended size: 660×180)</span>
          </div>
        </div>
      </div>

      <footer class="footer">
        <span>CS2 Stats Overlay</span>
        <span>Data from <a href="https://leetify.com" target="_blank" rel="noopener">Leetify</a></span>
      </footer>
    </div>
  `;

  bindControls();
  syncControlsFromConfig();

  // Re-fit the preview when the responsive layout changes the panel width.
  window.addEventListener("resize", fitPreview);

  const params = new URLSearchParams(window.location.search);
  const idFromUrl = params.get("id");
  if (idFromUrl) {
    const steamInput = document.getElementById("steam-id") as HTMLInputElement;
    steamInput.value = idFromUrl;
    // Accepts a Steam64 ID or a profile link here too — resolveAndLoad handles both.
    resolveAndLoad(idFromUrl);
  } else {
    renderPreview();
  }
}

init();
