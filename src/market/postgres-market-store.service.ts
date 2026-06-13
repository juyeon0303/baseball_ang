import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InstrumentEntity } from '../entities/instrument.entity';
import { PositionEntity } from '../entities/position.entity';
import { PriceSnapshotEntity } from '../entities/price-snapshot.entity';
import { TradeEntity } from '../entities/trade.entity';
import { UserWeekStatEntity } from '../entities/user-week-stat.entity';
import { UserEntity } from '../entities/user.entity';
import {
  toInstrumentState,
  toPriceSnapshot,
  toTradeRecord,
} from './entity.mapper';
import { MEME_STOCKS, MemeStockSeed } from './market-meme-lineup';
import {
  ALL_INSTRUMENT_SEEDS,
  KBO_TEAM_STOCKS,
  LEE_JUNG_HOO_OPS_ID,
  LineupSeed,
} from './market-lineup';
import { IMarketStore } from './market-store.interface';
import {
  InstrumentState,
  PriceSnapshot,
  TradeRecord,
  UserWallet,
  UserWeekStat,
} from './market.types';
import { PricingService } from './pricing.service';
import { getWeekKey } from './week.util';

export { LEE_JUNG_HOO_OPS_ID };

const STARTING_POINTS = 100_000;
const MAX_TRADES = 300;

@Injectable()
export class PostgresMarketStoreService implements IMarketStore, OnModuleInit {
  private readonly logger = new Logger(PostgresMarketStoreService.name);

  constructor(
    private readonly pricing: PricingService,
    @InjectRepository(InstrumentEntity)
    private readonly instrumentRepo: Repository<InstrumentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PositionEntity)
    private readonly positionRepo: Repository<PositionEntity>,
    @InjectRepository(TradeEntity)
    private readonly tradeRepo: Repository<TradeEntity>,
    @InjectRepository(UserWeekStatEntity)
    private readonly weekStatRepo: Repository<UserWeekStatEntity>,
    @InjectRepository(PriceSnapshotEntity)
    private readonly snapshotRepo: Repository<PriceSnapshotEntity>,
  ) {}

  onModuleInit(): void {
    void this.seedMarket().catch((e) =>
      this.logger.error(`Postgres 마켓 시드 실패: ${e}`),
    );
  }

  private async seedMarket(): Promise<void> {
    for (const seed of ALL_INSTRUMENT_SEEDS) {
      await this.upsertInstrument(this.seedToEntity(seed));
      await this.ensurePriceSnapshot(seed.id);
    }
    for (const meme of MEME_STOCKS) {
      await this.upsertInstrument(this.memeToEntity(meme));
      await this.ensurePriceSnapshot(meme.id);
    }
    const stats = await this.getStats();
    this.logger.log(
      `Postgres 마켓 준비 — 종목 ${stats.instrumentCount} · 유저 ${stats.walletCount} · 체결 ${stats.tradeCount}`,
    );
  }

  async getMemeLineup(): Promise<InstrumentState[]> {
    await this.ensureMemeInstruments();
    const ids = MEME_STOCKS.map((s) => s.id);
    const rows = await this.instrumentRepo.find({
      where: { id: In(ids) },
    });
    const byId = new Map(rows.map((r) => [r.id, toInstrumentState(r)]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  }

  private async ensureMemeInstruments(): Promise<void> {
    for (const meme of MEME_STOCKS) {
      await this.upsertInstrument(this.memeToEntity(meme));
      await this.ensurePriceSnapshot(meme.id);
    }
  }

  async getLineup(): Promise<InstrumentState[]> {
    const ids = KBO_TEAM_STOCKS.map((s) => s.id);
    const rows = await this.instrumentRepo.find({ where: { id: In(ids) } });
    const byId = new Map(rows.map((r) => [r.id, toInstrumentState(r)]));
    return ids.map((id) => byId.get(id)!).filter(Boolean);
  }

  async getInstrument(id: string): Promise<InstrumentState> {
    const row = await this.instrumentRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`상품을 찾을 수 없습니다: ${id}`);
    }
    return toInstrumentState(row);
  }

  async hasInstrument(id: string): Promise<boolean> {
    return (await this.instrumentRepo.count({ where: { id } })) > 0;
  }

  async getWallet(userId: string): Promise<UserWallet> {
    let user = await this.userRepo.findOne({ where: { externalId: userId } });
    if (!user) {
      user = await this.userRepo.save({
        externalId: userId,
        points: STARTING_POINTS,
      });
    }
    const positions = await this.positionRepo.find({ where: { userId } });
    const posMap: UserWallet['positions'] = {};
    for (const p of positions) {
      posMap[p.instrumentId] = {
        longShares: p.longShares,
        shortShares: p.shortShares,
      };
    }
    return {
      userId,
      points: Number(user.points),
      positions: posMap,
    };
  }

  async getOrCreateWallet(userId: string): Promise<UserWallet> {
    return this.getWallet(userId);
  }

  async getAllUserIds(): Promise<string[]> {
    const users = await this.userRepo.find({ select: { externalId: true } });
    return users.map((u) => u.externalId);
  }

  async getWeekStat(userId: string): Promise<UserWeekStat | undefined> {
    const key = getWeekKey();
    const row = await this.weekStatRepo.findOne({
      where: { userId, weekKey: key },
    });
    if (!row) return undefined;
    return {
      weekKey: row.weekKey,
      startEquity: Number(row.startEquity),
      opsTradeCount: row.opsTradeCount,
    };
  }

  async setWeekStat(userId: string, stat: UserWeekStat): Promise<void> {
    await this.weekStatRepo.save({
      userId,
      weekKey: stat.weekKey,
      startEquity: stat.startEquity,
      opsTradeCount: stat.opsTradeCount,
    });
  }

  async saveWallet(wallet: UserWallet): Promise<void> {
    await this.userRepo.save({
      externalId: wallet.userId,
      points: wallet.points,
    });
    for (const [instrumentId, pos] of Object.entries(wallet.positions)) {
      if (pos.longShares === 0 && pos.shortShares === 0) {
        await this.positionRepo.delete({ userId: wallet.userId, instrumentId });
        continue;
      }
      await this.positionRepo.save({
        userId: wallet.userId,
        instrumentId,
        longShares: pos.longShares,
        shortShares: pos.shortShares,
      });
    }
  }

  async updateInstrument(
    id: string,
    patch: Partial<InstrumentState>,
  ): Promise<InstrumentState> {
    const row = await this.instrumentRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`상품을 찾을 수 없습니다: ${id}`);
    }
    if (patch.oracleValue != null) row.oracleValue = patch.oracleValue;
    if (patch.sentiment != null) row.sentiment = patch.sentiment;
    if (patch.fairPrice != null) row.fairPrice = patch.fairPrice;
    if (patch.price != null) row.price = patch.price;
    await this.instrumentRepo.save(row);
    return this.getInstrument(id);
  }

  async recalcPrice(id: string): Promise<InstrumentState> {
    const inst = await this.getInstrument(id);
    const fairPrice = this.pricing.fairPrice(inst.metric, inst.oracleValue);
    const price = this.pricing.marketPrice(fairPrice, inst.sentiment);
    const updated = await this.updateInstrument(id, { fairPrice, price });
    await this.pushPriceSnapshot(id);
    return updated;
  }

  private async pushPriceSnapshot(instrumentId: string): Promise<void> {
    const inst = await this.getInstrument(instrumentId);
    await this.snapshotRepo.save({
      instrumentId,
      price: inst.price,
      fairPrice: inst.fairPrice,
      oracleValue: inst.oracleValue,
      sentiment: inst.sentiment,
    });
    const total = await this.snapshotRepo.count({ where: { instrumentId } });
    if (total > 80) {
      const oldest = await this.snapshotRepo.find({
        where: { instrumentId },
        order: { createdAt: 'ASC' },
        take: total - 80,
      });
      await this.snapshotRepo.remove(oldest);
    }
  }

  async getPriceHistory(instrumentId: string): Promise<PriceSnapshot[]> {
    const rows = await this.snapshotRepo.find({
      where: { instrumentId },
      order: { createdAt: 'ASC' },
      take: 80,
    });
    return rows.map(toPriceSnapshot);
  }

  async getStats() {
    const [tradeCount, walletCount, instrumentCount] = await Promise.all([
      this.tradeRepo.count(),
      this.userRepo.count(),
      this.instrumentRepo.count(),
    ]);
    return { tradeCount, walletCount, instrumentCount };
  }

  async addTrade(
    partial: Omit<TradeRecord, 'id' | 'createdAt' | 'instrumentName'>,
  ): Promise<TradeRecord> {
    const inst = await this.instrumentRepo.findOne({
      where: { id: partial.instrumentId },
    });
    const saved = await this.tradeRepo.save({
      userId: partial.userId,
      instrumentId: partial.instrumentId,
      instrumentName: inst?.name,
      action: partial.action,
      quantity: partial.quantity,
      price: partial.price,
      pointsDelta: partial.pointsDelta,
      oracleValue: partial.oracleValue,
    });
    await this.recordOpsTrade(partial.userId, partial.instrumentId);
    await this.pruneTrades();
    return toTradeRecord(saved);
  }

  private async pruneTrades(): Promise<void> {
    const total = await this.tradeRepo.count();
    if (total <= MAX_TRADES) return;
    const oldest = await this.tradeRepo.find({
      order: { createdAt: 'ASC' },
      take: total - MAX_TRADES,
    });
    if (oldest.length) await this.tradeRepo.remove(oldest);
  }

  async getRecentTrades(
    limit = 20,
    instrumentId?: string,
  ): Promise<TradeRecord[]> {
    const rows = await this.tradeRepo.find({
      where: instrumentId ? { instrumentId } : {},
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.map(toTradeRecord);
  }

  private async recordOpsTrade(
    userId: string,
    instrumentId: string,
  ): Promise<void> {
    if (instrumentId !== LEE_JUNG_HOO_OPS_ID) return;
    const key = getWeekKey();
    const row = await this.weekStatRepo.findOne({
      where: { userId, weekKey: key },
    });
    if (row) {
      row.opsTradeCount += 1;
      await this.weekStatRepo.save(row);
    }
  }

  /** 재배포·동시 기동 시 duplicate key 방지 */
  private async upsertInstrument(entity: InstrumentEntity): Promise<void> {
    const found = await this.instrumentRepo.findOne({
      where: { id: entity.id },
      select: { id: true },
    });
    if (found) return;
    try {
      await this.instrumentRepo.insert(entity);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === '23505') return;
      throw e;
    }
  }

  private async ensurePriceSnapshot(instrumentId: string): Promise<void> {
    const n = await this.snapshotRepo.count({ where: { instrumentId } });
    if (n === 0) await this.pushPriceSnapshot(instrumentId);
  }

  private memeToEntity(seed: MemeStockSeed): InstrumentEntity {
    const fairPrice = this.pricing.fairPrice('hype', seed.oracleValue);
    const entity = new InstrumentEntity();
    entity.id = seed.id;
    entity.name = seed.title;
    entity.symbol = seed.symbol;
    entity.teamName = seed.teamName;
    entity.teamShort = seed.teamShort;
    entity.playerName = seed.title;
    entity.metric = 'hype';
    entity.metricLabel = seed.metricLabel;
    entity.oracleValue = seed.oracleValue;
    entity.sentiment = 1;
    entity.fairPrice = fairPrice;
    entity.price = this.pricing.marketPrice(fairPrice, 1);
    entity.accent = seed.accent;
    return entity;
  }

  private seedToEntity(seed: LineupSeed): InstrumentEntity {
    const metricLabel =
      seed.metric === 'era' ? 'ERA' : seed.metric === 'hype' ? 'HYPE' : 'OPS';
    const fairPrice = this.pricing.fairPrice(seed.metric, seed.oracleValue);
    const entity = new InstrumentEntity();
    entity.id = seed.id;
    entity.name = `${seed.playerName} ${metricLabel}`;
    entity.symbol = seed.symbol;
    entity.teamName = seed.teamName;
    entity.teamShort = seed.teamShort;
    entity.playerName = seed.playerName;
    entity.metric = seed.metric;
    entity.metricLabel = metricLabel;
    entity.oracleValue = seed.oracleValue;
    entity.sentiment = 1;
    entity.fairPrice = fairPrice;
    entity.price = this.pricing.marketPrice(fairPrice, 1);
    entity.accent = seed.accent;
    return entity;
  }
}
