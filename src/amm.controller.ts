import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AmmEngineService } from './amm/amm-engine.service';
import { SessionAuthService } from './auth/session-auth.service';
import { resolveInstrumentId } from './market/market-lineup';
import { MarketService } from './market/market.service';
import { LEE_JUNG_HOO_OPS_ID } from './market/market-lineup';
import { OrderSide } from './market/market.types';
import { HubService } from './hub/hub.service';
import { LiveStatsSyncService } from './stats/live-stats-sync.service';
import { MemeSyncService } from './stats/meme-sync.service';
import { DatabaseHealthService } from './database/database-health.service';
import { getEffectiveStorageMode, isPostgresConfigured } from './persist/storage-mode';
import { DisclosureService } from './market/disclosure.service';
import { OffDayDemoService } from './market/off-day-demo.service';
import { ShareholderService } from './market/shareholder.service';

@Controller('amm')
export class AmmController {
  constructor(
    private readonly ammEngine: AmmEngineService,
    private readonly market: MarketService,
    private readonly hub: HubService,
    private readonly liveStats: LiveStatsSyncService,
    private readonly memeSync: MemeSyncService,
    private readonly dbHealth: DatabaseHealthService,
    private readonly disclosure: DisclosureService,
    private readonly shareholders: ShareholderService,
    private readonly offDayDemo: OffDayDemoService,
    private readonly auth: SessionAuthService,
  ) {}

  /** Render deploy liveness — DB 없이 즉시 200 */
  @Get('health/live')
  getHealthLive() {
    return {
      ok: true,
      serverTime: new Date().toISOString(),
    };
  }

  @Get('health')
  async getHealth() {
    const storageMode = process.env.STORAGE_MODE ?? 'memory';
    const effectiveStorage = getEffectiveStorageMode();
    const postgresConfigured = isPostgresConfigured();
    const db =
      postgresConfigured
        ? await this.dbHealth.ping().then(() => this.dbHealth.getStatus())
        : { enabled: false, connected: false, error: null };
    const stats =
      postgresConfigured && db.connected
        ? await this.market.getStoreStats()
        : null;
    return {
      ok: effectiveStorage === 'postgres' ? db.connected : true,
      storageMode,
      effectiveStorage,
      persistent: effectiveStorage === 'postgres' && db.connected,
      database: db,
      stats,
      serverTime: new Date().toISOString(),
      hint:
        effectiveStorage !== 'postgres' || !db.connected
          ? '서버 재시작 시 계정·지갑이 초기화될 수 있습니다. Render에 DATABASE_URL(Supabase)을 설정하세요.'
          : null,
    };
  }

  @Get('memes')
  async getMemes() {
    const items = await this.market.getMemeLineup();
    const sorted = [...items].sort(
      (a, b) => b.oracleValue - a.oracleValue || b.price - a.price,
    );
    return {
      enabled: this.memeSync.isEnabled(),
      last: this.memeSync.getLastSnapshot(),
      items: sorted.map((m) => ({
        id: m.id,
        instrumentId: m.id,
        title: m.name,
        playerName: m.playerName,
        betCta: m.betCta,
        narrative: m.narrative,
        longThesis: m.longThesis,
        shortThesis: m.shortThesis,
        yesBet: m.yesBet,
        noBet: m.noBet,
        teamShort: m.teamShort,
        metricLabel: m.metricLabel,
        oracleValue: m.oracleValue,
        price: m.price,
        sentiment: m.sentiment,
        accent: m.accent,
      })),
    };
  }

  @Post('sync-memes')
  async syncMemesNow(@Query('force') force?: string) {
    const snapshot = await this.memeSync.syncAll(
      force === '1' || force === 'true',
    );
    return {
      success: true,
      snapshot,
      memes: await this.market.getMemeLineup(),
    };
  }

  @Get('live-stats')
  getLiveStatsStatus() {
    const last = this.liveStats.getLastSnapshot();
    return {
      enabled: this.liveStats.isEnabled(),
      schedule: this.liveStats.getScheduleInfo(),
      last,
      lastKbo: this.liveStats.getLastKboSnapshot(),
      lastMlb: this.liveStats.getLastMlbSnapshot(),
    };
  }

  @Post('sync-stats')
  async syncStatsNow(
    @Query('force') force?: string,
    @Query('scope') scope?: string,
  ) {
    const safeScope =
      scope === 'kbo' || scope === 'mlb' || scope === 'all' ? scope : 'all';
    const snapshot = await this.liveStats.syncAll(
      force === '1' || force === 'true',
      safeScope,
    );
    return {
      success: true,
      scope: safeScope,
      snapshot,
      lineup: await this.market.getLineup(),
    };
  }

  @Get('hub')
  async getHub(@Headers('authorization') authorization?: string) {
    const session = this.auth.fromBearer(authorization);
    return this.hub.getHub(
      session?.accountId,
      session ? (id) => this.auth.getDisplayName(id) : undefined,
    );
  }

  @Get('disclosures')
  getDisclosures(@Query('limit') limit?: string) {
    const n = Math.min(30, Math.max(1, parseInt(limit ?? '12', 10) || 12));
    return {
      disclosures: this.disclosure.getFeed(n),
      session: this.disclosure.getSessionContext(),
    };
  }

  @Post('disclosures/pulse')
  async pulseDisclosure() {
    const item = await this.disclosure.pulse('manual');
    return { success: !!item, item };
  }

  @Post('demo/pulse')
  async pulseDemo() {
    await this.offDayDemo.pulse('manual');
    return {
      success: true,
      demoMode: this.offDayDemo.isActive(),
      message: this.offDayDemo.getLastMessage(),
    };
  }

  @Get('shareholders')
  async getShareholders(@Headers('authorization') authorization?: string) {
    const session = this.auth.fromBearer(authorization);
    return this.shareholders.getBoard(session?.accountId);
  }

  @Get('etfs')
  async getEtfs() {
    return { etfs: await this.market.getEtfBaskets() };
  }

  @Get('status')
  async getStatus(@Query('instrumentId') instrumentId?: string) {
    const id = instrumentId ?? LEE_JUNG_HOO_OPS_ID;
    return this.market.getStatus(id);
  }

  @Get('market-board')
  async getMarketBoard() {
    return this.market.getMarketBoard();
  }

  @Get('trades/me')
  async getMyTrades(@Headers('authorization') authorization?: string) {
    const session = this.auth.requireBearer(authorization);
    const trades = await this.market.getUserTrades(session.accountId, 40);
    return { trades };
  }

  @Get('trades')
  async getTrades(@Query('instrumentId') instrumentId?: string) {
    return { trades: await this.market.getRecentTrades(30, instrumentId) };
  }

  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit?: string) {
    const n = Math.min(50, Math.max(1, parseInt(limit ?? '10', 10) || 10));
    return this.market.getLeaderboard(n);
  }

  @Get('lineup')
  async getLineup() {
    const instruments = await this.ammEngine.getLineup();
    const rows = await Promise.all(
      instruments.map(async (item, index) => {
        const enriched = await this.market.enrichInstrument(item);
        return {
          id: index + 1,
          instrumentId: item.id,
          name: enriched.name,
          playerName: enriched.playerName,
          teamName: enriched.teamName,
          teamShort: enriched.teamShort,
          symbol: enriched.symbol,
          metric: enriched.metric,
          metricLabel: enriched.metricLabel,
          type: `${enriched.metricLabel} / KBO`,
          price: enriched.price,
          fairPrice: enriched.fairPrice,
          oracleValue: enriched.oracleValue,
          oracleOps: enriched.oracleValue,
          sentiment: enriched.sentiment,
          accent: enriched.accent,
          changePct: enriched.changePct ?? 0,
        };
      }),
    );
    return rows;
  }

  @Get('market/:instrumentId')
  async getMarket(@Param('instrumentId') instrumentId: string) {
    return this.market.getMarket(instrumentId);
  }

  @Get('portfolio/:userId')
  async getPortfolio(
    @Param('userId') userId: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('instrumentId') instrumentId?: string,
  ) {
    const session = this.auth.requireBearer(authorization);
    if (session.accountId !== userId) {
      throw new ForbiddenException('본인 포트폴리오만 조회할 수 있습니다.');
    }
    return this.market.getPortfolio(
      session.accountId,
      instrumentId ?? LEE_JUNG_HOO_OPS_ID,
    );
  }

  @Post('buy')
  async buyStock(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    orderDto: {
      playerId?: number | string;
      instrumentId?: string;
      quantity: number;
      side?: OrderSide;
    },
  ) {
    const session = this.auth.requireBearer(authorization);
    const instrumentId = this.resolveInstrument(orderDto);
    const side = orderDto.side ?? 'long';
    return this.market.executeBuy(
      session.accountId,
      instrumentId,
      orderDto.quantity,
      side,
    );
  }

  @Post('sell')
  async sellStock(
    @Headers('authorization') authorization: string | undefined,
    @Body()
    orderDto: {
      playerId?: number | string;
      instrumentId?: string;
      quantity: number;
      side?: OrderSide;
    },
  ) {
    const session = this.auth.requireBearer(authorization);
    const instrumentId = this.resolveInstrument(orderDto);
    const side = orderDto.side ?? 'long';
    return this.market.executeSell(
      session.accountId,
      instrumentId,
      orderDto.quantity,
      side,
    );
  }

  @Post('oracle')
  async updateOracle(
    @Body() body: { ops?: number; era?: number; value?: number; instrumentId?: string },
  ) {
    const instrumentId = body.instrumentId ?? LEE_JUNG_HOO_OPS_ID;
    const value = body.value ?? body.ops ?? body.era;
    if (value == null) {
      throw new BadRequestException('value, ops 또는 era 필드가 필요합니다.');
    }
    return this.market.updateOracle(instrumentId, value);
  }

  @Post('ingest-boxscore')
  async ingestBoxscore(@Body() body: { dailyStats?: Array<Record<string, unknown>> }) {
    const stats = body?.dailyStats ?? [];
    const updated: string[] = [];
    for (const row of stats) {
      const name = String(row['name'] ?? row['선수명'] ?? '');
      const hits = this.num(row['hits'] ?? row['H']);
      const ab = this.num(row['ab'] ?? row['AB']);
      const ops = this.num(row['ops'] ?? row['OPS']);
      const era = this.num(row['era'] ?? row['ERA']);
      const instrumentId = row['instrumentId']
        ? String(row['instrumentId'])
        : undefined;
      const result = await this.market.ingestPlayerStat({
        name,
        instrumentId,
        hits: hits ?? undefined,
        ab: ab ?? undefined,
        ops: ops ?? undefined,
        era: era ?? undefined,
      });
      if (result) updated.push(result.playerName);
    }
    return {
      success: true,
      updatedPlayers: updated,
      lineup: await this.market.getLineup(),
    };
  }

  private resolveInstrument(orderDto: {
    playerId?: number | string;
    instrumentId?: string;
  }): string {
    const id = resolveInstrumentId(orderDto.playerId, orderDto.instrumentId);
    if (!id) {
      throw new BadRequestException(
        'playerId(1~10) 또는 instrumentId를 확인하세요.',
      );
    }
    return id;
  }

  private num(value: unknown): number | null {
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
