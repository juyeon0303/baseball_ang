import { Injectable, Logger } from '@nestjs/common';
import { KboRecordProvider } from '../stats/kbo-record.provider';
import { KboRosterProvider, KBO_TEAMS } from '../stats/kbo-roster.provider';
import { NaverKboRecordProvider } from '../stats/naver-kbo-record.provider';
import { StatizRecordProvider } from '../stats/statiz-record.provider';
import { KBO_TEAM_STOCKS } from '../market/market-lineup';
import { TodayGame } from './games.types';
import { GamesRecapService } from './games-recap.service';
import { GamesService } from './games.service';
import { KboPlayerLookupProvider } from './kbo-player-lookup.provider';
import {
  GamePlayerStatsSnapshot,
  HitterSeasonStats,
  PitcherSeasonStats,
  PlayerCatalogEntry,
  PlayerFullStatBundle,
  PlayerRosterBoard,
  PlayerRosterQuery,
  PlayerSeasonStatsBoard,
  PlayerStatRow,
  StatMetricGroup,
} from './player-stats.types';

@Injectable()
export class PlayerStatsService {
  private readonly logger = new Logger(PlayerStatsService.name);
  private readonly statCache = new Map<
    number,
    { row: PlayerStatRow; at: number }
  >();
  private readonly fullCache = new Map<
    number,
    { bundle: PlayerFullStatBundle; at: number }
  >();
  private readonly statTtlMs = 6 * 60 * 60 * 1000;
  private readonly season = parseInt(process.env.KBO_STATS_SEASON ?? '2026', 10);

  constructor(
    private readonly games: GamesService,
    private readonly recap: GamesRecapService,
    private readonly lookup: KboPlayerLookupProvider,
    private readonly kbo: KboRecordProvider,
    private readonly roster: KboRosterProvider,
    private readonly statiz: StatizRecordProvider,
    private readonly naver: NaverKboRecordProvider,
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

  async getRoster(query: PlayerRosterQuery = {}): Promise<PlayerRosterBoard> {
    void this.roster.ensureRoster(false).catch((e) =>
      this.logger.warn(`로스터 백그라운드 동기화: ${e}`),
    );
    const team = query.team?.trim();
    const role = query.role ?? 'all';
    const limit = query.limit ?? 120;
    let rows = this.roster.search(query.q ?? '', { team, role, limit });
    if (!rows.length) {
      const catalog = this.getPlayerCatalog();
      const q = (query.q ?? '').trim();
      rows = catalog
        .filter((p) => {
          if (team && team !== 'all' && p.teamShort !== team) return false;
          if (role !== 'all' && p.roleHint !== role) return false;
          if (q && !p.name.includes(q)) return false;
          return true;
        })
        .slice(0, limit)
        .map((p) => ({
          kboPlayerId: p.kboPlayerId ?? 0,
          name: p.name,
          team: p.teamShort,
          role: (p.roleHint ?? 'hitter') as 'hitter' | 'pitcher',
          position: p.position,
          backNo: p.backNo,
        }));
    }
    const total = this.roster.getAll().length || this.getPlayerCatalog().length;
    return {
      updatedAt: this.roster.getRosterUpdatedAt() || new Date().toISOString(),
      season: this.season,
      total,
      players: rows.map((r) => this.toCatalogEntry(r)),
    };
  }

  getPlayerCatalog(): PlayerCatalogEntry[] {
    const fromRoster = this.roster.getAll().map((r) => this.toCatalogEntry(r));
    if (fromRoster.length) return fromRoster;
    return KBO_TEAM_STOCKS.map((seed) => ({
      name: seed.playerName,
      teamShort: seed.teamShort,
      teamName: seed.teamName,
      kboPlayerId: seed.kboPlayerId,
      accent: seed.accent,
      roleHint: seed.metric === 'era' ? 'pitcher' : 'hitter',
    }));
  }

  async refreshRoster(force = true): Promise<PlayerRosterBoard> {
    await this.roster.ensureRoster(force, true);
    return this.getRoster({ limit: 200 });
  }

  async getPlayerStatsByName(name: string): Promise<PlayerStatRow | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    return this.resolvePlayerStats(trimmed);
  }

  async getFullPlayerStats(
    opts: { playerId?: number; name?: string },
  ): Promise<PlayerFullStatBundle | null> {
    const resolved = await this.resolveIdentity(opts);
    if (!resolved) return null;

    const cached = this.fullCache.get(resolved.kboPlayerId);
    if (cached && Date.now() - cached.at < this.statTtlMs) {
      return cached.bundle;
    }

    let kboProfile = await this.kbo.fetchFullPlayerProfile(
      resolved.kboPlayerId,
      resolved.role,
    );
    if (!kboProfile) {
      const alt = resolved.role === 'hitter' ? 'pitcher' : 'hitter';
      kboProfile = await this.kbo.fetchFullPlayerProfile(
        resolved.kboPlayerId,
        alt,
      );
      if (kboProfile) resolved.role = kboProfile.role;
    }
    const statizGroup = this.statiz.getPlayerMetrics(resolved.name, resolved.role);
    const naverGroup = this.naver.getPlayerMetrics();
    const statizStatus = this.statiz.getStatus();
    const naverStatus = this.naver.getStatus();

    const groups: StatMetricGroup[] = [
      ...(kboProfile?.groups ?? []),
      ...(statizGroup ? [statizGroup] : []),
      ...(naverGroup ? [naverGroup] : []),
    ];

    const bundle: PlayerFullStatBundle = {
      player: {
        kboPlayerId: resolved.kboPlayerId,
        name: kboProfile?.name || resolved.name,
        team: kboProfile?.team ?? resolved.team,
        role: resolved.role,
        position: resolved.position ?? kboProfile?.position,
        backNo: resolved.backNo,
      },
      season: this.season,
      kbo: kboProfile,
      statiz: statizGroup,
      naver: naverGroup,
      groups,
      tables: kboProfile?.tables ?? [],
      sources: {
        kbo: Boolean(kboProfile),
        statiz: Boolean(statizGroup),
        naver: Boolean(naverGroup),
        statizNote: statizStatus.note,
        naverNote: naverStatus.note,
      },
      fetchedAt: new Date().toISOString(),
    };

    this.fullCache.set(resolved.kboPlayerId, { bundle, at: Date.now() });

    if (kboProfile?.summary) {
      const row = this.profileToStatRow(resolved, kboProfile);
      this.statCache.set(resolved.kboPlayerId, { row, at: Date.now() });
    }

    return bundle;
  }

  async getSeasonStatsBoard(): Promise<PlayerSeasonStatsBoard> {
    void this.roster.ensureRoster(false).catch(() => undefined);
    const catalog = this.getPlayerCatalog().slice(0, 80);
    const players: PlayerStatRow[] = [];
    for (const entry of catalog) {
      try {
        const row = await this.resolvePlayerStats(
          entry.name,
          entry.roleHint,
        );
        if (row) players.push(row);
      } catch (e) {
        this.logger.debug(`시즌 스탯 스킵 ${entry.name}: ${e}`);
      }
    }
    players.sort((a, b) => this.sortKey(b) - this.sortKey(a));
    return {
      updatedAt: new Date().toISOString(),
      players,
    };
  }

  getTeams(): string[] {
    return ['all', ...KBO_TEAMS];
  }

  private sortKey(row: PlayerStatRow): number {
    if (row.role === 'hitter') {
      return Number((row.stats as HitterSeasonStats).ops ?? 0);
    }
    const era = (row.stats as PitcherSeasonStats).era;
    return era != null ? 1000 - era : 0;
  }

  private toCatalogEntry(
    r: {
      kboPlayerId: number;
      name: string;
      team?: string;
      role: 'hitter' | 'pitcher';
      position?: string;
      backNo?: string;
    },
  ): PlayerCatalogEntry {
    const seed = KBO_TEAM_STOCKS.find((s) => s.kboPlayerId === r.kboPlayerId);
    return {
      name: r.name,
      teamShort: r.team ?? seed?.teamShort ?? '',
      teamName: seed?.teamName,
      kboPlayerId: r.kboPlayerId,
      accent: seed?.accent,
      roleHint: r.role,
      position: r.position,
      backNo: r.backNo,
    };
  }

  private profileToStatRow(
    resolved: {
      kboPlayerId: number;
      name: string;
      team?: string;
      role: 'hitter' | 'pitcher';
      position?: string;
      backNo?: string;
    },
    profile: NonNullable<Awaited<ReturnType<KboRecordProvider['fetchFullPlayerProfile']>>>,
  ): PlayerStatRow {
    return {
      name: profile.name || resolved.name,
      kboPlayerId: resolved.kboPlayerId,
      team: profile.team ?? resolved.team,
      role: profile.role,
      position: resolved.position,
      backNo: resolved.backNo,
      stats: profile.summary ?? {},
      source: 'kbo_official',
      fetchedAt: profile.fetchedAt,
    };
  }

  private async resolveIdentity(opts: {
    playerId?: number;
    name?: string;
  }): Promise<{
    kboPlayerId: number;
    name: string;
    team?: string;
    role: 'hitter' | 'pitcher';
    position?: string;
    backNo?: string;
  } | null> {
    if (opts.playerId) {
      void this.roster.ensureRoster(false).catch(() => undefined);
      const hit = this.roster.findById(opts.playerId);
      if (hit) {
        return {
          kboPlayerId: hit.kboPlayerId,
          name: hit.name,
          team: hit.team,
          role: hit.role,
          position: hit.position,
          backNo: hit.backNo,
        };
      }
      return {
        kboPlayerId: opts.playerId,
        name: opts.name?.trim() || `#${opts.playerId}`,
        role: 'hitter',
      };
    }
    const name = opts.name?.trim();
    if (!name) return null;
    void this.roster.ensureRoster(false).catch(() => undefined);
    const local = this.roster.findByName(name);
    if (local) {
      return {
        kboPlayerId: local.kboPlayerId,
        name: local.name,
        team: local.team,
        role: local.role,
        position: local.position,
        backNo: local.backNo,
      };
    }
    const remote = await this.roster.lookupRemote(name);
    if (remote) {
      return {
        kboPlayerId: remote.kboPlayerId,
        name: remote.name,
        team: remote.team,
        role: remote.role,
        position: remote.position,
        backNo: remote.backNo,
      };
    }
    const lookup = await this.lookup.resolve(name);
    if (!lookup) return null;
    return {
      kboPlayerId: lookup.kboPlayerId,
      name: lookup.name,
      team: lookup.team,
      role: lookup.role,
      position: lookup.position,
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
    const identity = await this.resolveIdentity({ name });
    if (!identity) return null;

    const cached = this.statCache.get(identity.kboPlayerId);
    if (cached && Date.now() - cached.at < this.statTtlMs) {
      return cached.row;
    }

    const role = roleHint ?? identity.role;
    const profile = await this.kbo.fetchFullPlayerProfile(
      identity.kboPlayerId,
      role === 'pitcher' ? 'pitcher' : 'hitter',
    );
    if (!profile?.summary && role === 'hitter' && identity.role === 'pitcher') {
      const asPitcher = await this.kbo.fetchFullPlayerProfile(
        identity.kboPlayerId,
        'pitcher',
      );
      if (asPitcher?.summary) {
        const row = this.profileToStatRow(identity, asPitcher);
        this.statCache.set(identity.kboPlayerId, { row, at: Date.now() });
        return row;
      }
    }
    if (!profile?.summary) return null;

    const row = this.profileToStatRow(identity, profile);
    this.statCache.set(identity.kboPlayerId, { row, at: Date.now() });
    return row;
  }
}
