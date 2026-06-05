import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  KBO_TEAM_STOCKS,
  LineupSeed,
  MLB_FEATURED_STOCKS,
} from '../market/market-lineup';
import { MarketService } from '../market/market.service';
import { isKboGameDay, isMlbSyncDay, todayKey } from './game-day.util';
import { KboRecordProvider } from './kbo-record.provider';
import { MlbRecordProvider } from './mlb-record.provider';

export type SyncScope = 'all' | 'kbo' | 'mlb';

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
  league: 'kbo' | 'mlb';
  startedAt: string;
  finishedAt: string;
  updated: LiveSyncPlayerResult[];
  failed: LiveSyncPlayerResult[];
  skipped?: boolean;
  skipReason?: string;
}

export interface LiveSyncCombinedSnapshot {
  startedAt: string;
  finishedAt: string;
  updated: LiveSyncPlayerResult[];
  failed: LiveSyncPlayerResult[];
  skipped?: boolean;
  skipReason?: string;
  kbo: LiveSyncSnapshot | null;
  mlb: LiveSyncSnapshot | null;
}

@Injectable()
export class LiveStatsSyncService implements OnModuleInit {
  private readonly logger = new Logger(LiveStatsSyncService.name);
  private runningKbo = false;
  private runningMlb = false;
  private lastKbo: LiveSyncSnapshot | null = null;
  private lastMlb: LiveSyncSnapshot | null = null;
  private lastSyncedKboDayKey: string | null = null;
  private lastSyncedMlbDayKey: string | null = null;

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
      void this.syncIfDue('boot', 'all').catch((e) =>
        this.logger.error(`시작 시 동기화 실패: ${e}`),
      );
    }, delay);
  }

  /** KBO — 경기일 09:00 KST, 하루 1회 (월요일 제외) */
  @Cron('0 9 * * 0,2-6', { timeZone: 'Asia/Seoul' })
  async dailyKboSync(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.syncIfDue('cron', 'kbo');
  }

  /** MLB — 매일 10:00 KST, 하루 1회 (Stats API, KBO와 별도) */
  @Cron('0 10 * * *', { timeZone: 'Asia/Seoul' })
  async dailyMlbSync(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.syncIfDue('cron', 'mlb');
  }

  isEnabled(): boolean {
    return this.config.get('LIVE_STATS_ENABLED') !== 'false';
  }

  getScheduleInfo() {
    const tz = this.config.get('LIVE_STATS_TZ') ?? 'Asia/Seoul';
    const today = todayKey(tz);
    return {
      kbo: {
        mode: 'daily_game_day',
        league: 'kbo',
        source: 'kbo_official_html',
        algorithm: '공식 기록실 HTML 파싱 (OPS/ERA)',
        timeZone: tz,
        cron: '0 9 * * 0,2-6 (09:00 KST, 월요일 제외)',
        today,
        isGameDay: isKboGameDay(tz),
        alreadySyncedToday: this.lastSyncedKboDayKey === today,
        lastSyncedDayKey: this.lastSyncedKboDayKey,
        playerCount: KBO_TEAM_STOCKS.length,
      },
      mlb: {
        mode: 'daily',
        league: 'mlb',
        source: 'mlb_statsapi',
        algorithm: 'MLB Stats API JSON (시즌 OPS)',
        timeZone: tz,
        cron: '0 10 * * * (10:00 KST, 매일)',
        today,
        isSyncDay: isMlbSyncDay(tz),
        alreadySyncedToday: this.lastSyncedMlbDayKey === today,
        lastSyncedDayKey: this.lastSyncedMlbDayKey,
        playerCount: MLB_FEATURED_STOCKS.length,
      },
    };
  }

  getLastSnapshot(): LiveSyncCombinedSnapshot | null {
    if (!this.lastKbo && !this.lastMlb) return null;
    return this.combineSnapshots(this.lastKbo, this.lastMlb);
  }

  getLastKboSnapshot(): LiveSyncSnapshot | null {
    return this.lastKbo;
  }

  getLastMlbSnapshot(): LiveSyncSnapshot | null {
    return this.lastMlb;
  }

  async syncAll(
    force = false,
    scope: SyncScope = 'all',
  ): Promise<LiveSyncCombinedSnapshot> {
    if (force) {
      return this.runScopedSync(scope);
    }
    return this.syncIfDue('manual', scope);
  }

  private async syncIfDue(
    trigger: 'boot' | 'cron' | 'manual',
    scope: SyncScope,
  ): Promise<LiveSyncCombinedSnapshot> {
    const tz = this.config.get('LIVE_STATS_TZ') ?? 'Asia/Seoul';
    const today = todayKey(tz);
    const runKbo = scope === 'all' || scope === 'kbo';
    const runMlb = scope === 'all' || scope === 'mlb';

    let kboSnap = this.lastKbo;
    let mlbSnap = this.lastMlb;

    if (runKbo) {
      if (!isKboGameDay(tz)) {
        kboSnap = this.skippedSnapshot(
          'kbo',
          'KBO 휴무일(월요일)',
        );
        this.lastKbo = kboSnap;
        this.logger.log(`KBO 오라클 생략 — ${kboSnap.skipReason}`);
      } else if (this.lastSyncedKboDayKey === today) {
        kboSnap = this.skippedSnapshot(
          'kbo',
          `KBO 오늘(${today}) 이미 동기화됨 [${trigger}]`,
        );
        this.lastKbo = kboSnap;
        this.logger.debug(kboSnap.skipReason);
      } else {
        kboSnap = await this.runKboSync();
        if (kboSnap.updated.length > 0 || kboSnap.failed.length === 0) {
          this.lastSyncedKboDayKey = today;
        }
      }
    }

    if (runMlb) {
      if (!isMlbSyncDay(tz)) {
        mlbSnap = this.skippedSnapshot('mlb', 'MLB 동기화 생략');
        this.lastMlb = mlbSnap;
      } else if (this.lastSyncedMlbDayKey === today) {
        mlbSnap = this.skippedSnapshot(
          'mlb',
          `MLB 오늘(${today}) 이미 동기화됨 [${trigger}]`,
        );
        this.lastMlb = mlbSnap;
        this.logger.debug(mlbSnap.skipReason);
      } else {
        mlbSnap = await this.runMlbSync();
        if (mlbSnap.updated.length > 0 || mlbSnap.failed.length === 0) {
          this.lastSyncedMlbDayKey = today;
        }
      }
    }

    return this.combineSnapshots(kboSnap, mlbSnap);
  }

  private async runScopedSync(scope: SyncScope): Promise<LiveSyncCombinedSnapshot> {
    const tz = this.config.get('LIVE_STATS_TZ') ?? 'Asia/Seoul';
    const today = todayKey(tz);
    let kboSnap = this.lastKbo;
    let mlbSnap = this.lastMlb;

    if (scope === 'all' || scope === 'kbo') {
      kboSnap = await this.runKboSync();
      this.lastSyncedKboDayKey = today;
    }
    if (scope === 'all' || scope === 'mlb') {
      mlbSnap = await this.runMlbSync();
      this.lastSyncedMlbDayKey = today;
    }

    return this.combineSnapshots(kboSnap, mlbSnap);
  }

  private async runKboSync(): Promise<LiveSyncSnapshot> {
    if (this.runningKbo) {
      return (
        this.lastKbo ?? {
          league: 'kbo',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          updated: [],
          failed: [],
        }
      );
    }
    this.runningKbo = true;
    const startedAt = new Date().toISOString();
    const updated: LiveSyncPlayerResult[] = [];
    const failed: LiveSyncPlayerResult[] = [];

    try {
      for (const seed of KBO_TEAM_STOCKS) {
        await this.syncKboSeed(seed, updated, failed);
      }
    } finally {
      this.runningKbo = false;
      this.lastKbo = {
        league: 'kbo',
        startedAt,
        finishedAt: new Date().toISOString(),
        updated,
        failed,
      };
      this.logger.log(
        `KBO 일일 오라클 — 성공 ${updated.length}, 실패 ${failed.length}`,
      );
    }
    return this.lastKbo;
  }

  private async runMlbSync(): Promise<LiveSyncSnapshot> {
    if (this.runningMlb) {
      return (
        this.lastMlb ?? {
          league: 'mlb',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          updated: [],
          failed: [],
        }
      );
    }
    this.runningMlb = true;
    const startedAt = new Date().toISOString();
    const updated: LiveSyncPlayerResult[] = [];
    const failed: LiveSyncPlayerResult[] = [];

    try {
      for (const seed of MLB_FEATURED_STOCKS) {
        await this.syncMlbSeed(seed, updated, failed);
      }
    } finally {
      this.runningMlb = false;
      this.lastMlb = {
        league: 'mlb',
        startedAt,
        finishedAt: new Date().toISOString(),
        updated,
        failed,
      };
      this.logger.log(
        `MLB 일일 오라클 — 성공 ${updated.length}, 실패 ${failed.length}`,
      );
    }
    return this.lastMlb;
  }

  private async syncMlbSeed(
    seed: LineupSeed,
    updated: LiveSyncPlayerResult[],
    failed: LiveSyncPlayerResult[],
  ): Promise<void> {
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
        playerName: row.playerName || seed.playerName,
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

  private skippedSnapshot(
    league: 'kbo' | 'mlb',
    skipReason: string,
  ): LiveSyncSnapshot {
    const now = new Date().toISOString();
    return {
      league,
      startedAt: now,
      finishedAt: now,
      updated: [],
      failed: [],
      skipped: true,
      skipReason,
    };
  }

  private combineSnapshots(
    kbo: LiveSyncSnapshot | null,
    mlb: LiveSyncSnapshot | null,
  ): LiveSyncCombinedSnapshot {
    const updated = [...(kbo?.updated ?? []), ...(mlb?.updated ?? [])];
    const failed = [...(kbo?.failed ?? []), ...(mlb?.failed ?? [])];
    const startedAt =
      [kbo?.startedAt, mlb?.startedAt]
        .filter(Boolean)
        .sort()[0] ?? new Date().toISOString();
    const finishedAt =
      [kbo?.finishedAt, mlb?.finishedAt]
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? new Date().toISOString();
    const bothSkipped =
      (kbo?.skipped ?? false) && (mlb?.skipped ?? false);
    const onlyKbo = kbo && !mlb;
    const onlyMlb = mlb && !kbo;

    return {
      startedAt,
      finishedAt,
      updated,
      failed,
      skipped: onlyKbo
        ? kbo.skipped
        : onlyMlb
          ? mlb.skipped
          : bothSkipped,
      skipReason: onlyKbo
        ? kbo.skipReason
        : onlyMlb
          ? mlb.skipReason
          : bothSkipped
            ? [kbo?.skipReason, mlb?.skipReason].filter(Boolean).join(' · ')
            : undefined,
      kbo,
      mlb,
    };
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
