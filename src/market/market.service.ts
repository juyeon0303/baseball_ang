import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
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
  TradeRecord,
  UserWallet,
  UserWeekStat,
} from './market.types';
import { getWeekKey, getWeekLabel } from './week.util';
import { getEffectiveStorageMode, isPersistentStorage } from '../persist/storage-mode';
import { getMarketSession, isMarketHoursEnforced } from './market-session.util';
import { isKboGameDay } from '../stats/game-day.util';
import { PricingService } from './pricing.service';
import { THEME_ETFS } from './etf-lineup';
import {
  buildPulseWeekKing,
  buildShowcaseTrades,
  SHOWCASE_TRADE_USERS,
} from './market-showcase.util';

@Injectable()
export class MarketService implements OnModuleInit {
  private readonly logger = new Logger(MarketService.name);
  private leaderboardSnapshot: {
    at: number;
    weekKey: string;
    allRanked: LeaderboardEntry[];
    opsKing: LeaderboardEntry | null;
  } | null = null;
  private readonly LEADERBOARD_TTL_MS = 4_000;

  constructor(
    @Inject(MARKET_STORE)
    private readonly store: MemoryMarketStoreService | PostgresMarketStoreService,
    private readonly pricing: PricingService,
    private readonly stream: StockStreamGateway,
  ) {}

  onModuleInit(): void {
    setTimeout(() => {
      void this.ensureShowcaseActivity().catch((e) =>
        this.logger.warn(`마켓 쇼케이스 시드: ${e}`),
      );
    }, 18_000);
  }

  async ensureShowcaseActivity(): Promise<void> {
    const stats = await Promise.resolve(this.store.getStats());
    if (stats.tradeCount > 0) return;
    const actions: TradeAction[] = [
      'open_long',
      'open_short',
      'open_long',
      'open_long',
      'open_short',
      'open_long',
      'open_short',
      'open_long',
    ];
    let seeded = 0;
    for (let i = 0; i < KBO_TEAM_STOCKS.length && seeded < 8; i += 1) {
      const seed = KBO_TEAM_STOCKS[i];
      try {
        const inst = await Promise.resolve(this.store.getInstrument(seed.id));
        const action = actions[seeded % actions.length];
        const qty = 2 + (seeded % 4);
        await Promise.resolve(
          this.store.addTrade({
            userId: SHOWCASE_TRADE_USERS[seeded % SHOWCASE_TRADE_USERS.length],
            instrumentId: seed.id,
            action,
            quantity: qty,
            price: inst.price,
            pointsDelta:
              action === 'open_short' ? qty * inst.price : -(qty * inst.price),
            oracleValue: inst.oracleValue,
          }),
        );
        seeded += 1;
      } catch (e) {
        this.logger.debug(`쇼케이스 체결 스킵 ${seed.id}: ${e}`);
      }
    }
    if (seeded > 0) {
      this.logger.log(`마켓 쇼케이스 — 데모 체결 ${seeded}건 시드`);
    }
  }

  async getShowcaseTrades(limit = 8): Promise<TradeRecord[]> {
    const resolve = new Map<string, InstrumentState>();
    for (const seed of KBO_TEAM_STOCKS.slice(0, limit)) {
      try {
        const inst = await Promise.resolve(this.store.getInstrument(seed.id));
        resolve.set(seed.id, inst);
      } catch {
        /* skip */
      }
    }
    return buildShowcaseTrades((id) => resolve.get(id) ?? null, limit);
  }

  getPulseWeekKing(
    board: Awaited<ReturnType<MarketService['getMarketBoard']>>,
  ) {
    return buildPulseWeekKing(board.gainers[0]);
  }

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

  async getInstrument(instrumentId: string): Promise<InstrumentState> {
    return Promise.resolve(this.store.getInstrument(instrumentId));
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
    return {
      ...instrument,
      changePct: this.calcChangePct(priceHistory),
      priceHistory,
    };
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
      effectiveStorage: getEffectiveStorageMode(),
      persistent: isPersistentStorage(),
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

  async getUserTrades(userId: string, limit = 40) {
    return Promise.resolve(this.store.getUserTrades(userId, limit));
  }

  calcChangePct(history: PriceSnapshot[]): number {
    if (!history?.length || history.length < 2) return 0;
    const first = history[0]?.price ?? 0;
    const last = history[history.length - 1]?.price ?? 0;
    if (!first) return 0;
    return Math.round(((last - first) / first) * 1000) / 10;
  }

  async enrichInstrument(inst: InstrumentState): Promise<InstrumentState> {
    const history = await Promise.resolve(this.store.getPriceHistory(inst.id));
    const changePct = this.calcChangePct(history);
    let yesBet = inst.yesBet;
    let noBet = inst.noBet;
    if (inst.kind === 'player' && !yesBet) {
      if (inst.metric === 'era') {
        yesBet = 'ERA↓';
        noBet = 'ERA↑ (숏)';
      } else if (inst.metric === 'ops') {
        yesBet = 'OPS↑';
        noBet = 'OPS↓ (숏)';
      } else {
        yesBet = 'YES';
        noBet = 'NO (숏)';
      }
    }
    return { ...inst, changePct, yesBet, noBet };
  }

  async getMarketBoard(limit = 12) {
    const lineup = await this.getLineup();
    const memes = await this.getMemeLineup();
    const rows = await Promise.all(
      [...lineup, ...memes].map((inst) => this.enrichInstrument(inst)),
    );
    rows.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    const gainers = rows.filter((r) => (r.changePct ?? 0) > 0).slice(0, limit);
    const losers = [...rows]
      .filter((r) => (r.changePct ?? 0) < 0)
      .sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0))
      .slice(0, limit);
    return {
      updatedAt: new Date().toISOString(),
      gainers,
      losers,
      all: rows,
    };
  }

  async getStoreStats() {
    return Promise.resolve(this.store.getStats());
  }

  /** 군중 롱/숏 비율 (보유 주식 수 기준) */
  async getCrowdRatio(instrumentId: string) {
    let longShares = 0;
    let shortShares = 0;
    let participants = 0;
    const userIds = await Promise.resolve(this.store.getAllUserIds());
    for (const userId of userIds) {
      const wallet = await Promise.resolve(this.store.getWallet(userId));
      const pos = wallet.positions[instrumentId];
      if (!pos) continue;
      if (pos.longShares > 0 || pos.shortShares > 0) participants++;
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
      participants,
    };
  }

  private invalidateLeaderboardCache(): void {
    this.leaderboardSnapshot = null;
  }

  private async loadLeaderboardSnapshot(): Promise<{
    weekKey: string;
    allRanked: LeaderboardEntry[];
    opsKing: LeaderboardEntry | null;
  }> {
    const weekKey = getWeekKey();
    const now = Date.now();
    if (
      this.leaderboardSnapshot &&
      this.leaderboardSnapshot.weekKey === weekKey &&
      now - this.leaderboardSnapshot.at < this.LEADERBOARD_TTL_MS
    ) {
      return this.leaderboardSnapshot;
    }

    const entries: LeaderboardEntry[] = [];
    const userIds = await Promise.resolve(this.store.getAllUserIds());

    for (const userId of userIds) {
      try {
        const wallet = await Promise.resolve(this.store.getWallet(userId));
        const stat = await this.ensureWeekStat(userId, wallet);
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
      } catch {
        continue;
      }
    }

    entries.sort((a, b) => b.weeklyReturnPct - a.weeklyReturnPct);
    const allRanked = entries.map((e, i) => ({ ...e, rank: i + 1 }));

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
      const inRank = allRanked.find((r) => r.userId === opsKing.userId);
      if (inRank) inRank.isOpsKing = true;
    }

    this.leaderboardSnapshot = {
      at: now,
      weekKey,
      allRanked,
      opsKing,
    };
    return this.leaderboardSnapshot;
  }

  async getLeaderboard(limit = 10): Promise<LeaderboardResult> {
    const snap = await this.loadLeaderboardSnapshot();
    const rankings = snap.allRanked.slice(0, limit);

    return {
      weekKey: snap.weekKey,
      weekLabel: getWeekLabel(snap.weekKey),
      updatedAt: new Date().toISOString(),
      totalParticipants: snap.allRanked.length,
      opsKing: snap.opsKing,
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
    const wallet = await Promise.resolve(this.store.getWallet(userId));
    const weekStat = await this.ensureWeekStat(userId, wallet);
    const instrument = await Promise.resolve(
      this.store.getInstrument(instrumentId),
    );
    const pos = wallet.positions[instrumentId] ?? {
      longShares: 0,
      shortShares: 0,
    };
    const longValue = pos.longShares * instrument.price;
    const shortLiability = pos.shortShares * instrument.price;
    const currentEquity = await this.calcEquity(wallet);
    const lbSnap = await this.loadLeaderboardSnapshot();
    const myRank =
      lbSnap.allRanked.find((r) => r.userId === userId)?.rank ?? null;

    const holdings: Array<{
      instrumentId: string;
      teamShort: string;
      playerName: string;
      kind: InstrumentState['kind'];
      price: number;
      longShares: number;
      shortShares: number;
      value: number;
      avgLongPrice: number;
      avgShortPrice: number;
      unrealizedPnl: number;
      unrealizedPnlPct: number;
    }> = [];
    for (const [posInstrumentId, p] of Object.entries(wallet.positions)) {
      if (p.longShares === 0 && p.shortShares === 0) continue;
      if (!(await Promise.resolve(this.store.hasInstrument(posInstrumentId)))) {
        continue;
      }
      const inst = await Promise.resolve(
        this.store.getInstrument(posInstrumentId),
      );
      const longCost = p.longCost ?? 0;
      const shortCredit = p.shortCredit ?? 0;
      const longPnl =
        p.longShares > 0 ? p.longShares * inst.price - longCost : 0;
      const shortPnl =
        p.shortShares > 0 ? shortCredit - p.shortShares * inst.price : 0;
      const unrealizedPnl = Math.round(longPnl + shortPnl);
      const basis =
        longCost + (p.shortShares > 0 ? shortCredit : 0);
      const unrealizedPnlPct =
        basis > 0 ? Math.round((unrealizedPnl / basis) * 1000) / 10 : 0;
      holdings.push({
        instrumentId: posInstrumentId,
        teamShort: inst.teamShort,
        playerName: inst.playerName,
        kind: inst.kind,
        price: inst.price,
        longShares: p.longShares,
        shortShares: p.shortShares,
        value: p.longShares * inst.price - p.shortShares * inst.price,
        avgLongPrice:
          p.longShares > 0
            ? Math.round(longCost / p.longShares)
            : 0,
        avgShortPrice:
          p.shortShares > 0
            ? Math.round(shortCredit / p.shortShares)
            : 0,
        unrealizedPnl,
        unrealizedPnlPct,
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
      totalParticipants: lbSnap.allRanked.length,
      myRank,
      isOpsKing: lbSnap.opsKing?.userId === userId,
      holdings,
      recentTrades: await Promise.resolve(
        this.store.getUserTrades(userId, 15),
      ),
    };
  }

  async executeBuy(
    userId: string,
    instrumentId: string,
    quantity: number,
    side: OrderSide = 'long',
  ): Promise<OrderResult> {
    this.assertMarketOpen();
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
      pos.longCost = (pos.longCost ?? 0) + cost;
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
    const avgShort =
      pos.shortShares > 0
        ? (pos.shortCredit ?? 0) / pos.shortShares
        : price;
    wallet.points -= cost;
    pos.shortShares -= quantity;
    pos.shortCredit = Math.max(
      0,
      (pos.shortCredit ?? 0) - avgShort * quantity,
    );
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
    this.assertMarketOpen();
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
      const avgLong =
        pos.longShares > 0 ? (pos.longCost ?? 0) / pos.longShares : price;
      pos.longShares -= quantity;
      pos.longCost = Math.max(0, (pos.longCost ?? 0) - avgLong * quantity);
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
    pos.shortCredit = (pos.shortCredit ?? 0) + proceeds;
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
      changePct: number;
      members: Array<{
        instrumentId: string;
        playerName: string;
        teamShort: string;
        price: number;
        changePct: number;
      }>;
    }> = [];
    for (const etf of THEME_ETFS) {
      let sum = 0;
      let changeSum = 0;
      const members: Array<{
        instrumentId: string;
        playerName: string;
        teamShort: string;
        price: number;
        changePct: number;
      }> = [];
      for (const id of etf.memberIds) {
        try {
          if (!(await Promise.resolve(this.store.hasInstrument(id)))) continue;
          const inst = await Promise.resolve(this.store.getInstrument(id));
          const enriched = await this.enrichInstrument(inst);
          sum += inst.price;
          changeSum += enriched.changePct ?? 0;
          members.push({
            instrumentId: id,
            playerName: inst.playerName,
            teamShort: inst.teamShort,
            price: inst.price,
            changePct: enriched.changePct ?? 0,
          });
        } catch {
          /* 종목 미준비 시 ETF 나머지는 계속 */
        }
      }
      rows.push({
        ...etf,
        basketPrice: members.length ? Math.round(sum / members.length) : 0,
        changePct: members.length
          ? Math.round((changeSum / members.length) * 10) / 10
          : 0,
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
      await this.broadcast(updated);
      return updated;
    } catch {
      return null;
    }
  }

  /** 경기 종료 등 — sentiment를 1.0 쪽으로 완만히 복귀 */
  async decaySentimentTowardNeutral(
    instrumentId: string,
    rate = 0.06,
  ): Promise<InstrumentState | null> {
    if (!Number.isFinite(rate) || rate <= 0) return null;
    try {
      const inst = await Promise.resolve(this.store.getInstrument(instrumentId));
      const next = inst.sentiment + (1 - inst.sentiment) * rate;
      if (Math.abs(next - inst.sentiment) < 0.0001) return null;
      await Promise.resolve(
        this.store.updateInstrument(instrumentId, {
          sentiment: Math.max(0.5, Math.min(2, next)),
        }),
      );
      const updated = await Promise.resolve(this.store.recalcPrice(instrumentId));
      await this.broadcast(updated);
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
    await this.broadcast(updated);
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

    this.invalidateLeaderboardCache();
    await this.broadcast(instrument);
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
      wallet.positions[instrumentId] = {
        longShares: 0,
        shortShares: 0,
        longCost: 0,
        shortCredit: 0,
      };
    }
    return wallet.positions[instrumentId];
  }

  private assertMarketOpen(): void {
    if (!isMarketHoursEnforced()) return;
    const tz = process.env.GAMES_TZ ?? 'Asia/Seoul';
    const session = getMarketSession({
      timeZone: tz,
      isGameDay: isKboGameDay(tz),
      hasLiveGame: false,
    });
    if (!session.isTradeHot) {
      throw new BadRequestException(
        `${session.label} · ${session.detail} — 지금은 주문할 수 없습니다.`,
      );
    }
  }

  private async broadcast(instrument: InstrumentState): Promise<void> {
    const history = await Promise.resolve(
      this.store.getPriceHistory(instrument.id),
    );
    const changePct = this.calcChangePct(history);
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
      changePct,
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
