// Brand logos for the customizer's header links and the StreamElements export.
//
// These are loaded from assets/logos/*.svg via Vite's `?raw` import, so the raw
// SVG markup is inlined into the bundle at build time (no extra network request,
// which OBS browser sources can't reliably resolve anyway).
//
// To use your own logos, just replace the matching file in assets/logos/ — see
// assets/logos/README.md. No code changes needed. The seeded defaults use
// `fill="currentColor"`/`stroke="currentColor"` so they inherit each button's
// text color; a brand SVG with its own colors will paint those instead, which is
// usually what you want when dropping in an official logo.
import gitHubLogo from "../../assets/logos/github.svg?raw";
import koFiLogo from "../../assets/logos/kofi.svg?raw";
import streamElementsLogo from "../../assets/logos/streamelements.svg?raw";
import twitchLogo from "../../assets/logos/twitch.svg?raw";
// Monochrome platform marks for the live-session chip (currentColor, so they sit
// on the dark chip). Distinct from the coloured `twitchLogo` header link mark.
import twitchMark from "../../assets/logos/twitch-mark.svg?raw";
import youTubeMark from "../../assets/logos/youtube-mark.svg?raw";
import kickMark from "../../assets/logos/kick-mark.svg?raw";

export {
  gitHubLogo,
  koFiLogo,
  streamElementsLogo,
  twitchLogo,
  twitchMark,
  youTubeMark,
  kickMark,
};
