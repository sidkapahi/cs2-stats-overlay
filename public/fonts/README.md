# Stratum2 web fonts

The customizer UI (headings, labels, buttons) is styled to use **Stratum2** — the
Counter-Strike 2 in-game typeface. Stratum2 is a **proprietary/licensed font**, so
its files are **not** committed to this repo.

To render the UI exactly as in the Figma design, drop your licensed WOFF2 files
here with these exact names:

```
public/fonts/Stratum2-Regular.woff2   /* weight 400 */
public/fonts/Stratum2-Medium.woff2    /* weight 500 */
public/fonts/Stratum2-Bold.woff2      /* weight 700 */
```

Vite copies everything under `public/` to the site root at build time, so these
resolve at `/(cs2-stats-overlay)/fonts/Stratum2-*.woff2` — matching the
`@font-face` rules in `src/customizer/customizer.css`.

Until the files are present, the `@font-face` sources 404 harmlessly at runtime
and the UI falls back to **Inter** (the fallback declared in the `--font-ui`
stack). The build never depends on these files existing.

> Note: only the customizer chrome uses Stratum2. The overlay widget itself uses
> the streamer's chosen Google Font (Inter by default) and is unaffected.
