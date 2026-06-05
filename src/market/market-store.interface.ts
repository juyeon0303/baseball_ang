import {
  InstrumentState,
  Position,
  PriceSnapshot,
  TradeRecord,
  UserWallet,
  UserWeekStat,
} from './market.types';

export const MARKET_STORE = Symbol('MARKET_STORE');

export interface IMarketStore {
  getLineup(): Promise<InstrumentState[]> | InstrumentState[];
  getInstrument(id: string): Promise<InstrumentState> | InstrumentState;
  hasInstrument(id: string): Promise<boolean> | boolean;
  getWallet(userId: string): Promise<UserWallet> | UserWallet;
  getOrCreateWallet(userId: string): Promise<UserWallet> | UserWallet;
  getAllUserIds(): Promise<string[]> | string[];
  getWeekStat(userId: string): Promise<UserWeekStat | undefined> | UserWeekStat | undefined;
  setWeekStat(userId: string, stat: UserWeekStat): Promise<void> | void;
  saveWallet(wallet: UserWallet): Promise<void> | void;
  updateInstrument(
    id: string,
    patch: Partial<InstrumentState>,
  ): Promise<InstrumentState> | InstrumentState;
  recalcPrice(id: string): Promise<InstrumentState> | InstrumentState;
  getPriceHistory(instrumentId: string): Promise<PriceSnapshot[]> | PriceSnapshot[];
  getStats():
    | {
        tradeCount: number;
        walletCount: number;
        instrumentCount: number;
      }
    | Promise<{
        tradeCount: number;
        walletCount: number;
        instrumentCount: number;
      }>;
  addTrade(
    partial: Omit<TradeRecord, 'id' | 'createdAt' | 'instrumentName'>,
  ): Promise<TradeRecord> | TradeRecord;
  getRecentTrades(
    limit?: number,
    instrumentId?: string,
  ): Promise<TradeRecord[]> | TradeRecord[];
  getPosition?(
    userId: string,
    instrumentId: string,
  ): Promise<Position> | Position;
}
