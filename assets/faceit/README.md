# FACEIT rank dials

The rank emblems shown behind the ELO in **FACEIT mode** — the level 1–10 dials
and the Challenger badge. Drop your SVGs here with the **exact file names**
below; the build embeds each one (inline, self-contained, so OBS browser sources
need no extra network request) into a level → SVG map (`src/shared/faceitRanks.ts`).

| File             | Shown for                                             |
| ---------------- | ----------------------------------------------------- |
| `level-1.svg`    | FACEIT skill level 1                                   |
| `level-2.svg`    | FACEIT skill level 2                                   |
| `level-3.svg`    | FACEIT skill level 3                                   |
| `level-4.svg`    | FACEIT skill level 4                                   |
| `level-5.svg`    | FACEIT skill level 5                                   |
| `level-6.svg`    | FACEIT skill level 6                                   |
| `level-7.svg`    | FACEIT skill level 7                                   |
| `level-8.svg`    | FACEIT skill level 8                                   |
| `level-9.svg`    | FACEIT skill level 9                                   |
| `level-10.svg`   | FACEIT skill level 10                                  |
| `challenger.svg` | Challenger (the red-laurel emblem with the `#528` pill) |

## Notes

- **Level 10 vs Challenger:** every level-10 player shows `level-10.svg`; the
  `challenger.svg` emblem + the `#528` position pill are used only when the
  FACEIT API returns a leaderboard position for that player (the top of the
  regional CS2 leaderboard). If you only have one level-10 art, name it
  `level-10.svg`; `challenger.svg` is optional and falls back to `level-10.svg`.
- **Keep each SVG's `viewBox`** so it scales cleanly into the badge slot.
- **The level number** in the dial can be baked into your art, or left out and
  drawn by the widget — tell me which and I'll match it in `render.ts`.
- Any missing file falls back to a plain rank-coloured ELO number, so a partial
  drop won't break the overlay.
