import { Injectable } from '@nestjs/common';
import { LEE_JUNG_HOO_OPS_ID } from '../market/market-lineup';

export interface TodayGame {
  id: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  inning: string;
  status: 'live' | 'scheduled' | 'final';
  linkedInstrumentId: string;
}

/** 팀명 → 대표 종목 (오늘의 경기 연동용) */
const TEAM_INSTRUMENT: Record<string, string> = {
  키움: 'kiwoom-joo',
  KIA: 'kia-kim',
  LG: 'lg-park',
  KT: 'kt-choi',
  SSG: 'ssg-choi',
  NC: 'nc-lee',
  두산: 'ds-yang',
  삼성: 'ss-koo',
  롯데: 'lt-na',
  한화: 'hh-ryu',
};

@Injectable()
export class GamesService {
  /** MVP: 고정 mock — 이후 KBO 스코어 API/스크래퍼로 교체 */
  getTodayFeatured(): TodayGame {
    const homeTeam = 'KIA';
    return {
      id: 'featured-today',
      awayTeam: '한화',
      homeTeam,
      awayScore: 3,
      homeScore: 2,
      inning: '▲5',
      status: 'live',
      linkedInstrumentId:
        TEAM_INSTRUMENT[homeTeam] ?? LEE_JUNG_HOO_OPS_ID,
    };
  }

  resolveInstrumentForTeam(teamShort: string): string {
    return TEAM_INSTRUMENT[teamShort] ?? LEE_JUNG_HOO_OPS_ID;
  }
}
