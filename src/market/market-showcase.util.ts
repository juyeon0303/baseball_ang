import { KBO_TEAM_STOCKS } from './market-lineup';
import { InstrumentState, TradeAction, TradeRecord } from './market.types';

export const SHOWCASE_TRADE_USERS = [
  'playball_fan',
  'kbo_yes',
  'night_trader',
  'yasdak_demo',
];

const SHOWCASE_ACTIONS: TradeAction[] = [
  'open_long',
  'open_short',
  'open_long',
  'open_long',
  'open_short',
  'open_long',
  'open_short',
  'open_long',
];

export function buildShowcaseTrades(
  resolveInst: (id: string) => InstrumentState | null,
  limit = 8,
): TradeRecord[] {
  const picks = KBO_TEAM_STOCKS.slice(0, limit);
  const out: TradeRecord[] = [];
  for (let i = 0; i < picks.length; i += 1) {
    const seed = picks[i];
    const inst = resolveInst(seed.id);
    if (!inst) continue;
    const action = SHOWCASE_ACTIONS[i % SHOWCASE_ACTIONS.length];
    const qty = 2 + (i % 4);
    out.push({
      id: `showcase-${seed.id}-${i}`,
      userId: SHOWCASE_TRADE_USERS[i % SHOWCASE_TRADE_USERS.length],
      instrumentId: seed.id,
      instrumentName: inst.name ?? `${seed.playerName} OPS`,
      action,
      quantity: qty,
      price: inst.price,
      pointsDelta:
        action === 'open_short' ? qty * inst.price : -(qty * inst.price),
      oracleValue: inst.oracleValue,
      createdAt: new Date(Date.now() - i * 90_000).toISOString(),
    });
  }
  return out;
}

export interface PulseWeekKing {
  userId: string;
  displayName: string;
  weeklyReturnPct: number;
  isPulse: true;
}

export function buildPulseWeekKing(
  gainer: InstrumentState | undefined,
): PulseWeekKing | null {
  const pct = gainer?.changePct;
  if (gainer == null || pct == null || !Number.isFinite(pct)) return null;
  return {
    userId: 'market_pulse',
    displayName: `${gainer.teamShort}·${gainer.playerName}`,
    weeklyReturnPct: pct,
    isPulse: true,
  };
}
