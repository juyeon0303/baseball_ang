import { Injectable, Logger } from '@nestjs/common';
import { MemeOracleMode, MemeStockSeed } from '../market/market-meme-lineup';
import { KboRecordProvider } from './kbo-record.provider';

export interface MemeOracleRow {
  instrumentId: string;
  title: string;
  value: number;
  source: string;
  detail?: string;
  fetchedAt: string;
}

@Injectable()
export class MemeOracleProvider {
  private readonly logger = new Logger(MemeOracleProvider.name);

  constructor(private readonly kbo: KboRecordProvider) {}

  async resolveOracle(seed: MemeStockSeed): Promise<MemeOracleRow | null> {
    switch (seed.oracleMode) {
      case 'control':
        return this.resolveControl(seed);
      case 'hr_pace':
        return this.resolveHrPace(seed);
      case 'manual':
        return {
          instrumentId: seed.id,
          title: seed.title,
          value: seed.oracleValue,
          source: 'manual_seed',
          detail: '커뮤 내러티브 고정 시드',
          fetchedAt: new Date().toISOString(),
        };
      default:
        return null;
    }
  }

  /** 제구지수 0~100 — BB/9 낮을수록, K/9 높을수록 상승 */
  private async resolveControl(seed: MemeStockSeed): Promise<MemeOracleRow | null> {
    if (!seed.kboPlayerId) return null;
    const raw = await this.kbo.fetchPitcherSeasonLine(seed.kboPlayerId);
    if (!raw) return null;
    const bb9 = raw.ip > 0 ? (raw.bb / raw.ip) * 9 : 6;
    const k9 = raw.ip > 0 ? (raw.so / raw.ip) * 9 : 0;
    const value = Math.round(
      Math.min(100, Math.max(0, 100 - bb9 * 9 + k9 * 1.8)),
    );
    return {
      instrumentId: seed.id,
      title: seed.title,
      value,
      source: 'kbo_control_index',
      detail: `BB/9 ${bb9.toFixed(1)} · K/9 ${k9.toFixed(1)} · IP ${raw.ip}`,
      fetchedAt: new Date().toISOString(),
    };
  }

  /** 50홈런 달성 진척도 0~100 */
  private async resolveHrPace(seed: MemeStockSeed): Promise<MemeOracleRow | null> {
    if (!seed.kboPlayerId) return null;
    const raw = await this.kbo.fetchHitterSeasonLine(seed.kboPlayerId);
    if (!raw || raw.hr == null) return null;
    const target = 50;
    const value = Math.round(Math.min(100, (raw.hr / target) * 100));
    return {
      instrumentId: seed.id,
      title: seed.title,
      value,
      source: 'kbo_hr_pace',
      detail: `시즌 ${raw.hr}홈런 / 목표 ${target}`,
      fetchedAt: new Date().toISOString(),
    };
  }
}
