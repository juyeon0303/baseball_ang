import { Inject, Injectable } from '@nestjs/common';
import { KBO_TEAM_STOCKS } from './market-lineup';
import { MARKET_STORE } from './market-store.interface';
import type { IMarketStore } from './market-store.interface';
import { MarketService } from './market.service';

export interface TeamHolderRow {
  userId: string;
  equity: number;
  stakePct: number;
}

export interface TeamShareholderBoard {
  teamShort: string;
  teamName: string;
  instrumentId: string;
  playerName: string;
  totalStake: number;
  owner: TeamHolderRow | null;
  topHolders: TeamHolderRow[];
}

@Injectable()
export class ShareholderService {
  constructor(
    @Inject(MARKET_STORE) private readonly store: IMarketStore,
    private readonly market: MarketService,
  ) {}

  async getBoard(userId?: string): Promise<{
    teams: TeamShareholderBoard[];
    myTitles: Array<{ teamShort: string; stakePct: number }>;
  }> {
    const userIds = await Promise.resolve(this.store.getAllUserIds());
    const equityByUserInstrument = new Map<string, number>();

    for (const uid of userIds) {
      const wallet = await Promise.resolve(this.store.getWallet(uid));
      for (const seed of KBO_TEAM_STOCKS) {
        try {
          const inst = await Promise.resolve(this.store.getInstrument(seed.id));
          const pos = wallet.positions[seed.id] ?? { longShares: 0, shortShares: 0 };
          const eq = pos.longShares * inst.price - pos.shortShares * inst.price;
          if (eq <= 0) continue;
          equityByUserInstrument.set(`${uid}:${seed.id}`, eq);
        } catch {
          continue;
        }
      }
    }

    const teams: TeamShareholderBoard[] = [];
    const myTitles: Array<{ teamShort: string; stakePct: number }> = [];

    for (const seed of KBO_TEAM_STOCKS) {
      const holders: TeamHolderRow[] = [];
      let totalStake = 0;
      for (const uid of userIds) {
        const eq = equityByUserInstrument.get(`${uid}:${seed.id}`) ?? 0;
        if (eq <= 0) continue;
        totalStake += eq;
        holders.push({ userId: uid, equity: eq, stakePct: 0 });
      }
      holders.sort((a, b) => b.equity - a.equity);
      for (const h of holders) {
        h.stakePct =
          totalStake > 0
            ? Math.round((h.equity / totalStake) * 1000) / 10
            : 0;
      }
      const owner = holders[0] ?? null;
      if (userId && owner?.userId === userId && owner.stakePct >= 5) {
        myTitles.push({ teamShort: seed.teamShort, stakePct: owner.stakePct });
      }
      teams.push({
        teamShort: seed.teamShort,
        teamName: seed.teamName,
        instrumentId: seed.id,
        playerName: seed.playerName,
        totalStake: Math.round(totalStake),
        owner,
        topHolders: holders.slice(0, 3),
      });
    }

    teams.sort((a, b) => b.totalStake - a.totalStake);
    return { teams, myTitles };
  }
}
