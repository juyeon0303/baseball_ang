import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import {
  KBO_TEAM_STOCKS,
  LEE_JUNG_HOO_STOCK,
  LineupSeed,
} from '../market/market-lineup';
import { MarketService } from '../market/market.service';
import { KboRecordProvider } from './kbo-record.provider';
import { MlbRecordProvider } from './mlb-record.provider';

export interface LiveSyncPlayerResult {
  instrumentId: string;
  playerName: string;
  ok: boolean;
  value?: number;
  team?: string;
  source?: string;
  error?: string;
}

export interface LiveSyncSnapshot {
  startedAt: string;
  finishedAt: string;
  updated: LiveSyncPlayerResult[];
  failed: LiveSyncPlayerResult[];
}

@Injectable()
export class LiveStatsSyncService implements OnModuleInit {
  private readonly logger = new Logger(LiveStatsSyncService.name);
  private running = false;
  private last: LiveSyncSnapshot | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly market: MarketService,
    private readonly kbo: KboRecordProvider,
    private readonly mlb: MlbRecordProvider,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    const delay = Number(this.config.get('LIVE_STATS_BOOT_DELAY_MS') ?? 4_000);
    setTimeout(() => {
      void this.syncAll().catch((e) =>
        this.logger.error(`초기 동기화 실패: ${e}`),
      );
    }, delay);
  }

  @Interval(300_000)
  async scheduledSync(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.syncAll();
  }

  isEnabled(): boolean {
    return this.config.get('LIVE_STATS_ENABLED') !== 'false';
  }

  getLastSnapshot(): LiveSyncSnapshot | null {
    return this.last;
  }

  async syncAll(): Promise<LiveSyncSnapshot> {
    if (this.running) {
      return (
        this.last ?? {
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          updated: [],
          failed: [],
        }
      );
    }
    this.running = true;
    const startedAt = new Date().toISOString();
    const updated: LiveSyncPlayerResult[] = [];
    const failed: LiveSyncPlayerResult[] = [];

    try {
      await this.syncFeaturedLee(updated, failed);
      for (const seed of KBO_TEAM_STOCKS) {
        await this.syncKboSeed(seed, updated, failed);
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
        `실시간 스탯 반영 — 성공 ${updated.length}, 실패 ${failed.length}`,
      );
    }
    return this.last;
  }

  private async syncFeaturedLee(
    updated: LiveSyncPlayerResult[],
    failed: LiveSyncPlayerResult[],
  ): Promise<void> {
    const seed = LEE_JUNG_HOO_STOCK;
    if (!seed.mlbPlayerId) {
      failed.push(this.fail(seed, 'mlbPlayerId 없음'));
      return;
    }
    try {
      const row = await this.mlb.fetchSeasonOps(seed.mlbPlayerId);
      if (!row?.ops) {
        failed.push(this.fail(seed, 'MLB OPS 수집 실패'));
        return;
      }
      await this.market.updateOracle(seed.id, row.ops);
      updated.push({
        instrumentId: seed.id,
        playerName: seed.playerName,
        ok: true,
        value: row.ops,
        team: row.team ?? seed.teamName,
        source: row.source,
      });
    } catch (e) {
      failed.push(this.fail(seed, String(e)));
    }
  }

  private async syncKboSeed(
    seed: LineupSeed,
    updated: LiveSyncPlayerResult[],
    failed: LiveSyncPlayerResult[],
  ): Promise<void> {
    if (!seed.kboPlayerId) {
      failed.push(this.fail(seed, 'kboPlayerId 없음'));
      return;
    }
    try {
      const row =
        seed.metric === 'era'
          ? await this.kbo.fetchPitcherEra(seed.kboPlayerId)
          : await this.kbo.fetchHitterOps(seed.kboPlayerId);
      const value = seed.metric === 'era' ? row?.era : row?.ops;
      if (!row || value == null) {
        failed.push(this.fail(seed, 'KBO 기록 수집 실패'));
        return;
      }
      await this.market.updateOracle(seed.id, value);
      updated.push({
        instrumentId: seed.id,
        playerName: row.playerName || seed.playerName,
        ok: true,
        value,
        team: row.team ?? seed.teamShort,
        source: row.source,
      });
    } catch (e) {
      failed.push(this.fail(seed, String(e)));
    }
  }

  private fail(seed: LineupSeed, error: string): LiveSyncPlayerResult {
    return {
      instrumentId: seed.id,
      playerName: seed.playerName,
      ok: false,
      error,
    };
  }
}
