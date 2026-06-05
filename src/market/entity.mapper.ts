import { InstrumentEntity } from '../entities/instrument.entity';
import { PriceSnapshotEntity } from '../entities/price-snapshot.entity';
import { TradeEntity } from '../entities/trade.entity';
import { findMemeById } from './market-meme-lineup';
import { InstrumentState, PriceSnapshot, TradeRecord } from './market.types';
import { MetricKind } from './market-lineup';

export function toInstrumentState(row: InstrumentEntity): InstrumentState {
  const meme = findMemeById(row.id);
  const kind = row.metric === 'hype' || meme ? 'meme' : 'player';
  return {
    id: row.id,
    kind,
    name: row.name,
    symbol: row.symbol,
    teamName: row.teamName,
    teamShort: row.teamShort,
    playerName: row.playerName,
    metric: row.metric as MetricKind,
    metricLabel: row.metricLabel,
    oracleValue: Number(row.oracleValue),
    sentiment: Number(row.sentiment),
    fairPrice: Number(row.fairPrice),
    price: Number(row.price),
    accent: row.accent,
    betCta: meme?.betCta,
    narrative: meme?.narrative,
    longThesis: meme?.longThesis,
    shortThesis: meme?.shortThesis,
    yesBet: meme?.yesBet,
    noBet: meme?.noBet,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toTradeRecord(row: TradeEntity): TradeRecord {
  return {
    id: row.id,
    userId: row.userId,
    instrumentId: row.instrumentId,
    instrumentName: row.instrumentName ?? undefined,
    action: row.action as TradeRecord['action'],
    quantity: row.quantity,
    price: Number(row.price),
    pointsDelta: Number(row.pointsDelta),
    oracleValue: Number(row.oracleValue),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toPriceSnapshot(row: PriceSnapshotEntity): PriceSnapshot {
  return {
    at: row.createdAt.toISOString(),
    price: Number(row.price),
    fairPrice: Number(row.fairPrice),
    oracleValue: Number(row.oracleValue),
    sentiment: Number(row.sentiment),
  };
}
