/** KBO 팀 코드 → 네이버 스포츠 팀 코드 (동일한 경우가 많음) */
export const KBO_TO_NAVER_TEAM: Record<string, string> = {
  WO: 'WO',
  OB: 'OB',
  HH: 'HH',
  LT: 'LT',
  KT: 'KT',
  SK: 'SK',
  NC: 'NC',
  SS: 'SS',
  HT: 'HT',
  LG: 'LG',
};

export function buildNaverGameId(
  dateKey: string,
  awayCode: string,
  homeCode: string,
): string {
  const ymd = dateKey.replace(/-/g, '');
  const year = ymd.slice(0, 4);
  const away = KBO_TO_NAVER_TEAM[awayCode] ?? awayCode;
  const home = KBO_TO_NAVER_TEAM[homeCode] ?? homeCode;
  return `${ymd}${away}${home}0${year}`;
}

/** KBO 앱 팀명 → KBO/네이버 팀 코드 */
export const TEAM_NAME_TO_CODE: Record<string, string> = {
  키움: 'WO',
  두산: 'OB',
  한화: 'HH',
  롯데: 'LT',
  KT: 'KT',
  SSG: 'SK',
  NC: 'NC',
  삼성: 'SS',
  KIA: 'HT',
  LG: 'LG',
};

export function dateKeyFromGameId(gameId: string): string | null {
  const ymd = gameId.slice(0, 8);
  if (!/^\d{8}$/.test(ymd)) return null;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

export function resolveNaverGameId(
  game: { id: string; awayTeam: string; homeTeam: string; naverGameId?: string },
  dateKey?: string,
): string | null {
  if (game.naverGameId) return game.naverGameId;
  const resolvedDate = dateKey ?? dateKeyFromGameId(game.id);
  if (!resolvedDate) return null;
  const awayCode = TEAM_NAME_TO_CODE[game.awayTeam];
  const homeCode = TEAM_NAME_TO_CODE[game.homeTeam];
  if (!awayCode || !homeCode) return null;
  return buildNaverGameId(resolvedDate, awayCode, homeCode);
}
