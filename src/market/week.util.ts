/** 주간 랭킹: 월요일 00:00 (로컬) 기준 주차 */

export function getWeekKey(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const toMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + toMonday);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function getWeekLabel(weekKey: string): string {
  const start = new Date(weekKey);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (x: Date) =>
    `${x.getMonth() + 1}/${x.getDate()}`;
  return `${fmt(start)} ~ ${fmt(end)}`;
}
