import { MetricKind } from './market-lineup';

export type OrderSide = 'long' | 'short';

export type TradeAction =
  | 'open_long'
  | 'close_long'
  | 'open_short'
  | 'close_short';

export interface InstrumentState {
  id: string;
  name: string;
  symbol: string;
  teamName: string;
  teamShort: string;
  playerName: string;
  metric: MetricKind;
  metricLabel: string;
  oracleValue: number;
  sentiment: number;
  price: number;
  fairPrice: number;
  accent: string;
  updatedAt: string;
}

export interface Position {
  longShares: number;
  shortShares: number;
}

export interface UserWallet {
  userId: string;
  points: number;
  positions: Record<string, Position>;
}

export interface TradeRecord {
  id: string;
  userId: string;
  instrumentId: string;
  instrumentName?: string;
  action: TradeAction;
  quantity: number;
  price: number;
  pointsDelta: number;
  oracleValue: number;
  createdAt: string;
}

export interface OrderResult {
  success: boolean;
  message: string;
  trade?: TradeRecord;
  instrument?: InstrumentState;
  wallet?: UserWallet;
}

export interface PriceSnapshot {
  at: string;
  price: number;
  fairPrice: number;
  oracleValue: number;
  sentiment: number;
}

export interface UserWeekStat {
  weekKey: string;
  startEquity: number;
  opsTradeCount: number;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  startEquity: number;
  currentEquity: number;
  weeklyReturnPct: number;
  opsTradeCount: number;
  isOpsKing?: boolean;
}

export interface LeaderboardResult {
  weekKey: string;
  weekLabel: string;
  updatedAt: string;
  opsKing: LeaderboardEntry | null;
  rankings: LeaderboardEntry[];
}
