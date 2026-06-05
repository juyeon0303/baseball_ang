import { Injectable } from '@nestjs/common';
import { LEE_JUNG_HOO_OPS_ID } from '../market/market-lineup';
import { todayKey } from '../stats/game-day.util';
import { ScoreboardSnapshot, TodayGame } from './games.types';

/** 팀명 → 대표 종목 (경기 연동용) */
const TEAM_INSTRUMENT: Record<string, string> = {
  키움: 'kiwoom-joo',
  KIA: 'kia-kim',
  LG: 'lg-park',
  KT: 'kt-hill',
  SSG: 'ssg-choi',
  NC: 'nc-kim',
  두산: 'ds-yang',
  삼성: 'ss-koo',
  롯데: 'lt-na',
  한화: 'hh-kang',
};

@Injectable()
export class GamesService {
  private snapshot: ScoreboardSnapshot | null = null;

  setSnapshot(snapshot: ScoreboardSnapshot): void {
    this.snapshot = snapshot;
  }

  getSnapshot(): ScoreboardSnapshot | null {
    return this.snapshot;
  }

  getTodayGames(): TodayGame[] {
    return this.snapshot?.games ?? [];
  }

  getTodayFeatured(): TodayGame {
    const games = this.getTodayGames();
    const featuredId = this.snapshot?.featuredGameId;
    const featured =
      (featuredId ? games.find((g) => g.id === featuredId) : undefined) ??
      games.find((g) => g.status === 'live') ??
      games[0];
    return featured ?? this.mockFallback();
  }

  resolveInstrumentForTeam(teamShort: string): string {
    return TEAM_INSTRUMENT[teamShort] ?? LEE_JUNG_HOO_OPS_ID;
  }

  buildFallbackSnapshot(): ScoreboardSnapshot {
    const game = this.mockFallback();
    return {
      date: todayKey('Asia/Seoul'),
      updatedAt: new Date().toISOString(),
      source: 'kbo_gamecenter',
      featuredGameId: game.id,
      games: [game],
      plays: [],
    };
  }

  private mockFallback(): TodayGame {
    const homeTeam = 'KIA';
    return {
      id: 'fallback',
      awayTeam: '한화',
      homeTeam,
      awayScore: 0,
      homeScore: 0,
      inning: '일정 로딩중',
      status: 'scheduled',
      linkedInstrumentId:
        TEAM_INSTRUMENT[homeTeam] ?? LEE_JUNG_HOO_OPS_ID,
    };
  }
}
