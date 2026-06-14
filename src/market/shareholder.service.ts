import { Inject, Injectable, Logger } from '@nestjs/common';
import { KBO_TEAM_STOCKS } from './market-lineup';
import { MARKET_STORE } from './market-store.interface';
import type { IMarketStore } from './market-store.interface';

export interface TeamHolderRow {
  userId: string;
  equity: number;
  stakePct: number;
  longShares: number;
  role: 'owner' | 'major' | 'holder';
}

export interface TeamShareholderBoard {
  teamShort: string;
  teamName: string;
  instrumentId: string;
  playerName: string;
  totalStake: number;
  holderCount: number;
  owner: TeamHolderRow | null;
  topHolders: TeamHolderRow[];
}

const OWNER_MIN_PCT = 5;
const MAJOR_MIN_PCT = 1;

export function buildSkeletonShareholderTeams(): TeamShareholderBoard[] {
  return KBO_TEAM_STOCKS.map((seed) => ({
    teamShort: seed.teamShort,
    teamName: seed.teamName,
    instrumentId: seed.id,
    playerName: seed.playerName,
    totalStake: 0,
    holderCount: 0,
    owner: null,
    topHolders: [],
  }));
}

@Injectable()
export class ShareholderService {
  private readonly logger = new Logger(ShareholderService.name);

  constructor(
    @Inject(MARKET_STORE) private readonly store: IMarketStore,
  ) {}

  async getBoard(userId?: string): Promise<{
    teams: TeamShareholderBoard[];
    myTitles: Array<{ teamShort: string; stakePct: number; role: 'owner' | 'major' }>;
  }> {
    try {
      return await this.buildBoard(userId);
    } catch (e) {
      this.logger.warn(`구단주 보드 실패 — 스켈레톤 반환: ${e}`);
      return { teams: buildSkeletonShareholderTeams(), myTitles: [] };
    }
  }

  private async buildBoard(userId?: string): Promise<{
    teams: TeamShareholderBoard[];
    myTitles: Array<{ teamShort: string; stakePct: number; role: 'owner' | 'major' }>;
  }> {
    const rawIds = await Promise.resolve(this.store.getAllUserIds());
    const userIds = rawIds.filter(
      (id): id is string => typeof id === 'string' && id.length > 0,
    );

    const priceByInstrument = new Map<string, number>();
    for (const seed of KBO_TEAM_STOCKS) {
      try {
        const inst = await Promise.resolve(this.store.getInstrument(seed.id));
        priceByInstrument.set(seed.id, inst.price);
      } catch {
        priceByInstrument.set(seed.id, 0);
      }
    }

    const longStakeByUserInstrument = new Map<
      string,
      { equity: number; shares: number }
    >();

    for (const uid of userIds) {
      let wallet;
      try {
        wallet = await Promise.resolve(this.store.getWallet(uid));
      } catch (e) {
        this.logger.debug(`지갑 스킵 ${uid}: ${e}`);
        continue;
      }
      for (const seed of KBO_TEAM_STOCKS) {
        const price = priceByInstrument.get(seed.id) ?? 0;
        if (price <= 0) continue;
        const pos = wallet.positions[seed.id] ?? {
          longShares: 0,
          shortShares: 0,
        };
        if (pos.longShares <= 0) continue;
        const equity = pos.longShares * price;
        if (equity <= 0) continue;
        longStakeByUserInstrument.set(`${uid}:${seed.id}`, {
          equity,
          shares: pos.longShares,
        });
      }
    }

    const teams: TeamShareholderBoard[] = [];
    const myTitles: Array<{
      teamShort: string;
      stakePct: number;
      role: 'owner' | 'major';
    }> = [];

    for (const seed of KBO_TEAM_STOCKS) {
      const holders: TeamHolderRow[] = [];
      let totalStake = 0;
      for (const uid of userIds) {
        const row = longStakeByUserInstrument.get(`${uid}:${seed.id}`);
        if (!row) continue;
        totalStake += row.equity;
        holders.push({
          userId: uid,
          equity: Math.round(row.equity),
          stakePct: 0,
          longShares: row.shares,
          role: 'holder',
        });
      }
      holders.sort((a, b) => b.equity - a.equity);
      for (const h of holders) {
        h.stakePct =
          totalStake > 0
            ? Math.round((h.equity / totalStake) * 1000) / 10
            : 0;
      }
      holders.forEach((h, idx) => {
        if (idx === 0 && h.stakePct >= OWNER_MIN_PCT) h.role = 'owner';
        else if (idx > 0 && idx < 3 && h.stakePct >= MAJOR_MIN_PCT) {
          h.role = 'major';
        }
      });

      const owner =
        holders.find((h) => h.role === 'owner') ?? holders[0] ?? null;
      if (userId) {
        const mine = holders.find((h) => h.userId === userId);
        if (mine?.role === 'owner') {
          myTitles.push({
            teamShort: seed.teamShort,
            stakePct: mine.stakePct,
            role: 'owner',
          });
        } else if (mine?.role === 'major') {
          myTitles.push({
            teamShort: seed.teamShort,
            stakePct: mine.stakePct,
            role: 'major',
          });
        }
      }

      teams.push({
        teamShort: seed.teamShort,
        teamName: seed.teamName,
        instrumentId: seed.id,
        playerName: seed.playerName,
        totalStake: Math.round(totalStake),
        holderCount: holders.length,
        owner,
        topHolders: holders.slice(0, 3),
      });
    }

    teams.sort((a, b) => b.totalStake - a.totalStake);
    return { teams, myTitles };
  }
}
