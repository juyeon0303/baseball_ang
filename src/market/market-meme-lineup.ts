/** 커뮤 밈·화제 → 주식 (선수 OPS와 별도 오라클) */

export type MemeOracleMode =
  | 'control'
  | 'hr_pace'
  | 'manual'
  | 'pitcher_trend';

export interface MemeStockSeed {
  id: string;
  title: string;
  /** UI 메인 카피 — "OO에 베팅하세요!" */
  betCta: string;
  narrative: string;
  longThesis: string;
  shortThesis: string;
  /** 베팅 버튼 라벨 */
  yesBet: string;
  noBet: string;
  teamName: string;
  teamShort: string;
  symbol: string;
  accent: string;
  metricLabel: string;
  /** 0~100 화제/진척 지수 */
  oracleValue: number;
  oracleMode: MemeOracleMode;
  kboPlayerId?: number;
  /** 문자중계 키워드 → sentiment 연동 */
  linkedKeywords?: string[];
}

/**
 * 2026 커뮤 밈 시드
 * - 롱: 내러티브 긍정 (제구 잡힌다 / 50홈런 간다)
 * - 숏: 부정 (아직 멀다 / 무리다)
 */
export const MEME_STOCKS: MemeStockSeed[] = [
  {
    id: 'meme-ksh-control',
    title: '김서현 직구 제구',
    betCta: '김서현 제구 안정?',
    narrative: '볼넷·제구가 관건',
    longThesis: '안정',
    shortThesis: '아직 불안',
    yesBet: '안정',
    noBet: '아직 불안',
    teamName: '한화',
    teamShort: '한화',
    symbol: 'KSH',
    accent: '#7c3aed',
    metricLabel: '밈지수',
    oracleValue: 28,
    oracleMode: 'control',
    kboPlayerId: 53754,
    linkedKeywords: ['김서현', '볼넷', '사구'],
  },
  {
    id: 'meme-kbh-50hr',
    title: '강백호 50홈런',
    betCta: '강백호 50홈런 가능?',
    narrative: '시즌 50홈런 달성 여부',
    longThesis: '가능',
    shortThesis: '어렵다',
    yesBet: '가능',
    noBet: '어렵다',
    teamName: '한화',
    teamShort: '한화',
    symbol: 'KBH50',
    accent: '#ff6600',
    metricLabel: 'HR진척',
    oracleValue: 8,
    oracleMode: 'hr_pace',
    kboPlayerId: 68050,
    linkedKeywords: ['강백호', '홈런'],
  },
  {
    id: 'meme-ryu-quality',
    title: '류현진 QS·완봉',
    betCta: '류현진 오늘 QS?',
    narrative: '퀄리티 스타트 가능성',
    longThesis: 'QS',
    shortThesis: 'QS 아님',
    yesBet: 'QS',
    noBet: 'QS 아님',
    teamName: '한화',
    teamShort: '한화',
    symbol: 'RYU6',
    accent: '#1e3a5f',
    metricLabel: '밈지수',
    oracleValue: 72,
    oracleMode: 'pitcher_trend',
    kboPlayerId: 76715,
    linkedKeywords: ['류현진', 'QS', '완봉'],
  },
];

const MEME_BY_ID = new Map(MEME_STOCKS.map((s) => [s.id, s]));

export function findMemeById(id: string): MemeStockSeed | undefined {
  return MEME_BY_ID.get(id);
}

export function findMemeByKeyword(text: string): MemeStockSeed | undefined {
  return MEME_STOCKS.find((m) =>
    m.linkedKeywords?.some((kw) => text.includes(kw)),
  );
}

export function isMemeInstrumentId(id: string): boolean {
  return MEME_BY_ID.has(id);
}
