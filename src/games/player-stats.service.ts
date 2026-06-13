import { Injectable, Logger } from '@nestjs/common';
import { KboRecordProvider } from '../stats/kbo-record.provider';
import { TodayGame } from './games.types';
import { GamesRecapService } from './games-recap.service';
import { GamesService } from './games.service';
import { KboPlayerLookupProvider } from './kbo-player-lookup.provider';
import {
  GamePlayerStatsSnapshot,
  PlayerStatRow,
} from './player-stats.types';

@Injectable()
export class PlayerStatsService {
  private readonly logger = new Logger(PlayerStatsService.name);
  private readonly statCache = new Map<
    number,
    { row: PlayerStatRow; at: number }
  >();
  private readonly statTtlMs = 6 * 60 * 60 * 1000;

  constructor(
    private readonly games: GamesService,
    private readonly recap: GamesRecapService,
    private readonly lookup: KboPlayerLookupProvider,
    private readonly kbo: KboRecordProvider,
  ) {}

  async getGamePlayerStats(gameId: string): Promise<GamePlayerStatsSnapshot> {
    const game = await this.findGame(gameId);
    const names = this.collectPlayerNames(game);
    const players: PlayerStatRow[] = [];

    for (const entry of names) {
      try {
        const row = await this.resolvePlayerStats(entry.name, entry.roleHint);
        if (row) players.push(row);
      } catch (e) {
        this.logger.debug(`스탯 스킵 ${entry.name}: ${e}`);
      }
    }

    return {
      gameId,
      updatedAt: new Date().toISOString(),
      players,
    };
  }

  private async findGame(gameId: string): Promise<TodayGame | null> {
    const live = this.games.getTodayGames().find((g) => g.id === gameId);
    if (live) return live;
    const recapData = await this.recap.getRecap();
    return recapData?.games.find((g) => g.id === gameId) ?? null;
  }

  private collectPlayerNames(
    game: TodayGame | null,
  ): { name: string; roleHint?: 'hitter' | 'pitcher' }[] {
    if (!game) return [];
    const out: { name: string; roleHint?: 'hitter' | 'pitcher' }[] = [];
    const push = (name?: string, roleHint?: 'hitter' | 'pitcher') => {
      const n = name?.trim();
      if (!n) return;
      if (out.some((x) => x.name === n)) return;
      out.push({ name: n, roleHint });
    };
    push(game.batter, 'hitter');
    push(game.pitcher, 'pitcher');
    push(game.awayPitcher, 'pitcher');
    push(game.homePitcher, 'pitcher');
    return out;
  }

  private async resolvePlayerStats(
    name: string,
    roleHint?: 'hitter' | 'pitcher',
  ): Promise<PlayerStatRow | null> {
    const lookup = await this.lookup.resolve(name);
    if (!lookup) return null;

    const cached = this.statCache.get(lookup.kboPlayerId);
    if (cached && Date.now() - cached.at < this.statTtlMs) {
      return cached.row;
    }

    const role = roleHint ?? lookup.role;
    if (role === 'pitcher') {
      return this.buildPitcherRow(lookup);
    }

    const hitterRow = await this.buildHitterRow(lookup);
    if (hitterRow) return hitterRow;
    if (lookup.role === 'pitcher') {
      return this.buildPitcherRow(lookup);
    }
    return null;
  }

  private async buildPitcherRow(
    lookup: Awaited<ReturnType<KboPlayerLookupProvider['resolve']>> & object,
  ): Promise<PlayerStatRow | null> {
    const cached = this.statCache.get(lookup.kboPlayerId);
    if (cached && Date.now() - cached.at < this.statTtlMs && cached.row.role === 'pitcher') {
      return cached.row;
    }
    const raw = await this.kbo.fetchPitcherSeasonStats(lookup.kboPlayerId);
    if (!raw) return null;
    const row: PlayerStatRow = {
      name: raw.playerName || lookup.name,
      kboPlayerId: lookup.kboPlayerId,
      team: raw.team ?? lookup.team,
      role: 'pitcher',
      position: lookup.position,
      stats: {
        era: raw.era,
        ip: raw.ip,
        w: raw.w,
        l: raw.l,
        so: raw.so,
        bb: raw.bb,
        whip: raw.whip,
      },
      source: 'kbo_official',
      fetchedAt: raw.fetchedAt,
    };
    this.statCache.set(lookup.kboPlayerId, { row, at: Date.now() });
    return row;
  }

  private async buildHitterRow(
    lookup: Awaited<ReturnType<KboPlayerLookupProvider['resolve']>> & object,
  ): Promise<PlayerStatRow | null> {
    const cached = this.statCache.get(lookup.kboPlayerId);
    if (cached && Date.now() - cached.at < this.statTtlMs && cached.row.role === 'hitter') {
      return cached.row;
    }
    const raw = await this.kbo.fetchHitterSeasonStats(lookup.kboPlayerId);
    if (!raw) return null;
    const row: PlayerStatRow = {
      name: raw.playerName || lookup.name,
      kboPlayerId: lookup.kboPlayerId,
      team: raw.team ?? lookup.team,
      role: 'hitter',
      position: lookup.position,
      stats: {
        avg: raw.avg,
        ops: raw.ops,
        hr: raw.hr,
        rbi: raw.rbi,
        sb: raw.sb,
        games: raw.games,
        ab: raw.ab,
        hits: raw.hits,
      },
      source: 'kbo_official',
      fetchedAt: raw.fetchedAt,
    };
    this.statCache.set(lookup.kboPlayerId, { row, at: Date.now() });
    return row;
  }
}
