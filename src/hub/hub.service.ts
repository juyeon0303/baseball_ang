import { Injectable, Logger } from '@nestjs/common';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { GamesService } from '../games/games.service';
import { isKboGameDay } from '../stats/game-day.util';
import { DisclosureService } from '../market/disclosure.service';
import { LEE_JUNG_HOO_OPS_ID } from '../market/market-lineup';
import { getMarketSession } from '../market/market-session.util';
import { MarketService } from '../market/market.service';
import { ShareholderService, buildSkeletonShareholderTeams } from '../market/shareholder.service';
import { OffDayDemoService } from '../market/off-day-demo.service';
import { InstrumentState, LeaderboardResult, TradeRecord } from '../market/market.types';
import { getWeekKey, getWeekLabel } from '../market/week.util';

@Injectable()
export class HubService {
  private readonly logger = new Logger(HubService.name);

  constructor(
    private readonly market: MarketService,
    private readonly games: GamesService,
    private readonly stream: StockStreamGateway,
    private readonly disclosure: DisclosureService,
    private readonly shareholders: ShareholderService,
    private readonly offDayDemo: OffDayDemoService,
  ) {}

  async getHub(
    userId?: string,
    resolveDisplayName?: (accountId: string) => string,
  ) {
    const label = (id: string) =>
      resolveDisplayName?.(id) ?? id.replace(/-/g, '').slice(0, 8);
    const game = this.games.getTodayFeatured();
    const featuredId =
      game.status === 'live' && game.linkedInstrumentId
        ? game.linkedInstrumentId
        : LEE_JUNG_HOO_OPS_ID;
    const tz = process.env.GAMES_TZ ?? 'Asia/Seoul';
    const gameDay = isKboGameDay(tz);
    const hasLive = this.games.getTodayGames().some((g) => g.status === 'live');
    const session = getMarketSession({
      timeZone: tz,
      hasLiveGame: hasLive,
      isGameDay: gameDay,
    });

    const instrument = await this.safeInstrument(featuredId);
    const instrumentEnriched = await this.market.enrichInstrument(instrument);
    const marketBoard = await this.safeMarketBoard();
    const leaderboard = await this.safeLeaderboard();
    const trades = await this.safeTrades();
    const crowd = await this.safeCrowd(featuredId);
    const memeLineup = await this.safeMemeLineup();
    const etfs = await this.safeEtfs();
    const shareholderBoard = await this.safeShareholderBoard(userId);

    const memes = [...memeLineup].sort(
      (a, b) => b.oracleValue - a.oracleValue || b.price - a.price,
    );

    const top = leaderboard.rankings[0] ?? null;
    const rankings = leaderboard.rankings.map((row) => ({
      ...row,
      displayName: label(row.userId),
    }));
    const recentTrades = trades.map((row) => ({
      ...row,
      displayName: label(row.userId),
    }));
    const weekKing = top
      ? { ...top, displayName: label(top.userId) }
      : leaderboard.opsKing
        ? {
            ...leaderboard.opsKing,
            displayName: label(leaderboard.opsKing.userId),
          }
        : null;
    const shareholders = shareholderBoard.teams.map((team) => ({
      ...team,
      owner: team.owner
        ? { ...team.owner, displayName: label(team.owner.userId) }
        : null,
      topHolders: team.topHolders.map((h) => ({
        ...h,
        displayName: label(h.userId),
      })),
    }));
    let me: {
      rank: number | null;
      weeklyReturnPct: number;
      points: number;
      equity: number;
      startEquity: number;
      weekLabel: string;
      totalParticipants: number;
      holdingsCount: number;
      holdings: Array<{
        instrumentId: string;
        teamShort: string;
        playerName: string;
        kind: 'player' | 'meme';
        price: number;
        longShares: number;
        shortShares: number;
        value: number;
        avgLongPrice?: number;
        avgShortPrice?: number;
        unrealizedPnl?: number;
        unrealizedPnlPct?: number;
      }>;
      isOpsKing: boolean;
      teamTitles: Array<{ teamShort: string; stakePct: number; role?: 'owner' | 'major' }>;
      myTrades?: Array<TradeRecord & { displayName?: string }>;
    } | null = null;

    if (userId) {
      try {
        const port = await this.market.getPortfolio(userId, featuredId);
        me = {
          rank: port.myRank,
          weeklyReturnPct: port.weeklyReturnPct,
          points: port.wallet.points,
          equity: port.equity,
          startEquity: port.startEquity,
          weekLabel: port.weekLabel,
          totalParticipants:
            port.totalParticipants ?? leaderboard.totalParticipants ?? 0,
          holdingsCount: port.holdings.length,
          holdings: port.holdings,
          isOpsKing: port.isOpsKing,
          teamTitles: shareholderBoard.myTitles,
          myTrades: (port.recentTrades || []).map((row) => ({
            ...row,
            displayName: label(userId),
          })),
        };
      } catch (e) {
        this.logger.warn(`hub me skipped for ${userId}: ${e}`);
      }
    }

    return {
      featuredId,
      instrument: instrumentEnriched,
      marketBoard,
      game,
      session,
      plays: this.games.getSnapshot()?.plays?.slice(0, 5) ?? [],
      memes,
      crowd,
      liveCount: this.stream.getLiveCount(),
      weekKing,
      topReturn: top ? { ...top, displayName: label(top.userId) } : null,
      recentTrades,
      disclosures: this.disclosure.getFeed(8),
      etfs,
      shareholders,
      leaderboard: {
        weekLabel: leaderboard.weekLabel,
        totalParticipants:
          leaderboard.totalParticipants ?? leaderboard.rankings.length,
        rankings,
      },
      me,
      demoMode: this.offDayDemo.isActive(),
      demoMessage: this.offDayDemo.getLastMessage(),
    };
  }

  private async safeMarketBoard() {
    try {
      return await this.market.getMarketBoard(8);
    } catch (e) {
      this.logger.warn(`hub marketBoard fallback: ${e}`);
      return { updatedAt: new Date().toISOString(), gainers: [], losers: [], all: [] };
    }
  }

  private async safeInstrument(featuredId: string): Promise<InstrumentState> {
    try {
      return await this.market.getInstrument(featuredId);
    } catch (e) {
      this.logger.warn(`hub instrument fallback (${featuredId}): ${e}`);
      return this.market.getInstrument(LEE_JUNG_HOO_OPS_ID);
    }
  }

  private emptyLeaderboard(): LeaderboardResult {
    const weekKey = getWeekKey();
    return {
      weekKey,
      weekLabel: getWeekLabel(weekKey),
      updatedAt: new Date().toISOString(),
      totalParticipants: 0,
      opsKing: null,
      rankings: [],
    };
  }

  private async safeLeaderboard(): Promise<LeaderboardResult> {
    try {
      return await this.market.getLeaderboard(15);
    } catch (e) {
      this.logger.warn(`hub leaderboard fallback: ${e}`);
      return this.emptyLeaderboard();
    }
  }

  private async safeTrades() {
    try {
      return await this.market.getRecentTrades(8);
    } catch (e) {
      this.logger.warn(`hub trades fallback: ${e}`);
      return [];
    }
  }

  private async safeCrowd(instrumentId: string) {
    try {
      return await this.market.getCrowdRatio(instrumentId);
    } catch (e) {
      this.logger.warn(`hub crowd fallback: ${e}`);
      return {
        longShares: 0,
        shortShares: 0,
        longPct: 50,
        shortPct: 50,
        participants: 0,
      };
    }
  }

  private async safeMemeLineup(): Promise<InstrumentState[]> {
    try {
      return await this.market.getMemeLineup();
    } catch (e) {
      this.logger.warn(`hub meme lineup fallback: ${e}`);
      return [];
    }
  }

  private async safeEtfs() {
    try {
      return await this.market.getEtfBaskets();
    } catch (e) {
      this.logger.warn(`hub etfs fallback: ${e}`);
      return [];
    }
  }

  private async safeShareholderBoard(userId?: string) {
    try {
      return await this.shareholders.getBoard(userId);
    } catch (e) {
      this.logger.warn(`hub shareholders fallback: ${e}`);
      return { teams: buildSkeletonShareholderTeams(), myTitles: [] };
    }
  }
}
