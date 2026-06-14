import { Injectable, Logger } from '@nestjs/common';
import { todayKey } from '../stats/game-day.util';
import { GameSituation, GameStatus, TodayGame } from './games.types';
import { formatBasesLabel } from './games-display.util';

const KBO_UA =
  'Mozilla/5.0 (compatible; BaseballStockBot/1.0; +kbo-scoreboard)';

/** 개막 몇 분 전까지는 KBO 선발 라인업 선반영을 live로 보지 않음 */
export const KBO_LIVE_START_LEAD_MINUTES = 5;

export function parseKboStartTimeMs(
  gDt: string | undefined,
  gTm: string | undefined,
  timeZone = 'Asia/Seoul',
): number | null {
  const tm = gTm?.trim();
  if (!tm) return null;
  const parts = tm.match(/^(\d{1,2}):(\d{2})$/);
  if (!parts) return null;
  const hour = parseInt(parts[1], 10);
  const minute = parseInt(parts[2], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  let dateKey = gDt?.trim();
  if (dateKey?.length === 8) {
    dateKey = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
  }
  if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    dateKey = todayKey(timeZone);
  }

  const iso = `${dateKey}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+09:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function isBeforeKboLiveWindow(
  raw: KboRawGame,
  now = new Date(),
  timeZone = 'Asia/Seoul',
  leadMinutes = KBO_LIVE_START_LEAD_MINUTES,
): boolean {
  const startMs = parseKboStartTimeMs(raw.G_DT, raw.G_TM, timeZone);
  if (startMs == null) return false;
  return now.getTime() < startMs - leadMinutes * 60_000;
}

export function resolveKboGameStatus(
  raw: KboRawGame,
  now = new Date(),
  timeZone = 'Asia/Seoul',
): GameStatus {
  if (raw.GAME_RESULT_CK === 1 || raw.GAME_STATE_SC === '3') {
    return 'final';
  }
  if (raw.GAME_STATE_SC === '1') {
    return 'scheduled';
  }
  if (raw.GAME_STATE_SC === '2') {
    if (isBeforeKboLiveWindow(raw, now, timeZone)) {
      return 'scheduled';
    }
    return 'live';
  }
  return 'scheduled';
}

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
  BALL_CN?: number | string | null;
  STRIKE_CN?: number | string | null;
  OUT_CN?: number | string | null;
  B1_BAT_ORDER_NO?: number | string | null;
  B2_BAT_ORDER_NO?: number | string | null;
  B3_BAT_ORDER_NO?: number | string | null;
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
    const situation = this.parseSituation(raw, status);
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
      situation,
    };
  }

  private parseIntField(v: unknown): number {
    if (v == null || v === '') return 0;
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : 0;
  }

  parseSituation(raw: KboRawGame, status: GameStatus): GameSituation | undefined {
    if (status !== 'live') return undefined;
    const balls = Math.min(3, Math.max(0, this.parseIntField(raw.BALL_CN)));
    const strikes = Math.min(2, Math.max(0, this.parseIntField(raw.STRIKE_CN)));
    const outs = Math.min(2, Math.max(0, this.parseIntField(raw.OUT_CN)));
    return {
      balls,
      strikes,
      outs,
      bases: {
        first: this.parseIntField(raw.B1_BAT_ORDER_NO) > 0,
        second: this.parseIntField(raw.B2_BAT_ORDER_NO) > 0,
        third: this.parseIntField(raw.B3_BAT_ORDER_NO) > 0,
      },
      countText: `${balls}-${strikes}`,
      basesLabel: formatBasesLabel({
        first: this.parseIntField(raw.B1_BAT_ORDER_NO) > 0,
        second: this.parseIntField(raw.B2_BAT_ORDER_NO) > 0,
        third: this.parseIntField(raw.B3_BAT_ORDER_NO) > 0,
      }),
    };
  }

  private normalizeTeam(name: string, code: string): string {
    const trimmed = name?.trim();
    if (trimmed) return trimmed;
    return TEAM_CODE_TO_NAME[code] ?? code;
  }

  private resolveStatus(raw: KboRawGame): GameStatus {
    return resolveKboGameStatus(raw);
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
