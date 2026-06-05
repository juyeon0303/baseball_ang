import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MEME_STOCKS } from '../market/market-meme-lineup';
import { MarketService } from '../market/market.service';
import { isKboGameDay, todayKey } from './game-day.util';
import { MemeOracleProvider, MemeOracleRow } from './meme-oracle.provider';

export interface MemeSyncSnapshot {
  startedAt: string;
  finishedAt: string;
  updated: MemeOracleRow[];
  failed: Array<{ instrumentId: string; title: string; error: string }>;
  skipped?: boolean;
  skipReason?: string;
}

@Injectable()
export class MemeSyncService implements OnModuleInit {
  private readonly logger = new Logger(MemeSyncService.name);
  private last: MemeSyncSnapshot | null = null;
  private lastSyncedDayKey: string | null = null;
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly oracle: MemeOracleProvider,
    private readonly market: MarketService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    const delay = Number(this.config.get('MEME_SYNC_BOOT_DELAY_MS') ?? 8_000);
    setTimeout(() => {
      void this.syncIfDue('boot').catch((e) =>
        this.logger.error(`밈 오라클 시작 동기화 실패: ${e}`),
      );
    }, delay);
  }

  /** KBO 경기일 09:30 — 밈 오라클 (선수 스탯 크롤링과 별도 알고리즘) */
  @Cron('30 9 * * 0,2-6', { timeZone: 'Asia/Seoul' })
  async dailyMemeSync(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.syncIfDue('cron');
  }

  isEnabled(): boolean {
    return this.config.get('MEME_SYNC_ENABLED') !== 'false';
  }

  getLastSnapshot(): MemeSyncSnapshot | null {
    return this.last;
  }

  async syncAll(force = false): Promise<MemeSyncSnapshot> {
    if (force) return this.runSync();
    return this.syncIfDue('manual');
  }

  private async syncIfDue(trigger: string): Promise<MemeSyncSnapshot> {
    const tz = this.config.get('MEME_SYNC_TZ') ?? 'Asia/Seoul';
    const today = todayKey(tz);
    if (!isKboGameDay(tz)) {
      const snap: MemeSyncSnapshot = {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        updated: [],
        failed: [],
        skipped: true,
        skipReason: 'KBO 휴무일(월요일)',
      };
      this.last = snap;
      return snap;
    }
    if (this.lastSyncedDayKey === today) {
      const snap: MemeSyncSnapshot = {
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        updated: [],
        failed: [],
        skipped: true,
        skipReason: `오늘(${today}) 이미 밈 동기화됨 [${trigger}]`,
      };
      this.last = snap;
      return snap;
    }
    const result = await this.runSync();
    if (result.updated.length > 0 || result.failed.length === 0) {
      this.lastSyncedDayKey = today;
    }
    return result;
  }

  private async runSync(): Promise<MemeSyncSnapshot> {
    if (this.running) return this.last ?? this.emptySnap();
    this.running = true;
    const startedAt = new Date().toISOString();
    const updated: MemeOracleRow[] = [];
    const failed: MemeSyncSnapshot['failed'] = [];

    try {
      for (const seed of MEME_STOCKS) {
        if (seed.oracleMode === 'manual') continue;
        try {
          const row = await this.oracle.resolveOracle(seed);
          if (!row) {
            failed.push({
              instrumentId: seed.id,
              title: seed.title,
              error: '오라클 수집 실패',
            });
            continue;
          }
          await this.market.updateMemeOracle(seed.id, row.value);
          updated.push(row);
        } catch (e) {
          failed.push({
            instrumentId: seed.id,
            title: seed.title,
            error: String(e),
          });
        }
      }
    } finally {
      this.running = false;
      this.last = {
        startedAt,
        finishedAt: new Date().toISOString(),
        updated,
        failed,
      };
      this.logger.log(
        `밈 오라클 — 성공 ${updated.length}, 실패 ${failed.length}`,
      );
    }
    return this.last;
  }

  private emptySnap(): MemeSyncSnapshot {
    const now = new Date().toISOString();
    return {
      startedAt: now,
      finishedAt: now,
      updated: [],
      failed: [],
    };
  }
}
