export interface HitterSeasonStats {
  avg?: number;
  ops?: number;
  hr?: number;
  rbi?: number;
  sb?: number;
  games?: number;
  ab?: number;
  hits?: number;
  obp?: number;
  slg?: number;
  pa?: number;
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

export type StatSource =
  | 'kbo_official'
  | 'statiz'
  | 'naver_sports'
  | 'computed';

export interface StatTable {
  source: StatSource;
  page: string;
  title?: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface StatMetricGroup {
  id: string;
  label: string;
  source: StatSource;
  metrics: Record<string, string | number>;
}

export interface PlayerStatRow {
  name: string;
  kboPlayerId: number;
  team?: string;
  role: 'hitter' | 'pitcher';
  position?: string;
  backNo?: string;
  stats: HitterSeasonStats | PitcherSeasonStats;
  source: 'kbo_official';
  fetchedAt: string;
}

export interface KboPlayerProfile {
  kboPlayerId: number;
  name: string;
  team?: string;
  role: 'hitter' | 'pitcher';
  position?: string;
  backNo?: string;
  season: number;
  tables: StatTable[];
  groups: StatMetricGroup[];
  summary?: HitterSeasonStats | PitcherSeasonStats;
  fetchedAt: string;
}

export interface PlayerFullStatBundle {
  player: {
    kboPlayerId: number;
    name: string;
    team?: string;
    role: 'hitter' | 'pitcher';
    position?: string;
    backNo?: string;
  };
  season: number;
  kbo: KboPlayerProfile | null;
  statiz: StatMetricGroup | null;
  naver: StatMetricGroup | null;
  groups: StatMetricGroup[];
  tables: StatTable[];
  sources: {
    kbo: boolean;
    statiz: boolean;
    naver: boolean;
    statizNote?: string;
    naverNote?: string;
  };
  fetchedAt: string;
}

export interface GamePlayerStatsSnapshot {
  gameId: string;
  updatedAt: string;
  players: PlayerStatRow[];
}

export interface PlayerCatalogEntry {
  name: string;
  teamShort: string;
  teamName?: string;
  kboPlayerId?: number;
  accent?: string;
  roleHint: 'hitter' | 'pitcher';
  position?: string;
  backNo?: string;
}

export interface PlayerRosterBoard {
  updatedAt: string;
  season: number;
  total: number;
  players: PlayerCatalogEntry[];
}

export interface PlayerSeasonStatsBoard {
  updatedAt: string;
  players: PlayerStatRow[];
}

export interface PlayerRosterQuery {
  q?: string;
  team?: string;
  role?: 'hitter' | 'pitcher' | 'all';
  limit?: number;
}
