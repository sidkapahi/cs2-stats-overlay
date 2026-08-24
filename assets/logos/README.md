# Social / brand logos

Drop your own logos here to replace the ones shown in the customizer. These are
the "spot to upload your own assets" — the app loads whatever is in these files
at build time, so **just overwrite the file and rebuild**. No code changes are
needed.

| File                 | Where it shows up                                              |
| -------------------- | ------------------------------------------------------------- |
| `twitch.svg`         | The purple Twitch button in the header link row               |
| `buymeacoffee.svg`   | The yellow Buy Me a Coffee button in the header link row      |
| `streamelements.svg` | Next to the "Streamelements Widget" label in the export bar   |

## How to use your own

1. Replace the file above with your own `.svg`, keeping the **same file name**.
2. Rebuild / restart the dev server (`npm run dev` or `npm run build`).

That's it — the new logo is picked up automatically.

## Tips

- **Any `.svg` works** — an icon-only mark or a full wordmark. Each logo is
  sized by height (Twitch/Buy Me a Coffee: 18px, StreamElements: 14px) and its
  width scales to match, so it won't overflow its button.
- **Colors:** the seeded placeholders use `fill="currentColor"` /
  `stroke="currentColor"` so they inherit the button's text color. If your SVG
  has its own fill/stroke colors (like an official brand logo usually does),
  those are used as-is instead — which is normally what you want.
- Keep the SVG's `viewBox` so it scales cleanly.
