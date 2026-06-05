import { Controller, Get, Post, Query } from '@nestjs/common';
import { GamesSyncService } from './games-sync.service';
import { GamesService } from './games.service';

@Controller('amm/games')
export class GamesController {
  constructor(
    private readonly games: GamesService,
    private readonly sync: GamesSyncService,
  ) {}

  @Get('today')
  getToday() {
    const snapshot = this.games.getSnapshot();
    return {
      enabled: this.sync.isEnabled(),
      snapshot,
      featured: this.games.getTodayFeatured(),
      plays: this.sync.getRecentPlays(20),
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
}
