import type { RankTier } from './types';

export const RANK_TIERS: RankTier[] = [
  {
    min: 0,
    max: 4999,
    name: 'Gray',
    key: 'gray',
    color: '#afc4d5',
    colorLight: '#d1d5db',
    gradient: 'linear-gradient(135deg, #6b7280, #9ca3af)',
    badgeIndex: 1,
    badgeBg: '#2f3a44',
    badgeAccent: '#afc4d5',
  },
  {
    min: 5000,
    max: 9999,
    name: 'Light Blue',
    key: 'lightblue',
    color: '#76bde5',
    colorLight: '#bae6fd',
    gradient: 'linear-gradient(135deg, #5b8fa8, #7ec8e3)',
    badgeIndex: 2,
    badgeBg: '#1c3a4d',
    badgeAccent: '#76bde5',
  },
  {
    min: 10000,
    max: 14999,
    name: 'Blue',
    key: 'blue',
    color: '#6085f0',
    colorLight: '#93c5fd',
    gradient: 'linear-gradient(135deg, #1e3a6e, #3b82f6)',
    badgeIndex: 3,
    badgeBg: '#1f2a63',
    badgeAccent: '#6085f0',
  },
  {
    min: 15000,
    max: 19999,
    name: 'Purple',
    key: 'purple',
    color: '#d76afe',
    colorLight: '#d8b4fe',
    gradient: 'linear-gradient(135deg, #6b21a8, #a855f7)',
    badgeIndex: 4,
    badgeBg: '#4b1a5e',
    badgeAccent: '#d76afe',
  },
  {
    min: 20000,
    max: 24999,
    name: 'Pink',
    key: 'pink',
    color: '#fe13f7',
    colorLight: '#f9a8d4',
    gradient: 'linear-gradient(135deg, #be185d, #ec4899)',
    badgeIndex: 5,
    badgeBg: '#5a0a56',
    badgeAccent: '#fe13f7',
  },
  {
    min: 25000,
    max: 29999,
    name: 'Red',
    key: 'red',
    color: '#ff4f46',
    colorLight: '#fca5a5',
    gradient: 'linear-gradient(135deg, #7f1d1d, #ef4444)',
    badgeIndex: 6,
    badgeBg: '#5a1512',
    badgeAccent: '#ff4f46',
  },
  {
    min: 30000,
    max: 999999,
    name: 'Gold',
    key: 'gold',
    color: '#fddc02',
    colorLight: '#fde047',
    gradient: 'linear-gradient(135deg, #92700c, #eab308)',
    badgeIndex: 7,
    badgeBg: '#4a3a05',
    badgeAccent: '#fddc02',
  },
];

export function getRankTier(rating: number): RankTier {
  return RANK_TIERS.find((t) => rating >= t.min && rating <= t.max) ?? RANK_TIERS[0];
}

export function formatRating(rating: number): string {
  return rating.toLocaleString('en-US');
}
