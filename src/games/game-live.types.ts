export type SentimentVoteKind =
  | 'coach_out'
  | 'to_farm'
  | 'hero'
  | 'clutch'
  | 'rage';

export const SENTIMENT_VOTE_META: Record<
  SentimentVoteKind,
  { label: string; emoji: string }
> = {
  coach_out: { label: '감독 경질', emoji: '😤' },
  to_farm: { label: '2군으로', emoji: '⬇️' },
  hero: { label: '오늘의 영웅', emoji: '👑' },
  clutch: { label: '돈값짐', emoji: '💰' },
  rage: { label: '킹받음', emoji: '🔥' },
};

export interface WpaPoint {
  id: string;
  gameId: string;
  at: string;
  inning: string;
  homeWinPct: number;
  awayWinPct: number;
  homeScore: number;
  awayScore: number;
  playId?: string;
  label?: string;
  delta?: number;
}

export interface WpaNote {
  id: string;
  gameId: string;
  playId: string;
  userId: string;
  text: string;
  at: string;
}

export interface SentimentSnapshot {
  gameId: string;
  totalVotes: number;
  counts: Record<SentimentVoteKind, number>;
  pct: Record<SentimentVoteKind, number>;
  dominant: SentimentVoteKind | null;
  dominantPct: number;
  myVote: SentimentVoteKind | null;
}

export interface FanRatingRow {
  playerName: string;
  avg: number;
  count: number;
}

export type WinPickSide = 'away' | 'home';

export interface WinPickSnapshot {
  gameId: string;
  awayPicks: number;
  homePicks: number;
  totalPicks: number;
  awayPct: number;
  homePct: number;
  myPick: WinPickSide | null;
}
