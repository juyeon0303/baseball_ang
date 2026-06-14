/** KBO 테마 장 세션 라벨 — 기본 24시간 거래(코인형). MARKET_ENFORCE_HOURS=true 시 구 KBO 휴장 적용 */

export type MarketSessionKind =
  | 'premarket'
  | 'regular'
  | 'aftermarket'
  | 'closed';

export interface MarketSessionInfo {
  kind: MarketSessionKind;
  label: string;
  detail: string;
  isTradeHot: boolean;
}

/** true면 새벽 02~09 등 휴장 구간 주문 차단 (레거시 KBO 장) */
export function isMarketHoursEnforced(): boolean {
  return process.env.MARKET_ENFORCE_HOURS === 'true';
}

export function hourInTz(timeZone = 'Asia/Seoul', date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      hour12: false,
    }).format(date),
  );
}

export function getMarketSession(
  opts: {
    timeZone?: string;
    hasLiveGame?: boolean;
    isGameDay?: boolean;
    date?: Date;
  } = {},
): MarketSessionInfo {
  const session = getMarketSessionLegacy(opts);
  if (!isMarketHoursEnforced()) {
    return {
      ...session,
      isTradeHot: true,
      detail: session.kind === 'closed'
        ? '24시간 거래 — 언제든 YES/NO 주문 가능'
        : `${session.detail} · 24시간 거래`,
    };
  }
  return session;
}

function getMarketSessionLegacy(
  opts: {
    timeZone?: string;
    hasLiveGame?: boolean;
    isGameDay?: boolean;
    date?: Date;
  } = {},
): MarketSessionInfo {
  const tz = opts.timeZone ?? 'Asia/Seoul';
  const date = opts.date ?? new Date();
  const hour = hourInTz(tz, date);
  const gameDay = opts.isGameDay ?? true;
  const live = opts.hasLiveGame ?? false;

  if (!gameDay) {
    return {
      kind: 'premarket',
      label: '프리마켓 · 찌라시',
      detail: '월요일 — 경기 없이 공시·루머만 반영',
      isTradeHot: hour >= 9 && hour < 22,
    };
  }
  if (live) {
    return {
      kind: 'regular',
      label: '장중 · 라이브',
      detail: '경기 연동 — 타석·득점에 시세 반응',
      isTradeHot: true,
    };
  }
  if (hour >= 9 && hour < 18) {
    return {
      kind: 'premarket',
      label: '프리마켓',
      detail: '선발·부상·인터뷰 공시 구간 (09~18)',
      isTradeHot: true,
    };
  }
  if (hour >= 18 && hour < 23) {
    return {
      kind: 'regular',
      label: '야간장',
      detail: '경기 시간대 — 라이브 변동',
      isTradeHot: true,
    };
  }
  if (hour >= 23 || hour < 2) {
    return {
      kind: 'aftermarket',
      label: '애프터마켓',
      detail: '경기 후 복기·공시 (23~02)',
      isTradeHot: hour >= 23,
    };
  }
  return {
    kind: 'closed',
    label: '휴장',
    detail: '새벽 — 다음 프리마켓 09:00',
    isTradeHot: false,
  };
}
