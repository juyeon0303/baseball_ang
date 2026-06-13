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
  betCta?: string;
  narrative?: string;
  yesBet?: string;
  noBet?: string;
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
      case 'pitcher_trend':
        return this.resolvePitcherTrend(seed);
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

  /** 시즌 ERA·이닝 기반 트렌드 카피 (류현진 등) */
  private async resolvePitcherTrend(
    seed: MemeStockSeed,
  ): Promise<MemeOracleRow | null> {
    if (!seed.kboPlayerId) return null;
    const eraRow = await this.kbo.fetchPitcherEra(seed.kboPlayerId);
    const line = await this.kbo.fetchPitcherSeasonLine(seed.kboPlayerId);
    if (!eraRow?.era && !line) return null;

    const era = eraRow?.era ?? 5;
    const ip = line?.ip ?? 0;
    const eraScore = Math.round(
      Math.min(100, Math.max(0, ((5.5 - era) / 4) * 100)),
    );
    const depthScore = Math.min(35, Math.round(ip * 0.35));
    const value = Math.min(100, Math.round(eraScore * 0.72 + depthScore));

    const player = eraRow?.playerName?.trim() || seed.title.split(' ')[0] || '투수';
    let title = seed.title;
    let betCta = seed.betCta;
    let narrative = seed.narrative;
    let yesBet = seed.yesBet;
    let noBet = seed.noBet;

    if (era <= 2.9) {
      title = `${player} QS·완봉`;
      betCta = `${player} 오늘 QS?`;
      narrative = `ERA ${era.toFixed(2)} · QS 가능성`;
      yesBet = 'QS';
      noBet = 'QS 아님';
    } else if (era <= 3.8) {
      title = `${player} 깊은 이닝`;
      betCta = `${player} 오늘 6이닝 이상?`;
      narrative = `ERA ${era.toFixed(2)} · 이닝 소화`;
      yesBet = '6이닝+';
      noBet = '5이닝 이하';
    } else {
      title = `${player} 반등`;
      betCta = `${player} 오늘 좋은 투구?`;
      narrative = `ERA ${era.toFixed(2)} · 최근 투구`;
      yesBet = '좋은 투구';
      noBet = '부진 지속';
    }

    return {
      instrumentId: seed.id,
      title,
      value,
      source: 'kbo_pitcher_trend',
      detail: `ERA ${era.toFixed(2)} · IP ${ip.toFixed(1)}`,
      fetchedAt: new Date().toISOString(),
      betCta,
      narrative,
      yesBet,
      noBet,
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
