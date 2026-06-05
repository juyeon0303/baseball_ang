export type GameStatus = 'scheduled' | 'live' | 'final';

export interface TodayGame {
  id: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  inning: string;
  status: GameStatus;
  linkedInstrumentId: string;
  startTime?: string;
  stadium?: string;
  awayPitcher?: string;
  homePitcher?: string;
  batter?: string;
  pitcher?: string;
}

export type PlayImpactKind = 'run' | 'game_end' | 'game_start' | 'inning';

export interface PlayFeedItem {
  id: string;
  gameId: string;
  at: string;
  text: string;
  team?: string;
  instrumentId?: string;
  impact?: PlayImpactKind;
  sentimentDelta?: number;
}

export interface ScoreboardSnapshot {
  date: string;
  updatedAt: string;
  source: 'kbo_gamecenter';
  featuredGameId: string | null;
  games: TodayGame[];
  plays: PlayFeedItem[];
}
