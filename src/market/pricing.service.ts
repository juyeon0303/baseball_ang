import { Injectable } from '@nestjs/common';
import { MetricKind } from './market-lineup';

const OPS_BASELINE = 0.7;
const OPS_PRICE_SLOPE = 15_000;
const OPS_MIN = 0.5;
const OPS_MAX = 1.2;
const ERA_BASELINE = 4.0;
const ERA_PRICE_SLOPE = 2_500;
const ERA_MIN = 1.5;
const ERA_MAX = 6.5;
const PRICE_FLOOR = 500;
const HYPE_PRICE_BASE = 600;
const HYPE_PRICE_SLOPE = 12;

export const SENTIMENT_PER_SHARE = 0.00015;

@Injectable()
export class PricingService {
  fairPrice(metric: MetricKind, value: number): number {
    if (metric === 'hype') {
      const clamped = Math.min(100, Math.max(0, value));
      return Math.max(
        PRICE_FLOOR,
        Math.round(HYPE_PRICE_BASE + clamped * HYPE_PRICE_SLOPE),
      );
    }
    if (metric === 'era') {
      const clamped = Math.min(ERA_MAX, Math.max(ERA_MIN, value));
      return Math.max(
        PRICE_FLOOR,
        Math.round(1000 + (ERA_BASELINE - clamped) * ERA_PRICE_SLOPE),
      );
    }
    const clamped = Math.min(OPS_MAX, Math.max(OPS_MIN, value));
    return Math.max(
      PRICE_FLOOR,
      Math.round(1000 + (clamped - OPS_BASELINE) * OPS_PRICE_SLOPE),
    );
  }

  marketPrice(fairPrice: number, sentiment: number): number {
    return Math.max(PRICE_FLOOR, Math.round(fairPrice * sentiment));
  }

  opsFromHitting(hits: number, ab: number, walks = 0, hbp = 0, sf = 0): number {
    if (ab <= 0) return OPS_BASELINE;
    const obpDenom = ab + walks + hbp + sf;
    const obp = obpDenom > 0 ? (hits + walks + hbp) / obpDenom : 0;
    const slg = ab > 0 ? hits / ab : 0;
    return obp + slg;
  }

  sentimentDelta(quantity: number, action: 'bullish' | 'bearish'): number {
    const sign = action === 'bullish' ? 1 : -1;
    return sign * quantity * SENTIMENT_PER_SHARE;
  }
}
