// FACEIT rank dials for the overlay's FACEIT mode — the level 1–10 skill icons
// and the Challenger emblem. Loaded from assets/faceit/*.svg via Vite's `?raw`
// import (same pattern as socialLogos.ts), so the raw SVG markup is inlined into
// the bundle at build time — no network request, which OBS browser sources can't
// reliably resolve. To use your own art, replace the files in assets/faceit/;
// see assets/faceit/README.md.
//
// The level number is baked into each dial's art (as a vector path, coloured for
// that tier), so the widget doesn't draw it. The Challenger emblem has no number
// — its `#528` leaderboard-position pill is drawn dynamically (see render.ts).
import level1 from '../../assets/faceit/level-1.svg?raw';
import level2 from '../../assets/faceit/level-2.svg?raw';
import level3 from '../../assets/faceit/level-3.svg?raw';
import level4 from '../../assets/faceit/level-4.svg?raw';
import level5 from '../../assets/faceit/level-5.svg?raw';
import level6 from '../../assets/faceit/level-6.svg?raw';
import level7 from '../../assets/faceit/level-7.svg?raw';
import level8 from '../../assets/faceit/level-8.svg?raw';
import level9 from '../../assets/faceit/level-9.svg?raw';
import level10 from '../../assets/faceit/level-10.svg?raw';
import challenger from '../../assets/faceit/challenger.svg?raw';

const DIALS: Record<number, string> = {
  1: level1,
  2: level2,
  3: level3,
  4: level4,
  5: level5,
  6: level6,
  7: level7,
  8: level8,
  9: level9,
  10: level10,
};

// The accent colour of each level's dial (its arc + baked number), reused to
// tint the ELO number in FACEIT mode so it matches the rank — level 5's yellow,
// Challenger's red, etc. Matches FACEIT's own skill-level palette.
const LEVEL_COLORS: Record<number, string> = {
  1: '#EEEEEE',
  2: '#1CE400',
  3: '#1CE400',
  4: '#FFC800',
  5: '#FFC800',
  6: '#FFC800',
  7: '#FFC800',
  8: '#FF6309',
  9: '#FF6309',
  10: '#FE1F00',
};

const CHALLENGER_COLOR = '#E80128';

// Clamps any skill level to the valid 1–10 range so an unexpected value still
// resolves to a dial rather than nothing.
function clampLevel(level: number | undefined): number {
  if (!Number.isFinite(level as number)) return 1;
  return Math.max(1, Math.min(10, Math.round(level as number)));
}

// The dial SVG for a player: the Challenger emblem when they hold a leaderboard
// position, otherwise the level 1–10 dial.
export function faceitDialSvg(level: number | undefined, isChallenger: boolean): string {
  if (isChallenger) return challenger;
  return DIALS[clampLevel(level)];
}

// The accent colour for a player's rank — used for the ELO text tint.
export function faceitLevelColor(level: number | undefined, isChallenger: boolean): string {
  if (isChallenger) return CHALLENGER_COLOR;
  return LEVEL_COLORS[clampLevel(level)];
}
