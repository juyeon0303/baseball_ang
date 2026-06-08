import { LineupSeed, KBO_TEAM_STOCKS } from './market-lineup';

export interface ThemeEtf {
  id: string;
  name: string;
  tagline: string;
  memberIds: string[];
  accent: string;
  leverage?: number;
}

/** 테마 ETF — 구성 종목 시세 평균으로 basketPrice 산출 */
export const THEME_ETFS: ThemeEtf[] = [
  {
    id: 'etf-bullpen',
    name: '벌떼 불펜 ETF',
    tagline: '후반 역전·홀드에 베팅',
    memberIds: ['lg-park', 'ssg-choi', 'nc-kim', 'ds-yang', 'hh-kang'],
    accent: '#3d9ee5',
  },
  {
    id: 'etf-sluggers',
    name: '거포 군단 ETF',
    tagline: 'OPS 상위 타자 바스켓',
    memberIds: ['kia-kim', 'kt-hill', 'ssg-choi', 'hh-kang', 'ss-koo'],
    accent: '#f97316',
  },
  {
    id: 'etf-fandom',
    name: '동성로·엘린이 ETF',
    tagline: '팬덤 폭발 구단 테마',
    memberIds: ['lt-na', 'lg-park', 'kia-kim', 'kiwoom-joo'],
    accent: '#a855f7',
  },
];

export function findEtfMemberSeeds(etf: ThemeEtf): LineupSeed[] {
  const map = new Map(KBO_TEAM_STOCKS.map((s) => [s.id, s]));
  return etf.memberIds
    .map((id) => map.get(id))
    .filter((s): s is LineupSeed => !!s);
}
