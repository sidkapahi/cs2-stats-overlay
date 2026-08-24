# Stratum2 web fonts

The customizer UI (headings, labels, buttons) is styled to use **Stratum2** — the
Counter-Strike 2 in-game typeface. Stratum2 is a **proprietary/licensed font**, so
its files are **not** committed to this repo.

To render the UI exactly as in the Figma design, drop your licensed font files
here with these exact names. Either **`.ttf`** or **`.woff2`** works — each face
in `src/customizer/customizer.css` lists both and the browser uses whichever is
present:

```
public/fonts/Stratum2-Regular.ttf   (or .woff2)   /* weight 400 */
public/fonts/Stratum2-Medium.ttf    (or .woff2)   /* weight 500 */
public/fonts/Stratum2-Bold.ttf      (or .woff2)   /* weight 700 */
```

`.ttf` is fine and needs no conversion. `.woff2` is ~30–50% smaller, so if you
want the site to load a bit faster you can optionally convert them (e.g.
`woff2_compress Stratum2-Bold.ttf`, or an online TTF→WOFF2 tool) and drop the
`.woff2` files in instead — or alongside the `.ttf`; the CSS prefers `.woff2`
when both exist.

Vite copies everything under `public/` to the site root at build time, so these
resolve at `/(cs2-stats-overlay)/fonts/Stratum2-*` — matching the `@font-face`
rules in `src/customizer/customizer.css`.

Until the files are present, the `@font-face` sources 404 harmlessly at runtime
and the UI falls back to **Inter** (the fallback declared in the `--font-ui`
stack). The build never depends on these files existing.

> Note: only the customizer chrome uses Stratum2. The overlay widget itself uses
> the streamer's chosen Google Font (Inter by default) and is unaffected.
