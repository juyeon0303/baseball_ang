import { Injectable } from '@nestjs/common';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { GamesService } from '../games/games.service';
import { isKboGameDay } from '../stats/game-day.util';
import { DisclosureService } from '../market/disclosure.service';
import { LEE_JUNG_HOO_OPS_ID } from '../market/market-lineup';
import { getMarketSession } from '../market/market-session.util';
import { MarketService } from '../market/market.service';
import { ShareholderService } from '../market/shareholder.service';
import { OffDayDemoService } from '../market/off-day-demo.service';

@Injectable()
export class HubService {
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

    const [instrument, leaderboard, trades, crowd, memes, etfs, shareholderBoard] =
      await Promise.all([
        this.market.getMarket(featuredId),
        this.market.getLeaderboard(15),
        this.market.getRecentTrades(8),
        this.market.getCrowdRatio(featuredId),
        this.market.getMemeLineup(),
        this.market.getEtfBaskets(),
        this.shareholders.getBoard(userId),
      ]);

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
    const shareholders = shareholderBoard.teams.slice(0, 6).map((team) => ({
      ...team,
      owner: team.owner
        ? { ...team.owner, displayName: label(team.owner.userId) }
        : null,
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
      isOpsKing: boolean;
      teamTitles: Array<{ teamShort: string; stakePct: number }>;
    } | null = null;

    if (userId) {
      const port = await this.market.getPortfolio(userId, featuredId);
      me = {
        rank: port.myRank,
        weeklyReturnPct: port.weeklyReturnPct,
        points: port.wallet.points,
        equity: port.equity,
        startEquity: port.startEquity,
        weekLabel: port.weekLabel,
        totalParticipants: port.totalParticipants ?? leaderboard.totalParticipants ?? 0,
        holdingsCount: port.holdings.length,
        isOpsKing: port.isOpsKing,
        teamTitles: shareholderBoard.myTitles,
      };
    }

    return {
      featuredId,
      instrument,
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
        totalParticipants: leaderboard.totalParticipants ?? leaderboard.rankings.length,
        rankings,
      },
      me,
      demoMode: this.offDayDemo.isActive(),
      demoMessage: this.offDayDemo.getLastMessage(),
    };
  }
}
