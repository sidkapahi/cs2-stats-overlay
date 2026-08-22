import { trackEvent } from "../shared/analytics";
import {
  fetchPremierData,
  resolveVanityUrl,
  type PremierData,
} from "../shared/api";
import { configToParams } from "../shared/config";
import { renderMessage, renderWidget } from "../shared/render";
import { parseSteamInput } from "../shared/steamId";
import { DEFAULT_CONFIG, type WidgetConfig } from "../shared/types";
import "../widget/widget.css";
import "./customizer.css";

let currentConfig: WidgetConfig = { ...DEFAULT_CONFIG };
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

function renderPreview() {
  const previewEl = document.getElementById("preview-widget")!;

  if (previewError) {
    previewEl.innerHTML = renderMessage("Error", previewError);
    return;
  }

  if (previewLoading) {
    previewEl.innerHTML = renderMessage("Loading", "…");
    return;
  }

  if (!previewData) {
    previewEl.innerHTML = renderMessage("Enter a Steam ID or profile link", "—");
    return;
  }

  previewEl.innerHTML = renderWidget(currentConfig, previewData);
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

// Display-option checkboxes → config keys, in the order they appear in the UI.
const checkboxMap: Record<string, keyof WidgetConfig> = {
  "show-avatar": "showAvatar",
  "show-name": "showName",
  "show-badge": "showBadge",
  "show-change": "showChange",
  "show-wl": "showWinLoss",
  "show-stats": "showStats",
  "show-history": "showMatchHistory",
};

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
    const steamId = currentConfig.steamId;
    currentConfig = { ...DEFAULT_CONFIG, steamId };

    for (const [id, key] of Object.entries(checkboxMap)) {
      (document.getElementById(id) as HTMLInputElement).checked = currentConfig[
        key
      ] as boolean;
    }
    matchCountEl.value = String(currentConfig.matchCount);
    refreshEl.value = String(currentConfig.refreshInterval);
    renderPreview();
    updateGeneratedUrl();
  });
}

function init() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div class="customizer">
      <header class="header">
        <h1 class="title">CS2 Stats Overlay</h1>
        <p class="subtitle">OBS browser source widget for your CS2 Premier stats</p>
      </header>

      <div class="layout">
        <div class="panel settings-panel">
          <h2 class="panel-title">Settings</h2>

          <div class="field">
            <label class="field-label" for="steam-id">Steam ID, profile link, or vanity name</label>
            <input type="text" id="steam-id" class="input" placeholder="Steam64 ID, profile link, or vanity name (e.g. kapahiii)">
            <span class="field-hint">Paste your profile URL, a Steam64 ID, or just your custom URL name — we'll figure out the rest</span>
          </div>

          <div class="section">
            <h3 class="section-title">Display Options</h3>
            <label class="checkbox-row"><input type="checkbox" id="show-avatar" checked><span>Show avatar</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-name" checked><span>Show player name</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-badge" checked><span>Show rank badge</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-change" checked><span>Show rank change (+/-)</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-wl" checked><span>Show win/loss (W L)</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-stats" checked><span>Show stats (K/D, AVG, AIM)</span></label>
            <label class="checkbox-row"><input type="checkbox" id="show-history" checked><span>Show match history (W L T ...)</span></label>
          </div>

          <div class="field">
            <label class="field-label" for="match-count">Recent matches to use</label>
            <select id="match-count" class="input">
              <option value="3">3</option>
              <option value="5">5</option>
              <option value="8">8</option>
              <option value="10" selected>10</option>
            </select>
            <span class="field-hint">Used for K/D and the match-history strip</span>
          </div>

          <div class="field">
            <label class="field-label" for="refresh-interval">Refresh interval</label>
            <select id="refresh-interval" class="input">
              <option value="60" selected>1 minute</option>
              <option value="180">3 minutes</option>
              <option value="300">5 minutes</option>
            </select>
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
        <p>CS2 Stats Overlay · Data from <a href="https://leetify.com" target="_blank">Leetify</a></p>
      </footer>
    </div>
  `;

  bindControls();

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
