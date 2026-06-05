import { Injectable, Logger } from '@nestjs/common';
import { todayKey } from '../stats/game-day.util';
import { GameStatus, TodayGame } from './games.types';

const KBO_UA =
  'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +kbo-scoreboard)';

/** KBO GameCenter 팀 약어 → 앱 팀명 */
const TEAM_CODE_TO_NAME: Record<string, string> = {
  WO: '키움',
  OB: '두산',
  HH: '한화',
  LT: '롯데',
  KT: 'KT',
  SK: 'SSG',
  NC: 'NC',
  SS: '삼성',
  HT: 'KIA',
  LG: 'LG',
};

export interface KboRawGame {
  G_ID: string;
  G_DT: string;
  G_TM?: string;
  S_NM?: string;
  AWAY_ID: string;
  HOME_ID: string;
  AWAY_NM: string;
  HOME_NM: string;
  T_SCORE_CN: string;
  B_SCORE_CN: string;
  GAME_STATE_SC: string;
  GAME_RESULT_CK: number;
  SCORE_CK: string;
  GAME_INN_NO?: number | null;
  GAME_TB_SC_NM?: string | null;
  T_P_NM?: string;
  B_P_NM?: string;
  T_PIT_P_NM?: string;
  B_PIT_P_NM?: string;
}

@Injectable()
export class KboScoreProvider {
  private readonly logger = new Logger(KboScoreProvider.name);

  async fetchTodayGames(
    dateKey = todayKey('Asia/Seoul'),
  ): Promise<KboRawGame[]> {
    const compact = dateKey.replace(/-/g, '');
    const data = await this.postJson<{ game?: KboRawGame[] }>(
      '/ws/Main.asmx/GetKboGameList',
      { leId: '1', srId: '0', date: compact },
    );
    return data.game ?? [];
  }

  mapRawGame(
    raw: KboRawGame,
    resolveInstrument: (team: string) => string,
  ): TodayGame {
    const awayTeam = this.normalizeTeam(raw.AWAY_NM, raw.AWAY_ID);
    const homeTeam = this.normalizeTeam(raw.HOME_NM, raw.HOME_ID);
    const awayScore = parseInt(raw.T_SCORE_CN, 10) || 0;
    const homeScore = parseInt(raw.B_SCORE_CN, 10) || 0;
    const status = this.resolveStatus(raw);
    return {
      id: raw.G_ID,
      awayTeam,
      homeTeam,
      awayScore,
      homeScore,
      inning: this.formatInning(raw, status),
      status,
      linkedInstrumentId: resolveInstrument(homeTeam),
      startTime: raw.G_TM?.trim(),
      stadium: raw.S_NM?.trim(),
      awayPitcher: raw.T_PIT_P_NM?.trim(),
      homePitcher: raw.B_PIT_P_NM?.trim(),
      batter: raw.T_P_NM?.trim(),
      pitcher: raw.B_P_NM?.trim(),
    };
  }

  private normalizeTeam(name: string, code: string): string {
    const trimmed = name?.trim();
    if (trimmed) return trimmed;
    return TEAM_CODE_TO_NAME[code] ?? code;
  }

  private resolveStatus(raw: KboRawGame): GameStatus {
    if (raw.GAME_RESULT_CK === 1 || raw.GAME_STATE_SC === '3') {
      return 'final';
    }
    if (raw.GAME_STATE_SC === '1' && raw.SCORE_CK === '0') {
      return 'scheduled';
    }
    const hasLiveField =
      raw.GAME_INN_NO != null ||
      (raw.T_P_NM && raw.T_P_NM.trim()) ||
      raw.GAME_STATE_SC === '2';
    if (hasLiveField && raw.GAME_RESULT_CK === 0) {
      return 'live';
    }
    if (raw.SCORE_CK === '1' && raw.GAME_RESULT_CK === 0) {
      return 'live';
    }
    return 'scheduled';
  }

  private formatInning(raw: KboRawGame, status: GameStatus): string {
    if (status === 'scheduled') {
      return raw.G_TM?.trim() ? `${raw.G_TM.trim()} 예정` : '예정';
    }
    if (status === 'final') return '종료';
    const inn = raw.GAME_INN_NO;
    const tb = raw.GAME_TB_SC_NM?.trim();
    if (inn != null && tb) {
      const arrow = tb === '초' ? '▲' : '▼';
      return `${arrow}${inn}`;
    }
    return '경기중';
  }

  private async postJson<T>(path: string, data: Record<string, string>): Promise<T> {
    const form = new URLSearchParams(data);
    const res = await fetch(`https://www.koreabaseball.com${path}`, {
      method: 'POST',
      headers: {
        'User-Agent': KBO_UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: 'https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`KBO score HTTP ${res.status}: ${path}`);
    }
    return (await res.json()) as T;
  }
}
