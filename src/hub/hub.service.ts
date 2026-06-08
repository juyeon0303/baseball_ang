import { Injectable } from '@nestjs/common';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { GamesService } from '../games/games.service';
import { LEE_JUNG_HOO_OPS_ID } from '../market/market-lineup';
import { MarketService } from '../market/market.service';

@Injectable()
export class HubService {
  constructor(
    private readonly market: MarketService,
    private readonly games: GamesService,
    private readonly stream: StockStreamGateway,
  ) {}

  async getHub(userId?: string) {
    const game = this.games.getTodayFeatured();
    const featuredId =
      game.status === 'live' && game.linkedInstrumentId
        ? game.linkedInstrumentId
        : LEE_JUNG_HOO_OPS_ID;
    const [instrument, leaderboard, trades, crowd, memes] = await Promise.all([
      this.market.getMarket(featuredId),
      this.market.getLeaderboard(15),
      this.market.getRecentTrades(8),
      this.market.getCrowdRatio(featuredId),
      this.market.getMemeLineup(),
    ]);

    const top = leaderboard.rankings[0] ?? null;
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
      };
    }

    return {
      featuredId,
      instrument,
      game,
      plays: this.games.getSnapshot()?.plays?.slice(0, 5) ?? [],
      memes,
      crowd,
      liveCount: this.stream.getLiveCount(),
      weekKing: leaderboard.opsKing ?? top,
      topReturn: top,
      recentTrades: trades,
      leaderboard: {
        weekLabel: leaderboard.weekLabel,
        totalParticipants: leaderboard.totalParticipants ?? leaderboard.rankings.length,
        rankings: leaderboard.rankings,
      },
      me,
    };
  }
}
