// The default profile picture shown in the avatar slot when a player's real
// Steam avatar can't be resolved (no avatar proxy configured, or a private
// profile). It's the blue "smiley" mark from the Figma design (node 1-470),
// recreated as an inline SVG so the widget stays fully self-contained — OBS
// browser sources can't reliably resolve sibling asset files, and a data URI
// needs no extra network request.
//
// Encoded at module load with encodeURIComponent so the SVG source stays
// readable/editable here rather than a base64 blob.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#54abff"/>
      <stop offset="1" stop-color="#2f6bf0"/>
    </linearGradient>
  </defs>
  <circle cx="40" cy="40" r="40" fill="url(#a)"/>
  <rect x="26.5" y="30" width="7" height="15" rx="3.5" fill="#fff"/>
  <rect x="46.5" y="30" width="7" height="15" rx="3.5" fill="#fff"/>
  <path d="M27 49q13 15 26 0" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round"/>
</svg>`;

export const defaultAvatarSrc = `data:image/svg+xml,${encodeURIComponent(svg)}`;
