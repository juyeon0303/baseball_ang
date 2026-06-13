export interface HitterSeasonStats {
  avg?: number;
  ops?: number;
  hr?: number;
  rbi?: number;
  sb?: number;
  games?: number;
  ab?: number;
  hits?: number;
}

export interface PitcherSeasonStats {
  era?: number;
  ip?: number;
  w?: number;
  l?: number;
  so?: number;
  bb?: number;
  whip?: number;
}

export interface PlayerStatRow {
  name: string;
  kboPlayerId: number;
  team?: string;
  role: 'hitter' | 'pitcher';
  position?: string;
  stats: HitterSeasonStats | PitcherSeasonStats;
  source: 'kbo_official';
  fetchedAt: string;
}

export interface GamePlayerStatsSnapshot {
  gameId: string;
  updatedAt: string;
  players: PlayerStatRow[];
}
