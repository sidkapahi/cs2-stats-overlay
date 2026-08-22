// Raw shape of Leetify's official Public API response:
// GET https://api-public.cs-prod.leetify.com/v3/profile?steam64_id={id}
export interface LeetifyProfile {
  privacy_mode: string;
  winrate: number; // fraction, e.g. 0.6429
  total_matches: number;
  first_match_date: string;
  name: string;
  steam64_id: string;
  id: string;
  ranks: {
    leetify: number;
    premier: number | null;
    faceit: number | null;
    faceit_elo: number | null;
    wingman: number | null;
    renown: number | null;
    competitive: { map_name: string; rank: number }[];
  };
  rating: {
    aim: number;
    positioning: number;
    utility: number;
    clutch: number;
    opening: number;
    ct_leetify: number;
    t_leetify: number;
  };
  recent_matches: LeetifyMatch[];
}

export interface LeetifyMatch {
  id: string;
  data_source: string;
  outcome: 'win' | 'loss' | 'tie';
  rank: number | null;
  // Numeric game-mode id from Leetify (e.g. Premier vs Competitive), not a
  // label like 'premier'. Premier matches are detected by rank scale instead
  // (see api.ts), so this is kept only to mirror the raw payload shape.
  rank_type: number | null;
  map_name: string;
  leetify_rating: number;
  score: [number, number];
  preaim: number;
  reaction_time_ms: number;
  accuracy_enemy_spotted: number;
  accuracy_head: number;
  spray_accuracy: number;
  // Kills/deaths aren't in the profile payload — they come from the separate
  // /v2/matches/{id} endpoint and are attached after the fact (see api.ts).
  // Undefined when that per-match lookup hasn't run or failed.
  kills?: number;
  deaths?: number;
}

// Kept as an alias so widget.ts's existing rendering code doesn't need renaming.
export type LeetifyGame = LeetifyMatch;

// Shape of an entry from Leetify's match-list endpoint:
// GET /v3/profile/matches?steam64_id=... returns an array of these. Only the
// fields the widget needs — each match's full stats block is much larger.
export interface LeetifyMatchDetails {
  id: string;
  stats: LeetifyMatchPlayerStats[];
}

export interface LeetifyMatchPlayerStats {
  steam64_id: string;
  total_kills: number;
  total_deaths: number;
}

export interface RankTier {
  min: number;
  max: number;
  name: string;
  key: string;
  color: string;
  colorLight: string;
  gradient: string;
  // Premier badge index (prem_1..prem_7 in the Figma design), used to pick the
  // rank emblem shown behind the rating when the badge is enabled.
  badgeIndex: number;
  // Deep fill tone for the badge parallelogram.
  badgeBg: string;
  // Bright accent used for the badge slashes and the rating text (matches the
  // per-tier text colors in the Figma badge sheet).
  badgeAccent: string;
}

export interface WidgetConfig {
  steamId: string;
  showAvatar: boolean;
  showName: boolean;
  showBadge: boolean;
  showChange: boolean;
  showWinLoss: boolean;
  showStats: boolean;
  showMatchHistory: boolean;
  matchCount: number;
  refreshInterval: number;
}

export const DEFAULT_CONFIG: WidgetConfig = {
  steamId: '',
  showAvatar: true,
  showName: true,
  showBadge: true,
  showChange: true,
  showWinLoss: true,
  showStats: true,
  showMatchHistory: true,
  matchCount: 10,
  refreshInterval: 60,
};
