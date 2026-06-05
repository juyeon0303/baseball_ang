import { Injectable, Logger } from '@nestjs/common';

const MLB_UA = 'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +mlb-oracle-sync)';

export interface MlbPlayerStatRow {
  playerName: string;
  team?: string;
  ops: number;
  avg?: string;
  source: 'mlb_statsapi';
  fetchedAt: string;
}

@Injectable()
export class MlbRecordProvider {
  private readonly logger = new Logger(MlbRecordProvider.name);

  async fetchSeasonOps(
    mlbPlayerId: number,
    season = new Date().getFullYear(),
  ): Promise<MlbPlayerStatRow | null> {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}/stats?stats=season&group=hitting&season=${season}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': MLB_UA },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      this.logger.warn(`MLB API ${res.status} player=${mlbPlayerId}`);
      return null;
    }
    const data = (await res.json()) as {
      stats?: Array<{
        splits?: Array<{ stat?: { ops?: string; avg?: string } }>;
      }>;
    };
    const stat = data.stats?.[0]?.splits?.[0]?.stat;
    const opsRaw = stat?.ops;
    if (!opsRaw) return null;
    const ops = parseFloat(opsRaw);
    if (!Number.isFinite(ops)) return null;

    const profile = await this.fetchProfile(mlbPlayerId);

    return {
      playerName: profile?.fullName ?? '이정후',
      team: profile?.team,
      ops,
      avg: stat.avg,
      source: 'mlb_statsapi',
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchProfile(
    mlbPlayerId: number,
  ): Promise<{ fullName?: string; team?: string } | null> {
    try {
      const res = await fetch(
        `https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}`,
        {
          headers: { 'User-Agent': MLB_UA },
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as {
        people?: Array<{
          fullName?: string;
          currentTeam?: { name?: string };
        }>;
      };
      const p = data.people?.[0];
      return {
        fullName: p?.fullName,
        team: p?.currentTeam?.name,
      };
    } catch {
      return null;
    }
  }
}
