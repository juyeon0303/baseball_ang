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
  coach_out: { label: '감독 교체', emoji: '😤' },
  to_farm: { label: '2군 보내기', emoji: '⬇️' },
  hero: { label: '영웅', emoji: '👑' },
  clutch: { label: '결정적', emoji: '💰' },
  rage: { label: '불만', emoji: '🔥' },
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
