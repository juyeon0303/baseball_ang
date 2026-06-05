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
    season?: number,
  ): Promise<MlbPlayerStatRow | null> {
    const years = this.seasonCandidates(season);
    for (const year of years) {
      const row = await this.fetchSeasonOpsForYear(mlbPlayerId, year);
      if (row) return row;
    }
    this.logger.warn(`MLB OPS 없음 player=${mlbPlayerId} years=${years.join(',')}`);
    return null;
  }

  /** 시즌 미개시·오프시즌 — 당해 → 전년 순으로 시도 */
  private seasonCandidates(explicit?: number): number[] {
    const now = new Date();
    const y = now.getFullYear();
    if (explicit != null) return [explicit];
    const month = now.getMonth() + 1;
    if (month <= 3) return [y, y - 1];
    if (month >= 11) return [y, y - 1];
    return [y];
  }

  private async fetchSeasonOpsForYear(
    mlbPlayerId: number,
    season: number,
  ): Promise<MlbPlayerStatRow | null> {
    const url = `https://statsapi.mlb.com/api/v1/people/${mlbPlayerId}/stats?stats=season&group=hitting&season=${season}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': MLB_UA },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      this.logger.warn(`MLB API ${res.status} player=${mlbPlayerId} season=${season}`);
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
