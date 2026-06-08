import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  dateKeyOffset,
  formatDateLabel,
  isKboGameDay,
  todayKey,
} from '../stats/game-day.util';
import { RecapSnapshot, TodayGame } from './games.types';
import { KboScoreProvider } from './kbo-score.provider';
import { GamesService } from './games.service';

@Injectable()
export class GamesRecapService {
  private readonly logger = new Logger(GamesRecapService.name);
  private cache: RecapSnapshot | null = null;
  private cacheAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly kbo: KboScoreProvider,
    private readonly games: GamesService,
  ) {}

  async getRecap(force = false): Promise<RecapSnapshot | null> {
    const ttl = Number(this.config.get('RECAP_CACHE_MS') ?? 3_600_000);
    if (!force && this.cache && Date.now() - this.cacheAt < ttl) {
      return this.cache;
    }

    const tz = this.config.get('GAMES_TZ') ?? 'Asia/Seoul';
    const today = todayKey(tz);

    for (let i = 1; i <= 12; i++) {
      const date = dateKeyOffset(-i, tz);
      if (date === today) continue;
      try {
        const rawGames = await this.kbo.fetchTodayGames(date);
        const games = rawGames
          .map((raw) =>
            this.kbo.mapRawGame(raw, (team) =>
              this.games.resolveInstrumentForTeam(team),
            ),
          )
          .filter((g) => g.status === 'final')
          .sort((a, b) => b.homeScore + b.awayScore - (a.homeScore + a.awayScore));

        if (!games.length) continue;

        const highlightId = this.pickHighlight(games)?.id ?? games[0].id;
        const recap: RecapSnapshot = {
          date,
          dateLabel: formatDateLabel(date, tz),
          updatedAt: new Date().toISOString(),
          games,
          highlightId,
          totalRuns: games.reduce(
            (s, g) => s + g.awayScore + g.homeScore,
            0,
          ),
        };
        this.cache = recap;
        this.cacheAt = Date.now();
        this.logger.debug(
          `리캡 ${date} · 종료 ${games.length}경기 · ${recap.totalRuns}득점`,
        );
        return recap;
      } catch (e) {
        this.logger.debug(`리캡 ${date} 스킵: ${e}`);
      }
    }
    return null;
  }

  /** 오늘 라이브가 없을 때 리캡을 보여줄지 */
  shouldShowRecap(): boolean {
    const tz = this.config.get('GAMES_TZ') ?? 'Asia/Seoul';
    const games = this.games.getTodayGames();
    const hasLive = games.some((g) => g.status === 'live');
    if (hasLive) return false;
    if (!isKboGameDay(tz)) return true;
    const hasScheduled = games.some((g) => g.status === 'scheduled');
    const hasFinalToday = games.some((g) => g.status === 'final');
    if (!games.length) return true;
    if (!hasScheduled && !hasLive) return true;
    if (hasScheduled && !hasLive && !hasFinalToday) return true;
    return false;
  }

  private pickHighlight(games: TodayGame[]): TodayGame | null {
    if (!games.length) return null;
    let best = games[0];
    let bestScore = -1;
    for (const g of games) {
      const margin = Math.abs(g.homeScore - g.awayScore);
      const runs = g.homeScore + g.awayScore;
      const closeness = margin <= 1 ? 3 : margin <= 3 ? 2 : 1;
      const score = runs * closeness;
      if (score > bestScore) {
        bestScore = score;
        best = g;
      }
    }
    return best;
  }
}
