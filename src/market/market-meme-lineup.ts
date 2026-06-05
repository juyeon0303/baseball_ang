/** 커뮤 밈·화제 → 주식 (선수 OPS와 별도 오라클) */

export type MemeOracleMode = 'control' | 'hr_pace' | 'manual';

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
    betCta: '김서현 직구 제구, 잡힐까?',
    narrative: '직구 제구가 언제 잡힐까',
    longThesis: '잡힌다',
    shortThesis: '아직 멀다',
    yesBet: '잡힌다!',
    noBet: '아직 멀어',
    teamName: '한화',
    teamShort: '한화',
    symbol: 'KSH',
    accent: '#7c3aed',
    metricLabel: '제구지수',
    oracleValue: 28,
    oracleMode: 'control',
    kboPlayerId: 53754,
    linkedKeywords: ['김서현', '볼넷', '사구'],
  },
  {
    id: 'meme-kbh-50hr',
    title: '강백호 50홈런',
    betCta: '강백호, 50홈런 간다?',
    narrative: '시즌 50홈런 달성 가능할까',
    longThesis: '간다',
    shortThesis: '무리다',
    yesBet: '간다!',
    noBet: '무리야',
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
    title: '류현진 6이닝+',
    betCta: '류현진, 6이닝 넘길까?',
    narrative: '오늘 6이닝을 넘길까',
    longThesis: '넘긴다',
    shortThesis: '5이닝 컷',
    yesBet: '넘긴다!',
    noBet: '5이닝 컷',
    teamName: '한화',
    teamShort: '한화',
    symbol: 'RYU6',
    accent: '#1e3a5f',
    metricLabel: '이닝지수',
    oracleValue: 42,
    oracleMode: 'manual',
    linkedKeywords: ['류현진'],
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
