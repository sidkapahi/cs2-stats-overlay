// Helpers for the "Add to your stream" export options: deep links to the
// StreamElements / Streamlabs editors and a downloadable, ready-to-use overlay
// bundle. Everything here is client-side — there's no backend, so we can't push
// an overlay straight into someone's account (that needs their StreamElements
// OAuth login and a server). Instead we smooth over the manual step: copy the
// widget URL, open the right editor, and hand over a zipped overlay file they
// can drop in as a Browser Source or Custom Widget.
import { createZip } from './zip';

// StreamElements has a real web overlay editor we can deep-link to.
export const STREAMELEMENTS_EDITOR_URL =
  'https://streamelements.com/dashboard/overlays';
// Streamlabs browser sources are added in the Streamlabs Desktop app; the web
// dashboard is the closest public landing page to send people to.
export const STREAMLABS_DASHBOARD_URL = 'https://streamlabs.com/dashboard';

// Recommended browser-source size for the widget (kept in sync with the README).
export const RECOMMENDED_WIDTH = 660;
export const RECOMMENDED_HEIGHT = 180;

// Escapes a URL for safe use inside a double-quoted HTML attribute. URLSearchParams
// already percent-encodes values, so the only raw specials left are & < > ".
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// A standalone overlay page that embeds the live widget in a correctly-sized,
// transparent iframe. Works as a local-file Browser Source in OBS/Streamlabs and
// as the HTML for a StreamElements Custom Widget. It loads the hosted widget, so
// stats stay live without re-exporting.
export function buildOverlayHtml(widgetUrl: string): string {
  const src = escapeAttr(widgetUrl);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>CS2 Stats Overlay</title>
  <style>
    html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    iframe {
      border: 0;
      display: block;
      width: ${RECOMMENDED_WIDTH}px;
      height: ${RECOMMENDED_HEIGHT}px;
      background: transparent;
    }
  </style>
</head>
<body>
  <iframe src="${src}" scrolling="no" allowtransparency="true"></iframe>
</body>
</html>
`;
}

export function buildReadme(widgetUrl: string): string {
  return `CS2 Stats Overlay
=================

Your widget URL:
  ${widgetUrl}

This overlay shows your live CS2 Premier stats from Leetify, so it needs an
internet connection to load. Recommended browser-source size: ${RECOMMENDED_WIDTH} x ${RECOMMENDED_HEIGHT}.

Files in this zip:
  overlay.html   - a ready-to-use overlay page (embeds the widget above)
  widget-url.txt - just the widget URL, for copy/paste
  README.txt     - this file

OBS Studio / Streamlabs Desktop
-------------------------------
1. In Sources, add a new "Browser Source".
2. Either paste the widget URL into the URL field, or tick "Local file" and
   choose overlay.html from this folder.
3. Set Width ${RECOMMENDED_WIDTH} and Height ${RECOMMENDED_HEIGHT} (adjust to taste).

StreamElements
--------------
1. Open your overlay editor: ${STREAMELEMENTS_EDITOR_URL}
2. Add Widget -> Static / Custom -> Custom Widget -> Open Editor.
3. Paste the contents of overlay.html into the HTML tab and save.
4. Size the widget to ${RECOMMENDED_WIDTH} x ${RECOMMENDED_HEIGHT}.
   (Alternatively, copy the overlay URL StreamElements gives you and add it as a
   Browser Source in OBS/Streamlabs.)
`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Bundles the overlay page, the raw URL, and a README into a .zip and downloads it.
export function downloadOverlayZip(widgetUrl: string): void {
  const blob = createZip([
    { name: 'overlay.html', data: buildOverlayHtml(widgetUrl) },
    { name: 'widget-url.txt', data: `${widgetUrl}\n` },
    { name: 'README.txt', data: buildReadme(widgetUrl) },
  ]);
  triggerDownload(blob, 'cs2-stats-overlay.zip');
}
