/** KBO 정규시즌 기본: 월요일 경기 없음 (화~일) */

export function todayKey(timeZone = 'Asia/Seoul', date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function weekdayInTz(
  timeZone = 'Asia/Seoul',
  date = new Date(),
): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[name] ?? date.getDay();
}

/** 월요일(1) 제외 — KBO 경기일 기준 */
export function isKboGameDay(
  timeZone = 'Asia/Seoul',
  date = new Date(),
): boolean {
  return weekdayInTz(timeZone, date) !== 1;
}

/**
 * MLB 일일 동기화 — KBO와 달리 월요일에도 경기 있음, 시즌 중 거의 매일 1회.
 * (오프시즌에도 전 시즌 누적 OPS 유지용으로 동기화 허용)
 */
export function isMlbSyncDay(
  _timeZone = 'Asia/Seoul',
  _date = new Date(),
): boolean {
  return true;
}
