import { Body, Controller, Get, Param, Post, Query, BadRequestException } from '@nestjs/common';
import { isKboGameDay } from '../stats/game-day.util';
import { GamesRecapService } from './games-recap.service';
import { GamesSyncService } from './games-sync.service';
import { GameLiveService } from './game-live.service';
import { GamesService } from './games.service';
import { RelaySyncService } from './relay-sync.service';
import { KboStandingsProvider } from './kbo-standings.provider';
import { PlayerStatsService } from './player-stats.service';
import { SentimentVoteKind } from './game-live.types';

@Controller('amm/games')
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly sync: GamesSyncService,
    private readonly live: GameLiveService,
    private readonly recap: GamesRecapService,
    private readonly relay: RelaySyncService,
    private readonly standings: KboStandingsProvider,
    private readonly playerStats: PlayerStatsService,
  ) {}

  @Get('today')
  async getToday() {
    const snapshot = this.games.getSnapshot();
    const showRecap = this.recap.shouldShowRecap();
    const recapData = showRecap ? await this.recap.getRecap() : null;
    return {
      enabled: this.sync.isEnabled(),
      snapshot,
      featured: this.games.getTodayFeatured(),
      plays: this.sync.getRecentPlays(20),
      recap: recapData,
      showRecap,
      isGameDay: isKboGameDay('Asia/Seoul'),
    };
  }

  @Get('recap')
  async getRecap(@Query('force') force?: string) {
    const data = await this.recap.getRecap(force === '1' || force === 'true');
    return {
      showRecap: this.recap.shouldShowRecap(),
      recap: data,
    };
  }

  @Get('plays')
  getPlays(@Query('limit') limit?: string) {
    const n = Math.min(40, Math.max(1, parseInt(limit ?? '15', 10) || 15));
    return { plays: this.sync.getRecentPlays(n) };
  }

  @Post('refresh')
  async refreshNow() {
    const snapshot = await this.sync.refresh('manual');
    return {
      success: true,
      snapshot,
      featured: this.games.getTodayFeatured(),
    };
  }

  @Get('standings')
  async getStandings(@Query('force') force?: string) {
    try {
      const data = await this.standings.getStandings(
        force === '1' || force === 'true',
      );
      return { success: true, ...data };
    } catch (e) {
      throw new BadRequestException('팀 순위를 불러올 수 없습니다.');
    }
  }

  @Get('players/catalog')
  getPlayerCatalog() {
    void this.playerStats.getRoster({ limit: 1 }).catch(() => undefined);
    return {
      updatedAt: new Date().toISOString(),
      players: this.playerStats.getPlayerCatalog(),
    };
  }

  @Get('players/roster')
  async getPlayerRoster(
    @Query('q') q?: string,
    @Query('team') team?: string,
    @Query('role') role?: 'hitter' | 'pitcher' | 'all',
    @Query('limit') limit?: string,
  ) {
    try {
      const n = Math.min(200, Math.max(1, parseInt(limit ?? '80', 10) || 80));
      return await this.playerStats.getRoster({ q, team, role, limit: n });
    } catch (e) {
      throw new BadRequestException('선수 목록을 불러올 수 없습니다.');
    }
  }

  @Post('players/roster/refresh')
  async refreshPlayerRoster() {
    try {
      return await this.playerStats.refreshRoster(true);
    } catch (e) {
      throw new BadRequestException('선수 목록 갱신에 실패했습니다.');
    }
  }

  @Get('players/full')
  async getFullPlayerStats(
    @Query('name') name?: string,
    @Query('playerId') playerId?: string,
  ) {
    const id = playerId ? parseInt(playerId, 10) : undefined;
    const trimmed = name?.trim();
    if (!id && !trimmed) {
      throw new BadRequestException('name 또는 playerId가 필요합니다.');
    }
    try {
      const bundle = await this.playerStats.getFullPlayerStats({
        playerId: id,
        name: trimmed,
      });
      if (!bundle) {
        throw new BadRequestException('선수 스탯을 찾을 수 없습니다.');
      }
      return bundle;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('선수 상세 스탯을 불러올 수 없습니다.');
    }
  }

  @Get('players/teams')
  getPlayerTeams() {
    return { teams: this.playerStats.getTeams() };
  }

  @Get('players/season')
  async getPlayerSeasonBoard() {
    try {
      return await this.playerStats.getSeasonStatsBoard();
    } catch (e) {
      throw new BadRequestException('선수 시즌 스탯을 불러올 수 없습니다.');
    }
  }

  @Get('players/stats')
  async getPlayerStatsByName(@Query('name') name?: string) {
    const trimmed = name?.trim();
    if (!trimmed) {
      throw new BadRequestException('선수 이름이 필요합니다.');
    }
    try {
      const row = await this.playerStats.getPlayerStatsByName(trimmed);
      if (!row) {
        throw new BadRequestException('선수 스탯을 찾을 수 없습니다.');
      }
      return row;
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException('선수 스탯을 불러올 수 없습니다.');
    }
  }

  @Get(':gameId/player-stats')
  async getPlayerStats(@Param('gameId') gameId: string) {
    try {
      return await this.playerStats.getGamePlayerStats(gameId);
    } catch (e) {
      throw new BadRequestException('선수 스탯을 불러올 수 없습니다.');
    }
  }

  @Get(':gameId/relay')
  async getRelay(@Param('gameId') gameId: string) {
    const bundle = await this.relay.getGameRelay(gameId);
    if (!bundle) {
      throw new BadRequestException('문자중계를 불러올 수 없습니다.');
    }
    return bundle;
  }

  @Get(':gameId/wpa')
  getWpa(@Param('gameId') gameId: string) {
    return { gameId, timeline: this.live.getWpaTimeline(gameId) };
  }

  @Get(':gameId/sentiment')
  getSentiment(
    @Param('gameId') gameId: string,
    @Query('userId') userId?: string,
  ) {
    return this.live.getSentiment(gameId, userId);
  }

  @Post(':gameId/sentiment')
  postSentiment(
    @Param('gameId') gameId: string,
    @Body() body: { userId?: string; vote?: SentimentVoteKind },
  ) {
    if (!body.vote) {
      throw new BadRequestException('투표 종류가 필요합니다.');
    }
    return this.live.voteSentiment(
      gameId,
      body.userId ?? 'guest',
      body.vote,
    );
  }

  @Get(':gameId/ratings')
  getRatings(@Param('gameId') gameId: string) {
    return { gameId, ratings: this.live.getFanRatings(gameId) };
  }

  @Post(':gameId/ratings')
  postRating(
    @Param('gameId') gameId: string,
    @Body()
    body: { userId?: string; playerName?: string; rating?: number },
  ) {
    const row = this.live.ratePlayer(
      gameId,
      body.userId ?? 'guest',
      body.playerName ?? '',
      body.rating ?? 5,
    );
    return { success: true, rating: row };
  }

  @Get(':gameId/wpa-notes')
  getWpaNotes(
    @Param('gameId') gameId: string,
    @Query('playId') playId?: string,
  ) {
    return {
      notes: playId ? this.live.getWpaNotes(gameId, playId) : [],
    };
  }

  @Post(':gameId/wpa-notes')
  postWpaNote(
    @Param('gameId') gameId: string,
    @Body() body: { userId?: string; playId?: string; text?: string },
  ) {
    const note = this.live.addWpaNote(
      gameId,
      body.playId ?? '',
      body.userId ?? 'guest',
      body.text ?? '',
    );
    return { success: true, note };
  }

  @Get(':gameId/pick')
  getWinPick(
    @Param('gameId') gameId: string,
    @Query('userId') userId?: string,
  ) {
    return this.live.getWinPick(gameId, userId);
  }

  @Post(':gameId/pick')
  postWinPick(
    @Param('gameId') gameId: string,
    @Body() body: { userId?: string; side?: 'away' | 'home' },
  ) {
    if (!body.side) {
      throw new BadRequestException('side(away|home)가 필요합니다.');
    }
    return this.live.pickWinner(gameId, body.userId ?? 'guest', body.side);
  }
}
