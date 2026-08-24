# Stratum2 web fonts

The customizer UI (headings, labels, buttons) is styled to use **Stratum2** — the
Counter-Strike 2 in-game typeface. Stratum2 is a **proprietary/licensed font**, so
its files are **not** committed to this repo.

Drop your licensed webfont-kit files here with these exact names (this matches a
typical Font-Squirrel-style kit, so **no renaming needed**):

```
public/fonts/stratum2-regular-webfont.woff   (or .ttf)   /* weight 400 */
public/fonts/stratum2-medium-webfont.woff    (or .ttf)   /* weight 500 */
public/fonts/stratum2-bold-webfont.woff      (or .ttf)   /* weight 700 */
```

## Which files from the kit?

A kit usually ships `.eot`, `.svg`, `.ttf`, `.woff` (and sometimes `.woff2`) per
weight, plus `*-demo.html` preview pages.

- **Use `.woff`** — smallest of the common formats and supported by every modern
  browser. Just the three `*-webfont.woff` files are enough.
- `.ttf` also works and can be added as a fallback (the `@font-face` lists it).
- `.woff2`, if your kit has it, is preferred (smallest) — the `@font-face` lists
  it first.
- **Skip** `.eot` (dead IE-only format), `.svg` (deprecated SVG fonts), and the
  `*-demo.html` pages.

Each `@font-face` in `src/customizer/customizer.css` lists `.woff2 → .woff →
.ttf`, so the browser loads whichever you provide and ignores the rest.

Vite copies everything under `public/` to the site root at build time, so these
resolve at `/fonts/stratum2-*-webfont.*` — matching those
`@font-face` rules. Until the files are present the sources 404 harmlessly and
the UI falls back to **Inter**; the build never depends on the files existing.

> Note: only the customizer chrome uses Stratum2. The overlay widget itself uses
> the streamer's chosen Google Font (Inter by default) and is unaffected.
