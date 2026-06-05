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
    const featuredId = LEE_JUNG_HOO_OPS_ID;
    const [instrument, game, leaderboard, trades, crowd] = await Promise.all([
      this.market.getMarket(featuredId),
      Promise.resolve(this.games.getTodayFeatured()),
      this.market.getLeaderboard(5),
      this.market.getRecentTrades(3),
      this.market.getCrowdRatio(featuredId),
    ]);

    const top = leaderboard.rankings[0] ?? null;
    let me: {
      rank: number | null;
      weeklyReturnPct: number;
      points: number;
      equity: number;
    } | null = null;

    if (userId) {
      const port = await this.market.getPortfolio(userId, featuredId);
      me = {
        rank: port.myRank,
        weeklyReturnPct: port.weeklyReturnPct,
        points: port.wallet.points,
        equity: port.equity,
      };
    }

    return {
      featuredId,
      instrument,
      game,
      crowd,
      liveCount: this.stream.getLiveCount(),
      weekKing: leaderboard.opsKing ?? top,
      topReturn: top,
      recentTrades: trades,
      me,
    };
  }
}
