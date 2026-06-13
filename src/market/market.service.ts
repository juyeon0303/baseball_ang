import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { MEME_STOCKS } from './market-meme-lineup';
import {
  findSeedById,
  findSeedByPlayerName,
  KBO_TEAM_STOCKS,
  LEE_JUNG_HOO_OPS_ID,
} from './market-lineup';
import { MARKET_STORE } from './market-store.interface';
import type { IMarketStore } from './market-store.interface';
import { MemoryMarketStoreService } from './memory-market-store.service';
import { PostgresMarketStoreService } from './postgres-market-store.service';
import {
  InstrumentState,
  LeaderboardEntry,
  LeaderboardResult,
  OrderResult,
  OrderSide,
  Position,
  PriceSnapshot,
  TradeAction,
  UserWallet,
  UserWeekStat,
} from './market.types';
import { getWeekKey, getWeekLabel } from './week.util';
import { PricingService } from './pricing.service';
import { THEME_ETFS } from './etf-lineup';

@Injectable()
export class MarketService {
  constructor(
    @Inject(MARKET_STORE)
    private readonly store: MemoryMarketStoreService | PostgresMarketStoreService,
    private readonly pricing: PricingService,
    private readonly stream: StockStreamGateway,
  ) {}

  async getLineup(): Promise<InstrumentState[]> {
    return Promise.resolve(this.store.getLineup());
  }

  async getMemeLineup(): Promise<InstrumentState[]> {
    if ('getMemeLineup' in this.store && typeof this.store.getMemeLineup === 'function') {
      return this.store.getMemeLineup();
    }
    return Promise.all(
      MEME_STOCKS.map((s) => Promise.resolve(this.store.getInstrument(s.id))),
    );
  }

  async getMarket(instrumentId: string): Promise<
    InstrumentState & { priceHistory: PriceSnapshot[] }
  > {
    const instrument = await Promise.resolve(
      this.store.getInstrument(instrumentId),
    );
    const priceHistory = await Promise.resolve(
      this.store.getPriceHistory(instrumentId),
    );
    return { ...instrument, priceHistory };
  }

  async getStatus(selectedId = LEE_JUNG_HOO_OPS_ID) {
    const instrument = await Promise.resolve(
      this.store.getInstrument(selectedId),
    );
    const stats = await Promise.resolve(this.store.getStats());
    const premiumPct =
      instrument.fairPrice > 0
        ? ((instrument.price - instrument.fairPrice) / instrument.fairPrice) *
          100
        : 0;

    return {
      serverTime: new Date().toISOString(),
      storageMode: process.env.STORAGE_MODE ?? 'memory',
      selectedId,
      instrument,
      lineup: await Promise.resolve(this.store.getLineup()),
      stats,
      premiumPct: Math.round(premiumPct * 100) / 100,
      priceHistory: await Promise.resolve(
        this.store.getPriceHistory(selectedId),
      ),
      recentTrades: await Promise.resolve(this.store.getRecentTrades(20)),
      roadmap: [
        { id: 'ten-stocks', label: 'KBO 10구단 대표 종목', status: 'done' },
        { id: 'charts', label: '종목별 시세 차트', status: 'done' },
        { id: 'postgres', label: 'Postgres 데이터 저장', status: 'done' },
        {
          id: 'live-stats',
          label: 'KBO·MLB 기록 갱신 (09:00 / 10:00)',
          status: 'done',
        },
        { id: 'live-score', label: '실시간 점수판·타석 소식', status: 'done' },
        { id: 'meme-stocks', label: '밈·화제 베팅', status: 'done' },
        { id: 'mobile-app', label: 'Ruta++ 모바일 앱 (app/)', status: 'todo' },
        { id: 'web-frontend', label: '웹 프론트 (web/)', status: 'done' },
      ],
    };
  }

  async getRecentTrades(limit = 30, instrumentId?: string) {
    return Promise.resolve(this.store.getRecentTrades(limit, instrumentId));
  }

  async getStoreStats() {
    return Promise.resolve(this.store.getStats());
  }

  /** 군중 롱/숏 비율 (보유 주식 수 기준) */
  async getCrowdRatio(instrumentId: string) {
    let longShares = 0;
    let shortShares = 0;
    const userIds = await Promise.resolve(this.store.getAllUserIds());
    for (const userId of userIds) {
      const wallet = await Promise.resolve(this.store.getWallet(userId));
      const pos = wallet.positions[instrumentId];
      if (!pos) continue;
      longShares += pos.longShares;
      shortShares += pos.shortShares;
    }
    const total = longShares + shortShares;
    const longPct = total > 0 ? Math.round((longShares / total) * 100) : 50;
    return {
      longShares,
      shortShares,
      longPct,
      shortPct: 100 - longPct,
      participants: userIds.length,
    };
  }

  async getLeaderboard(limit = 10): Promise<LeaderboardResult> {
    const weekKey = getWeekKey();
    const entries: LeaderboardEntry[] = [];
    const userIds = await Promise.resolve(this.store.getAllUserIds());

    for (const userId of userIds) {
      const wallet = await Promise.resolve(this.store.getWallet(userId));
      await this.ensureWeekStat(userId, wallet);
      const stat = (await Promise.resolve(this.store.getWeekStat(userId)))!;
      const currentEquity = await this.calcEquity(wallet);
      const weeklyReturnPct = this.calcReturnPct(
        stat.startEquity,
        currentEquity,
      );
      entries.push({
        rank: 0,
        userId,
        startEquity: stat.startEquity,
        currentEquity,
        weeklyReturnPct,
        opsTradeCount: stat.opsTradeCount,
      });
    }

    entries.sort((a, b) => b.weeklyReturnPct - a.weeklyReturnPct);
    const ranked = entries.map((e, i) => ({ ...e, rank: i + 1 }));
    const rankings = ranked.slice(0, limit);

    const opsCandidates = entries.filter((e) => e.opsTradeCount > 0);
    opsCandidates.sort((a, b) => {
      if (b.weeklyReturnPct !== a.weeklyReturnPct) {
        return b.weeklyReturnPct - a.weeklyReturnPct;
      }
      return b.opsTradeCount - a.opsTradeCount;
    });
    const opsKing = opsCandidates[0]
      ? { ...opsCandidates[0], isOpsKing: true }
      : null;
    if (opsKing) {
      const inRank = rankings.find((r) => r.userId === opsKing.userId);
      if (inRank) inRank.isOpsKing = true;
    }

    return {
      weekKey,
      weekLabel: getWeekLabel(weekKey),
      updatedAt: new Date().toISOString(),
      totalParticipants: ranked.length,
      opsKing,
      rankings,
    };
  }

  async calcEquity(wallet: UserWallet): Promise<number> {
    let total = wallet.points;
    for (const [instrumentId, pos] of Object.entries(wallet.positions)) {
      if (!(await Promise.resolve(this.store.hasInstrument(instrumentId)))) {
        continue;
      }
      const inst = await Promise.resolve(
        this.store.getInstrument(instrumentId),
      );
      total += pos.longShares * inst.price - pos.shortShares * inst.price;
    }
    return Math.round(total);
  }

  async getPortfolio(userId: string, instrumentId = LEE_JUNG_HOO_OPS_ID) {
    await this.touchWeekStat(userId);
    const instrument = await Promise.resolve(
      this.store.getInstrument(instrumentId),
    );
    const wallet = await Promise.resolve(this.store.getWallet(userId));
    const weekStat = (await Promise.resolve(this.store.getWeekStat(userId)))!;
    const pos = wallet.positions[instrumentId] ?? {
      longShares: 0,
      shortShares: 0,
    };
    const longValue = pos.longShares * instrument.price;
    const shortLiability = pos.shortShares * instrument.price;
    const currentEquity = await this.calcEquity(wallet);
    const lbAll = await this.getLeaderboard(9999);
    const myRank =
      lbAll.rankings.find((r) => r.userId === userId)?.rank ?? null;

    const holdings: Array<{
      instrumentId: string;
      teamShort: string;
      playerName: string;
      kind: InstrumentState['kind'];
      price: number;
      longShares: number;
      shortShares: number;
      value: number;
    }> = [];
    for (const [instrumentId, p] of Object.entries(wallet.positions)) {
      if (p.longShares === 0 && p.shortShares === 0) continue;
      if (!(await Promise.resolve(this.store.hasInstrument(instrumentId)))) {
        continue;
      }
      const inst = await Promise.resolve(
        this.store.getInstrument(instrumentId),
      );
      holdings.push({
        instrumentId,
        teamShort: inst.teamShort,
        playerName: inst.playerName,
        kind: inst.kind,
        price: inst.price,
        longShares: p.longShares,
        shortShares: p.shortShares,
        value: p.longShares * inst.price - p.shortShares * inst.price,
      });
    }
    holdings.sort(
      (a, b) => Math.abs(b.value) - Math.abs(a.value) || b.price - a.price,
    );

    return {
      wallet,
      instrument,
      position: pos,
      longValue,
      shortLiability,
      equity: currentEquity,
      weeklyReturnPct: this.calcReturnPct(weekStat.startEquity, currentEquity),
      weekLabel: getWeekLabel(weekStat.weekKey),
      startEquity: weekStat.startEquity,
      totalParticipants: lbAll.totalParticipants,
      myRank,
      isOpsKing: lbAll.opsKing?.userId === userId,
      holdings,
      recentTrades: await Promise.resolve(
        this.store.getRecentTrades(10, instrumentId),
      ),
    };
  }

  async executeBuy(
    userId: string,
    instrumentId: string,
    quantity: number,
    side: OrderSide = 'long',
  ): Promise<OrderResult> {
    await this.assertInstrument(instrumentId);
    this.assertQuantity(quantity);
    await this.touchWeekStat(userId);

    const wallet = await Promise.resolve(this.store.getOrCreateWallet(userId));
    const instrument = await Promise.resolve(
      this.store.getInstrument(instrumentId),
    );
    const price = instrument.price;
    const cost = price * quantity;
    const pos = this.getMutablePosition(wallet, instrumentId);

    if (side === 'long') {
      if (wallet.points < cost) {
        throw new BadRequestException('포인트가 부족합니다.');
      }
      wallet.points -= cost;
      pos.longShares += quantity;
      return this.finalizeTrade(userId, instrumentId, {
        action: 'open_long',
        quantity,
        price,
        pointsDelta: -cost,
        wallet,
        sentimentAction: 'bullish',
      });
    }

    if (pos.shortShares < quantity) {
      throw new BadRequestException('청산할 숏 수량이 부족합니다.');
    }
    if (wallet.points < cost) {
      throw new BadRequestException('숏 청산에 필요한 포인트가 부족합니다.');
    }
    wallet.points -= cost;
    pos.shortShares -= quantity;
    return this.finalizeTrade(userId, instrumentId, {
      action: 'close_short',
      quantity,
      price,
      pointsDelta: -cost,
      wallet,
      sentimentAction: 'bullish',
    });
  }

  async executeSell(
    userId: string,
    instrumentId: string,
    quantity: number,
    side: OrderSide = 'long',
  ): Promise<OrderResult> {
    await this.assertInstrument(instrumentId);
    this.assertQuantity(quantity);
    await this.touchWeekStat(userId);

    const wallet = await Promise.resolve(this.store.getOrCreateWallet(userId));
    const instrument = await Promise.resolve(
      this.store.getInstrument(instrumentId),
    );
    const price = instrument.price;
    const proceeds = price * quantity;
    const pos = this.getMutablePosition(wallet, instrumentId);

    if (side === 'long') {
      if (pos.longShares < quantity) {
        throw new BadRequestException('보유 롱 수량이 부족합니다.');
      }
      pos.longShares -= quantity;
      wallet.points += proceeds;
      return this.finalizeTrade(userId, instrumentId, {
        action: 'close_long',
        quantity,
        price,
        pointsDelta: proceeds,
        wallet,
        sentimentAction: 'bearish',
      });
    }

    pos.shortShares += quantity;
    wallet.points += proceeds;
    return this.finalizeTrade(userId, instrumentId, {
      action: 'open_short',
      quantity,
      price,
      pointsDelta: proceeds,
      wallet,
      sentimentAction: 'bearish',
    });
  }

  /** 공시·프리마켓 — ±1~5% 미세 변동 */
  async applyDisclosureShock(
    instrumentId: string,
    sentimentDelta: number,
  ): Promise<InstrumentState | null> {
    return this.applyPlaySentiment(instrumentId, sentimentDelta);
  }

  async getEtfBaskets() {
    const rows: Array<{
      id: string;
      name: string;
      tagline: string;
      memberIds: string[];
      accent: string;
      leverage?: number;
      basketPrice: number;
      members: Array<{
        instrumentId: string;
        playerName: string;
        teamShort: string;
        price: number;
      }>;
    }> = [];
    for (const etf of THEME_ETFS) {
      let sum = 0;
      const members: Array<{
        instrumentId: string;
        playerName: string;
        teamShort: string;
        price: number;
      }> = [];
      for (const id of etf.memberIds) {
        if (!(await Promise.resolve(this.store.hasInstrument(id)))) continue;
        const inst = await Promise.resolve(this.store.getInstrument(id));
        sum += inst.price;
        members.push({
          instrumentId: id,
          playerName: inst.playerName,
          teamShort: inst.teamShort,
          price: inst.price,
        });
      }
      rows.push({
        ...etf,
        basketPrice: members.length ? Math.round(sum / members.length) : 0,
        members,
      });
    }
    return rows;
  }

  /** 경기 플레이 → 군중 심리( sentiment ) 미세 반영 — 시즌 OPS와 별도 */
  async applyPlaySentiment(
    instrumentId: string,
    delta: number,
  ): Promise<InstrumentState | null> {
    if (!Number.isFinite(delta) || delta === 0) return null;
    try {
      const inst = await Promise.resolve(this.store.getInstrument(instrumentId));
      await Promise.resolve(
        this.store.updateInstrument(instrumentId, {
          sentiment: Math.max(0.5, Math.min(2, inst.sentiment + delta)),
        }),
      );
      const updated = await Promise.resolve(this.store.recalcPrice(instrumentId));
      this.broadcast(updated);
      return updated;
    } catch {
      return null;
    }
  }

  async updateMemeOracle(
    instrumentId: string,
    value: number,
  ): Promise<InstrumentState> {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new BadRequestException('밈 지수는 0~100 범위여야 합니다.');
    }
    return this.updateOracle(instrumentId, value);
  }

  async updateMemeTrend(
    instrumentId: string,
    patch: {
      value: number;
      title?: string;
      betCta?: string;
      narrative?: string;
      yesBet?: string;
      noBet?: string;
    },
  ): Promise<InstrumentState> {
    const inst = await Promise.resolve(this.store.getInstrument(instrumentId));
    if (inst.kind !== 'meme') {
      throw new BadRequestException('밈 종목만 갱신할 수 있습니다.');
    }
    const updates: Partial<InstrumentState> = {};
    if (patch.title) {
      updates.name = patch.title;
      updates.playerName = patch.title;
    }
    if (patch.betCta) updates.betCta = patch.betCta;
    if (patch.narrative) updates.narrative = patch.narrative;
    if (patch.yesBet) updates.yesBet = patch.yesBet;
    if (patch.noBet) updates.noBet = patch.noBet;
    await Promise.resolve(
      this.store.updateInstrument(instrumentId, updates),
    );
    return this.updateMemeOracle(instrumentId, patch.value);
  }

  async updateOracle(instrumentId: string, value: number): Promise<InstrumentState> {
    const inst = await Promise.resolve(this.store.getInstrument(instrumentId));
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('유효한 오라클 값이 필요합니다.');
    }
    if (inst.metric === 'hype' && value > 100) {
      throw new BadRequestException('밈 지수는 0~100 범위여야 합니다.');
    }
    if (inst.metric === 'ops' && (value <= 0 || value > 2)) {
      throw new BadRequestException('OPS 범위를 확인하세요.');
    }
    if (inst.metric === 'era' && (value <= 0 || value > 15)) {
      throw new BadRequestException('ERA 범위를 확인하세요.');
    }
    await Promise.resolve(
      this.store.updateInstrument(instrumentId, { oracleValue: value }),
    );
    const updated = await Promise.resolve(this.store.recalcPrice(instrumentId));
    this.broadcast(updated);
    return updated;
  }

  async ingestPlayerStat(payload: {
    name?: string;
    instrumentId?: string;
    team?: string;
    hits?: number;
    ab?: number;
    ops?: number;
    era?: number;
  }): Promise<InstrumentState | null> {
    const seed =
      (payload.instrumentId
        ? findSeedById(payload.instrumentId)
        : undefined) ??
      findSeedByPlayerName(payload.name ?? '');
    if (!seed) return null;

    let value: number | null = null;
    if (seed.metric === 'era') {
      value = payload.era ?? null;
    } else {
      value =
        payload.ops ??
        (payload.hits != null && payload.ab != null
          ? this.pricing.opsFromHitting(payload.hits, payload.ab)
          : null);
    }
    if (value == null) return null;
    return this.updateOracle(seed.id, value);
  }

  private async finalizeTrade(
    userId: string,
    instrumentId: string,
    ctx: {
      action: TradeAction;
      quantity: number;
      price: number;
      pointsDelta: number;
      wallet: UserWallet;
      sentimentAction: 'bullish' | 'bearish';
    },
  ): Promise<OrderResult> {
    const inst = await Promise.resolve(this.store.getInstrument(instrumentId));
    const delta = this.pricing.sentimentDelta(
      ctx.quantity,
      ctx.sentimentAction,
    );
    await Promise.resolve(
      this.store.updateInstrument(instrumentId, {
        sentiment: Math.max(0.5, Math.min(2, inst.sentiment + delta)),
      }),
    );
    const instrument = await Promise.resolve(
      this.store.recalcPrice(instrumentId),
    );
    await Promise.resolve(this.store.saveWallet(ctx.wallet));

    const trade = await Promise.resolve(
      this.store.addTrade({
        userId,
        instrumentId,
        action: ctx.action,
        quantity: ctx.quantity,
        price: ctx.price,
        pointsDelta: ctx.pointsDelta,
        oracleValue: instrument.oracleValue,
      }),
    );

    this.broadcast(instrument);
    this.stream.broadcastTradeFeed({
      userId,
      action: ctx.action,
      instrumentName: trade.instrumentName,
      quantity: ctx.quantity,
      price: ctx.price,
    });

    return {
      success: true,
      message: '체결 완료',
      trade,
      instrument,
      wallet: await Promise.resolve(this.store.getWallet(userId)),
    };
  }

  private getMutablePosition(
    wallet: UserWallet,
    instrumentId: string,
  ): Position {
    if (!wallet.positions[instrumentId]) {
      wallet.positions[instrumentId] = { longShares: 0, shortShares: 0 };
    }
    return wallet.positions[instrumentId];
  }

  private broadcast(instrument: InstrumentState): void {
    this.stream.broadcastPriceUpdate({
      id: instrument.id,
      name: instrument.name,
      teamShort: instrument.teamShort,
      playerName: instrument.playerName,
      price: instrument.price,
      fairPrice: instrument.fairPrice,
      oracleValue: instrument.oracleValue,
      oracleOps: instrument.oracleValue,
      metric: instrument.metric,
      sentiment: instrument.sentiment,
      updatedAt: instrument.updatedAt,
    });
  }

  private async assertInstrument(instrumentId: string): Promise<void> {
    if (!(await Promise.resolve(this.store.hasInstrument(instrumentId)))) {
      throw new NotFoundException(`상품을 찾을 수 없습니다: ${instrumentId}`);
    }
  }

  private assertQuantity(quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('수량은 1 이상의 정수여야 합니다.');
    }
  }

  private async ensureWeekStat(
    userId: string,
    wallet: UserWallet,
  ): Promise<UserWeekStat> {
    const weekKey = getWeekKey();
    const equity = await this.calcEquity(wallet);
    let stat = await Promise.resolve(this.store.getWeekStat(userId));
    if (!stat || stat.weekKey !== weekKey) {
      stat = {
        weekKey,
        startEquity: equity,
        opsTradeCount: 0,
      };
      await Promise.resolve(this.store.setWeekStat(userId, stat));
    }
    return stat;
  }

  private async touchWeekStat(userId: string): Promise<void> {
    const wallet = await Promise.resolve(this.store.getOrCreateWallet(userId));
    await this.ensureWeekStat(userId, wallet);
  }

  private calcReturnPct(start: number, current: number): number {
    if (start <= 0) return 0;
    return Math.round(((current - start) / start) * 10000) / 100;
  }
}
