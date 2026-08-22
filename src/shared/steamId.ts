// Turns whatever a user pastes into the Steam-ID box — a raw Steam64 ID, a full
// profile URL, or a custom (vanity) URL — into a usable Steam64 ID.
//
// Two profile-URL shapes exist on Steam:
//   • https://steamcommunity.com/profiles/76561198012345678  → the 17-digit
//     Steam64 ID is right there in the path, so we extract it locally.
//   • https://steamcommunity.com/id/gabelogannewell          → a custom vanity
//     name that only Steam's Web API can map to a Steam64 ID. That needs the
//     secret API key, so it's resolved server-side by the proxy Worker
//     (see resolveVanityUrl in api.ts).

export type SteamInput =
  | { kind: "id"; steamId: string } // ready-to-use 17-digit Steam64 ID
  | { kind: "vanity"; vanity: string } // needs server-side resolution
  | { kind: "empty" } // nothing entered yet
  | { kind: "invalid" }; // not a recognisable Steam ID / profile URL

// Steam64 IDs are 17-digit numbers.
const STEAM64_RE = /^\d{17}$/;
// Steam vanity names are letters, digits, dashes, underscores and dots.
const VANITY_RE = /^[A-Za-z0-9_.-]{2,64}$/;

export function parseSteamInput(raw: string): SteamInput {
  const input = raw.trim();
  if (!input) return { kind: "empty" };

  // A bare 17-digit number is already a Steam64 ID.
  if (STEAM64_RE.test(input)) return { kind: "id", steamId: input };

  // Try to read it as a steamcommunity.com URL (with or without a scheme).
  const path = tryParseSteamPath(input);
  if (path) {
    const profiles = path.match(/\/profiles\/(\d{17})\b/);
    if (profiles) return { kind: "id", steamId: profiles[1] };
    const vanity = path.match(/\/id\/([A-Za-z0-9_.-]{2,64})/);
    if (vanity) return { kind: "vanity", vanity: vanity[1] };
    return { kind: "invalid" };
  }

  // Not a URL and not a full Steam64 ID. Purely-numeric input is treated as an
  // incomplete/invalid Steam64 (not a vanity), so a half-typed ID isn't sent
  // off for resolution; anything else is taken as a bare vanity name.
  if (/^\d+$/.test(input)) return { kind: "invalid" };
  if (VANITY_RE.test(input)) return { kind: "vanity", vanity: input };
  return { kind: "invalid" };
}

// Returns the path of a steamcommunity.com URL, or null if the input isn't one.
// Accepts inputs without a scheme (e.g. a pasted "steamcommunity.com/id/foo").
function tryParseSteamPath(input: string): string | null {
  let candidate = input;
  if (!/^https?:\/\//i.test(candidate)) {
    if (!/^steamcommunity\.com\//i.test(candidate)) return null;
    candidate = "https://" + candidate;
  }
  try {
    const url = new URL(candidate);
    if (url.hostname.toLowerCase() !== "steamcommunity.com") return null;
    return url.pathname;
  } catch {
    return null;
  }
}
