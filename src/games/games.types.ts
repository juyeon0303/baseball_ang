export type GameStatus = 'scheduled' | 'live' | 'final';

export interface GameSituation {
  balls: number;
  strikes: number;
  outs: number;
  bases: { first: boolean; second: boolean; third: boolean };
  countText: string;
  /** 휴무일 데모용 합성 데이터 */
  demo?: boolean;
  inning?: string;
  /** 주자 상황 한글 (1·3루) */
  basesLabel?: string;
}

export interface GameRelayState {
  naverGameId?: string;
  lastPitch?: string;
  recentPitches?: string[];
  lastPlay?: string;
  lastPlayKind?: PlayRelayKind;
  lastPlayType?: string;
  updatedAt?: string;
  source?: 'naver_relay' | 'kbo_scoreboard';
  /** 종료 경기 전체 중계 보관 */
  archived?: boolean;
  playCount?: number;
}

export interface GameRelayBundle {
  gameId: string;
  situation?: GameSituation;
  relay?: GameRelayState;
  batter?: string;
  pitcher?: string;
  inning?: string;
  plays: PlayFeedItem[];
  archived?: boolean;
}

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
  situation?: GameSituation;
  naverGameId?: string;
  relay?: GameRelayState;
}

export type PlayImpactKind = 'run' | 'game_end' | 'game_start' | 'inning';

export type PlayRelayKind =
  | 'pitch'
  | 'result'
  | 'advance'
  | 'run'
  | 'hbp'
  | 'sub'
  | 'visit'
  | 'inning'
  | 'info'
  | 'game_end'
  | 'game_start';

export interface PlayFeedItem {
  id: string;
  gameId: string;
  at: string;
  text: string;
  team?: string;
  instrumentId?: string;
  impact?: PlayImpactKind;
  sentimentDelta?: number;
  relayKind?: PlayRelayKind;
  playType?: string;
  inning?: string;
  balls?: number;
  strikes?: number;
  outs?: number;
  bases?: { first: boolean; second: boolean; third: boolean };
  seqno?: number;
  source?: 'naver_relay' | 'kbo_synth';
}

export interface ScoreboardSnapshot {
  date: string;
  updatedAt: string;
  source: 'kbo_gamecenter';
  featuredGameId: string | null;
  games: TodayGame[];
  plays: PlayFeedItem[];
}

export interface RecapSnapshot {
  date: string;
  dateLabel: string;
  updatedAt: string;
  games: TodayGame[];
  highlightId: string | null;
  totalRuns: number;
}
