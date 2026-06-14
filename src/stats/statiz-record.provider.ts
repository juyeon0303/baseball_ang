import { Injectable, Logger } from '@nestjs/common';
import { LocalJsonStore } from '../persist/local-json-store';
import { StatMetricGroup } from '../games/player-stats.types';

interface StatizCacheFile {
  updatedAt: string;
  season: number;
  hitters: Record<string, Record<string, string | number>>;
  pitchers: Record<string, Record<string, string | number>>;
  note?: string;
}

@Injectable()
export class StatizRecordProvider {
  private readonly logger = new Logger(StatizRecordProvider.name);
  private readonly store = new LocalJsonStore<StatizCacheFile>('statiz-season.json');
  private readonly season = parseInt(process.env.KBO_STATS_SEASON ?? '2026', 10);

  getPlayerMetrics(
    name: string,
    role: 'hitter' | 'pitcher',
  ): StatMetricGroup | null {
    const cache = this.store.load();
    if (!cache) return null;
    const bucket = role === 'pitcher' ? cache.pitchers : cache.hitters;
    const key = normalizeStatizKey(name);
    const metrics = bucket[key];
    if (!metrics || !Object.keys(metrics).length) return null;
    return {
      id: 'statiz_season',
      label: `Statiz · ${cache.season} 시즌`,
      source: 'statiz',
      metrics,
    };
  }

  getStatus(): { available: boolean; updatedAt?: string; note?: string } {
    const cache = this.store.load();
    return {
      available: Boolean(cache && Object.keys(cache.hitters ?? {}).length),
      updatedAt: cache?.updatedAt,
      note:
        cache?.note ??
        'Statiz는 로그인/SPA 전환으로 서버 수집이 제한됩니다. 캐시 파일(statiz-season.json)로 보강 가능합니다.',
    };
  }

  /** 수동 캐시 주입용 — statiz-season.json 포맷 */
  saveCache(data: Omit<StatizCacheFile, 'updatedAt'>): void {
    this.store.save({ ...data, updatedAt: new Date().toISOString() });
  }
}

export function normalizeStatizKey(name: string): string {
  return (name ?? '').replace(/\s+/g, '').trim();
}
