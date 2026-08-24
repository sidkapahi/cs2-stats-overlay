import { trackEvent } from "../shared/analytics";
import {
  fetchPremierData,
  resolveVanityUrl,
  type PremierData,
} from "../shared/api";
import { brandLogoSrc } from "../shared/brandLogo";
import { configToParams, normalizeTwitchLogin } from "../shared/config";
import { downloadOverlayZip } from "../shared/export";
import { FONT_WEIGHTS, GOOGLE_FONTS, fontStack, loadFont } from "../shared/fonts";
import { renderMessage, renderWidget } from "../shared/render";
import {
  buyMeACoffeeLogo,
  gitHubLogo,
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
const BMC_URL = "https://buymeacoffee.com/sidkapahi";
const TWITCH_URL = "https://twitch.tv/kapowhi";

// ---- Inline icons (self-contained; no expiring remote assets) -------------
// The GitHub, Buy Me a Coffee, Twitch, and StreamElements marks are loaded from
// assets/logos/*.svg (see ../shared/socialLogos). Drop your own SVG into that
// folder to swap any of them out — no code change needed.
const ICON_GITHUB = gitHubLogo;
const ICON_BMC = buyMeACoffeeLogo;
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
let previewData: PremierData | null = null;
let previewError: string | null = null;
let previewLoading = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastTrackedSteamId: string | null = null;
// Which source drives the W/L pills: 'leetify' = rolling window, 'twitch' =
// per-stream session (reveals the Twitch username field). Mirrors whether a
// Twitch login is set on the config.
let wlMode: "leetify" | "twitch" = "leetify";
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

// ---- Win/Loss source toggle (Leetify vs Twitch session) -------------------
function syncWlUi() {
  const on = currentConfig.showWinLoss;
  const row = document.getElementById("wl-mode")!;
  // Hide the Leetify/Twitch source picker entirely when W/L is off — the sub-
  // options only belong in the list when their parent is on.
  row.hidden = !on;
  for (const seg of row.querySelectorAll<HTMLButtonElement>(".seg")) {
    seg.classList.toggle("selected", seg.dataset.mode === wlMode);
    seg.disabled = !on;
  }
  const twitchField = document.getElementById("twitch-login") as HTMLInputElement;
  twitchField.hidden = !(on && wlMode === "twitch");
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
    wlMode = seg.dataset.mode === "twitch" ? "twitch" : "leetify";
    const twitchField = document.getElementById("twitch-login") as HTMLInputElement;
    // Leetify mode drops the Twitch login entirely; Twitch mode adopts whatever
    // is already typed in the (now visible) field.
    currentConfig.twitchLogin =
      wlMode === "twitch" ? normalizeTwitchLogin(twitchField.value) : "";
    syncWlUi();
    updateGeneratedUrl();
  });

  const twitchField = document.getElementById("twitch-login") as HTMLInputElement;
  twitchField.addEventListener("input", () => {
    currentConfig.twitchLogin = normalizeTwitchLogin(twitchField.value);
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
  wlMode = currentConfig.twitchLogin ? "twitch" : "leetify";
  (document.getElementById("twitch-login") as HTMLInputElement).value =
    currentConfig.twitchLogin;
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

  document.getElementById("copy-url")!.addEventListener("click", () => {
    const urlEl = document.getElementById("generated-url") as HTMLInputElement;
    // Ignore repeat clicks while the "Link Copied!" confirmation is showing so
    // we don't capture that placeholder as the URL to restore.
    if (urlEl.value && urlEl.dataset.copiedRestore === undefined) {
      navigator.clipboard.writeText(urlEl.value);
      trackEvent("widget_url_copied", { steamId: currentConfig.steamId });
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
    trackEvent("export_zip_downloaded", { steamId: currentConfig.steamId });
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

function init() {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    <div class="shell">
      <aside class="setup">
        <div class="setup-head">
          <div class="brand-block">
            <h1 class="setup-title">CS2 Overlay Widget</h1>
            <p class="setup-sub">Customize and use your own overlay widget for CS2. Enter your Twitch username to have a live W/L.</p>
          </div>
          <div class="link-row">
            <a class="link-chip link-repo" href="${REPO_URL}" target="_blank" rel="noopener">${ICON_GITHUB}<span>cs2-stats-overlay</span></a>
            <a class="link-chip link-bmc" href="${BMC_URL}" target="_blank" rel="noopener" aria-label="Buy me a coffee">${ICON_BMC}</a>
            <a class="link-chip link-twitch" href="${TWITCH_URL}" target="_blank" rel="noopener" aria-label="Twitch">${ICON_TWITCH}</a>
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
                  <button type="button" class="seg" data-mode="twitch">TWITCH LIVE</button>
                </div>
                <input type="text" id="twitch-login" class="field-input" placeholder="Twitch username" autocomplete="off" spellcheck="false" hidden>
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
