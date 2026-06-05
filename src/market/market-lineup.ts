import { isMemeInstrumentId } from './market-meme-lineup';

/** KBO 10구단 대표주 + MVP 히어로(이정후·MLB) */

export type MetricKind = 'ops' | 'era' | 'hype';
export type StatsSource = 'kbo' | 'mlb';

export interface LineupSeed {
  id: string;
  teamName: string;
  teamShort: string;
  playerName: string;
  symbol: string;
  metric: MetricKind;
  oracleValue: number;
  accent: string;
  statsSource: StatsSource;
  /** KBO 공식 기록실 playerId */
  kboPlayerId?: number;
  /** MLB Stats API people id (이정후) */
  mlbPlayerId?: number;
}

/** 이정후 — 키움 출신, 현재 MLB 샌프란시스코 (KBO 10구단과 별도) */
export const LEE_JUNG_HOO_STOCK: LineupSeed = {
  id: 'lee-jung-hoo',
  teamName: '샌프란시스코',
  teamShort: 'MLB',
  playerName: '이정후',
  symbol: 'LJH',
  metric: 'ops',
  oracleValue: 0.774,
  accent: '#fd5a1e',
  statsSource: 'mlb',
  mlbPlayerId: 808982,
};

/** MLB Stats API 대상 — KBO 10구단과 별도 크롤링 파이프라인 */
export const MLB_FEATURED_STOCKS: LineupSeed[] = [LEE_JUNG_HOO_STOCK];

export const LEE_JUNG_HOO_OPS_ID = LEE_JUNG_HOO_STOCK.id;

/**
 * 구단별 대표 1명 — 2026 커뮤·파급력 기준 (기록 1위보다 거래·화제성 우선)
 * - 키움: 이주형 (이정후 이후 키움 대표 타자)
 * - KIA: 김도영 (인기·홈런 1위급)
 * - LG: 박동원 (프랜차이즈)
 * - KT: 힐리어드 (강백호 이탈 후 파워·화제)
 * - SSG: 최정 (불사조)
 * - NC: 김주원 (영건·WAR 상위)
 * - 두산: 양의지 (국가대표급 스타)
 * - 삼성: 구자욱 (팬덤·성적)
 * - 롯데: 나승엽 (구단 상징)
 * - 한화: 강백호 (100억 FA, 시즌 최대 화제)
 */
export const KBO_TEAM_STOCKS: LineupSeed[] = [
  {
    id: 'kiwoom-joo',
    teamName: '키움',
    teamShort: '키움',
    playerName: '이주형',
    symbol: 'IJH',
    metric: 'ops',
    oracleValue: 0.74,
    accent: '#6b1f3f',
    statsSource: 'kbo',
    kboPlayerId: 50167,
  },
  {
    id: 'kia-kim',
    teamName: 'KIA',
    teamShort: 'KIA',
    playerName: '김도영',
    symbol: 'KDY',
    metric: 'ops',
    oracleValue: 0.91,
    accent: '#c8102e',
    statsSource: 'kbo',
    kboPlayerId: 52605,
  },
  {
    id: 'lg-park',
    teamName: 'LG',
    teamShort: 'LG',
    playerName: '박동원',
    symbol: 'PDW',
    metric: 'ops',
    oracleValue: 0.88,
    accent: '#041e42',
    statsSource: 'kbo',
    kboPlayerId: 79365,
  },
  {
    id: 'kt-hill',
    teamName: 'KT',
    teamShort: 'KT',
    playerName: '힐리어드',
    symbol: 'HIL',
    metric: 'ops',
    oracleValue: 0.9,
    accent: '#000000',
    statsSource: 'kbo',
    kboPlayerId: 56034,
  },
  {
    id: 'ssg-choi',
    teamName: 'SSG',
    teamShort: 'SSG',
    playerName: '최정',
    symbol: 'CHJ',
    metric: 'ops',
    oracleValue: 0.95,
    accent: '#ce0e2d',
    statsSource: 'kbo',
    kboPlayerId: 75847,
  },
  {
    id: 'nc-kim',
    teamName: 'NC',
    teamShort: 'NC',
    playerName: '김주원',
    symbol: 'KJW2',
    metric: 'ops',
    oracleValue: 0.85,
    accent: '#1d4f91',
    statsSource: 'kbo',
    kboPlayerId: 51907,
  },
  {
    id: 'ds-yang',
    teamName: '두산',
    teamShort: '두산',
    playerName: '양의지',
    symbol: 'YEI',
    metric: 'ops',
    oracleValue: 0.87,
    accent: '#131230',
    statsSource: 'kbo',
    kboPlayerId: 76232,
  },
  {
    id: 'ss-koo',
    teamName: '삼성',
    teamShort: '삼성',
    playerName: '구자욱',
    symbol: 'KJW',
    metric: 'ops',
    oracleValue: 0.84,
    accent: '#074ca1',
    statsSource: 'kbo',
    kboPlayerId: 62404,
  },
  {
    id: 'lt-na',
    teamName: '롯데',
    teamShort: '롯데',
    playerName: '나승엽',
    symbol: 'NSY',
    metric: 'ops',
    oracleValue: 0.86,
    accent: '#002855',
    statsSource: 'kbo',
    kboPlayerId: 51551,
  },
  {
    id: 'hh-kang',
    teamName: '한화',
    teamShort: '한화',
    playerName: '강백호',
    symbol: 'KBH',
    metric: 'ops',
    oracleValue: 1.0,
    accent: '#ff6600',
    statsSource: 'kbo',
    kboPlayerId: 68050,
  },
];

export const ALL_INSTRUMENT_SEEDS: LineupSeed[] = [
  LEE_JUNG_HOO_STOCK,
  ...KBO_TEAM_STOCKS,
];

const SEED_BY_ID = new Map(ALL_INSTRUMENT_SEEDS.map((s) => [s.id, s]));

export function findSeedById(id: string): LineupSeed | undefined {
  return SEED_BY_ID.get(id);
}

export function findSeedByPlayerName(name: string): LineupSeed | undefined {
  return ALL_INSTRUMENT_SEEDS.find((s) => name.includes(s.playerName));
}

export function resolveInstrumentId(
  playerId?: number | string,
  instrumentId?: string,
): string | null {
  if (instrumentId) {
    if (SEED_BY_ID.has(instrumentId) || isMemeInstrumentId(instrumentId)) {
      return instrumentId;
    }
    return null;
  }
  const n = Number(playerId);
  if (Number.isInteger(n) && n >= 1 && n <= KBO_TEAM_STOCKS.length) {
    return KBO_TEAM_STOCKS[n - 1].id;
  }
  if (typeof playerId === 'string' && SEED_BY_ID.has(playerId)) {
    return playerId;
  }
  return null;
}
