import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createDebouncedFlush } from '../persist/debounced-flush';
import { LocalJsonStore } from '../persist/local-json-store';
import { getEffectiveStorageMode } from '../persist/storage-mode';
import {
  InstrumentState,
  Position,
  PriceSnapshot,
  TradeRecord,
  UserWallet,
  UserWeekStat,
} from './market.types';
import { getWeekKey } from './week.util';
import { MEME_STOCKS, MemeStockSeed } from './market-meme-lineup';
import {
  ALL_INSTRUMENT_SEEDS,
  KBO_TEAM_STOCKS,
  LEE_JUNG_HOO_OPS_ID,
  LineupSeed,
} from './market-lineup';
import { PricingService } from './pricing.service';
import { IMarketStore } from './market-store.interface';

export { LEE_JUNG_HOO_OPS_ID };

const STARTING_POINTS = 100_000;

interface MemoryMarketFile {
  version: 1;
  wallets: Record<string, UserWallet>;
  trades: TradeRecord[];
  weekStats: Record<string, UserWeekStat>;
}

@Injectable()
export class MemoryMarketStoreService implements IMarketStore, OnModuleInit {
  private readonly logger = new Logger(MemoryMarketStoreService.name);
  private instruments = new Map<string, InstrumentState>();
  private priceHistory = new Map<string, PriceSnapshot[]>();
  private wallets = new Map<string, UserWallet>();
  private weekStats = new Map<string, UserWeekStat>();
  private trades: TradeRecord[] = [];
  private readonly marketStore = new LocalJsonStore<MemoryMarketFile>(
    'market-memory.json',
  );
  private readonly scheduleFilePersist = createDebouncedFlush(() =>
    this.flushToFile(),
  );

  constructor(private readonly pricing: PricingService) {
    for (const seed of ALL_INSTRUMENT_SEEDS) {
      const inst = this.seedToInstrument(seed);
      this.instruments.set(seed.id, inst);
      this.seedPriceHistory(seed.id, inst);
    }
    for (const meme of MEME_STOCKS) {
      const inst = this.memeToInstrument(meme);
      this.instruments.set(meme.id, inst);
      this.seedPriceHistory(meme.id, inst);
    }
  }

  onModuleInit(): void {
    const data = this.marketStore.load();
    if (!data) return;
    for (const [userId, wallet] of Object.entries(data.wallets ?? {})) {
      this.wallets.set(userId, {
        userId,
        points: wallet.points,
        positions: { ...wallet.positions },
      });
    }
    this.trades = Array.isArray(data.trades) ? [...data.trades] : [];
    for (const [userId, stat] of Object.entries(data.weekStats ?? {})) {
      this.weekStats.set(userId, { ...stat });
    }
    if (this.wallets.size || this.trades.length) {
      this.logger.log(
        `지갑 ${this.wallets.size} · 체결 ${this.trades.length}건 파일에서 복원 (${getEffectiveStorageMode()})`,
      );
    }
  }

  private flushToFile(): void {
    const wallets: Record<string, UserWallet> = {};
    for (const [userId, wallet] of this.wallets.entries()) {
      wallets[userId] = {
        userId,
        points: wallet.points,
        positions: { ...wallet.positions },
      };
    }
    const weekStats: Record<string, UserWeekStat> = {};
    for (const [userId, stat] of this.weekStats.entries()) {
      weekStats[userId] = { ...stat };
    }
    this.marketStore.save({
      version: 1,
      wallets,
      trades: this.trades,
      weekStats,
    });
  }

  getLineup(): InstrumentState[] {
    return [
      this.getInstrument(LEE_JUNG_HOO_OPS_ID),
      ...KBO_TEAM_STOCKS.map((s) => this.getInstrument(s.id)),
    ];
  }

  getMemeLineup(): InstrumentState[] {
    return MEME_STOCKS.map((s) => this.getInstrument(s.id));
  }

  getInstrument(id: string): InstrumentState {
    const inst = this.instruments.get(id);
    if (!inst) {
      throw new NotFoundException(`상품을 찾을 수 없습니다: ${id}`);
    }
    return { ...inst };
  }

  hasInstrument(id: string): boolean {
    return this.instruments.has(id);
  }

  getWallet(userId: string): UserWallet {
    let wallet = this.wallets.get(userId);
    if (!wallet) {
      wallet = {
        userId,
        points: STARTING_POINTS,
        positions: {},
      };
      this.wallets.set(userId, wallet);
      this.scheduleFilePersist();
    }
    return {
      userId: wallet.userId,
      points: wallet.points,
      positions: { ...wallet.positions },
    };
  }

  getOrCreateWallet(userId: string): UserWallet {
    this.getWallet(userId);
    return this.wallets.get(userId)!;
  }

  getAllUserIds(): string[] {
    return [...this.wallets.keys()];
  }

  getWeekStat(userId: string): UserWeekStat | undefined {
    return this.weekStats.get(userId);
  }

  setWeekStat(userId: string, stat: UserWeekStat): void {
    this.weekStats.set(userId, { ...stat });
    this.scheduleFilePersist();
  }

  saveWallet(wallet: UserWallet): void {
    this.wallets.set(wallet.userId, {
      userId: wallet.userId,
      points: wallet.points,
      positions: { ...wallet.positions },
    });
    this.scheduleFilePersist();
  }

  updateInstrument(
    id: string,
    patch: Partial<InstrumentState>,
  ): InstrumentState {
    const current = this.instruments.get(id);
    if (!current) {
      throw new NotFoundException(`상품을 찾을 수 없습니다: ${id}`);
    }
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.instruments.set(id, next);
    return this.getInstrument(id);
  }

  recalcPrice(id: string): InstrumentState {
    const inst = this.instruments.get(id)!;
    const fairPrice = this.pricing.fairPrice(inst.metric, inst.oracleValue);
    const price = this.pricing.marketPrice(fairPrice, inst.sentiment);
    const updated = this.updateInstrument(id, { fairPrice, price });
    this.pushPriceSnapshot(id);
    return updated;
  }

  private seedPriceHistory(
    instrumentId: string,
    inst: InstrumentState,
  ): void {
    const points = 30;
    const history: PriceSnapshot[] = [];
    const target = inst.price;
    let p = Math.round(target * (0.96 + Math.random() * 0.04));
    const baseTime = Date.parse(inst.updatedAt) || Date.now();
    for (let i = points - 1; i >= 0; i--) {
      if (i === 0) {
        p = target;
      } else {
        const step = (target - p) / (i + 1);
        p = Math.max(
          100,
          Math.round(p + step + (Math.random() - 0.5) * target * 0.006),
        );
      }
      history.push({
        at: new Date(baseTime - i * 20 * 60 * 1000).toISOString(),
        price: p,
        fairPrice: inst.fairPrice,
        oracleValue: inst.oracleValue,
        sentiment: inst.sentiment,
      });
    }
    this.priceHistory.set(instrumentId, history);
  }

  private pushPriceSnapshot(instrumentId: string): void {
    const inst = this.instruments.get(instrumentId);
    if (!inst) return;
    const history = this.priceHistory.get(instrumentId) ?? [];
    history.push({
      at: inst.updatedAt,
      price: inst.price,
      fairPrice: inst.fairPrice,
      oracleValue: inst.oracleValue,
      sentiment: inst.sentiment,
    });
    if (history.length > 80) {
      history.splice(0, history.length - 80);
    }
    this.priceHistory.set(instrumentId, history);
  }

  getPriceHistory(instrumentId: string): PriceSnapshot[] {
    return [...(this.priceHistory.get(instrumentId) ?? [])];
  }

  getStats() {
    return {
      tradeCount: this.trades.length,
      walletCount: this.wallets.size,
      instrumentCount: this.instruments.size,
    };
  }

  addTrade(
    partial: Omit<TradeRecord, 'id' | 'createdAt' | 'instrumentName'>,
  ): TradeRecord {
    const inst = this.instruments.get(partial.instrumentId);
    const trade: TradeRecord = {
      ...partial,
      instrumentName: inst?.name,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.trades.unshift(trade);
    if (this.trades.length > 300) {
      this.trades.length = 300;
    }
    this.recordOpsTrade(partial.userId, partial.instrumentId);
    this.scheduleFilePersist();
    return trade;
  }

  getRecentTrades(limit = 20, instrumentId?: string): TradeRecord[] {
    const list = instrumentId
      ? this.trades.filter((t) => t.instrumentId === instrumentId)
      : this.trades;
    return list.slice(0, limit);
  }

  getUserTrades(userId: string, limit = 30): TradeRecord[] {
    return this.trades.filter((t) => t.userId === userId).slice(0, limit);
  }

  private recordOpsTrade(userId: string, instrumentId: string): void {
    if (instrumentId !== LEE_JUNG_HOO_OPS_ID) return;
    const key = getWeekKey();
    const stat = this.weekStats.get(userId);
    if (stat && stat.weekKey === key) {
      stat.opsTradeCount += 1;
    }
  }

  private seedToInstrument(seed: LineupSeed): InstrumentState {
    const metricLabel =
      seed.metric === 'era' ? 'ERA' : seed.metric === 'hype' ? 'HYPE' : 'OPS';
    const fairPrice = this.pricing.fairPrice(seed.metric, seed.oracleValue);
    return {
      id: seed.id,
      kind: 'player',
      name: `${seed.playerName} ${metricLabel}`,
      symbol: seed.symbol,
      teamName: seed.teamName,
      teamShort: seed.teamShort,
      playerName: seed.playerName,
      metric: seed.metric,
      metricLabel,
      oracleValue: seed.oracleValue,
      sentiment: 1,
      fairPrice,
      price: this.pricing.marketPrice(fairPrice, 1),
      accent: seed.accent,
      updatedAt: new Date().toISOString(),
    };
  }

  private memeToInstrument(seed: MemeStockSeed): InstrumentState {
    const fairPrice = this.pricing.fairPrice('hype', seed.oracleValue);
    return {
      id: seed.id,
      kind: 'meme',
      name: seed.title,
      symbol: seed.symbol,
      teamName: seed.teamName,
      teamShort: seed.teamShort,
      playerName: seed.title,
      metric: 'hype',
      metricLabel: seed.metricLabel,
      oracleValue: seed.oracleValue,
      sentiment: 1,
      fairPrice,
      price: this.pricing.marketPrice(fairPrice, 1),
      accent: seed.accent,
      betCta: seed.betCta,
      narrative: seed.narrative,
      longThesis: seed.longThesis,
      shortThesis: seed.shortThesis,
      yesBet: seed.yesBet,
      noBet: seed.noBet,
      updatedAt: new Date().toISOString(),
    };
  }
}
