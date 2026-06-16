import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { Interval } from '@nestjs/schedule';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { GamesRecapService } from '../games/games-recap.service';
import { GameSituation } from '../games/games.types';
import { GamesService } from '../games/games.service';
import { KBO_TEAM_STOCKS } from './market-lineup';
import { MarketService } from './market.service';

/**
 * 휴무·비경기 시간 샘플 시세 펄스 (기본 OFF).
 * OFFDAY_DEMO_ENABLED=true 일 때만 수동/스케줄 펄스 — 프로덕션은 실제 공시·거래·리캡만 사용.
 */
@Injectable()
export class OffDayDemoService implements OnModuleInit {
  private readonly logger = new Logger(OffDayDemoService.name);
  private tick = 0;
  private lastMessage = '';

  constructor(
    private readonly config: ConfigService,
    private readonly games: GamesService,
    private readonly recap: GamesRecapService,
    private readonly market: MarketService,
    private readonly moduleRef: ModuleRef,
  ) {}

  /** 명시적으로 true일 때만 샘플 펄스 허용 */
  isEnabled(): boolean {
    return this.config.get('OFFDAY_DEMO_ENABLED') === 'true';
  }

  onModuleInit(): void {
    if (!this.isEnabled()) return;
    setTimeout(() => void this.pulse('boot').catch(() => {}), 18_000);
  }

  isActive(): boolean {
    if (!this.isEnabled()) return false;
    return !this.games.getTodayGames().some((g) => g.status === 'live');
  }

  getLastMessage(): string {
    return this.lastMessage;
  }

  @Interval(50_000)
  async scheduledPulse(): Promise<void> {
    if (!this.isEnabled()) return;
    await this.pulse('interval');
  }

  async pulse(trigger: string): Promise<void> {
    if (!this.isActive()) return;

    const recapData = await this.recap.getRecap();
    const highlight =
      recapData?.games?.find((g) => g.id === recapData.highlightId) ||
      recapData?.games?.[0];

    const teamName =
      Math.random() > 0.5 ? highlight?.homeTeam : highlight?.awayTeam;
    const seed =
      KBO_TEAM_STOCKS.find((s) => s.teamName === teamName) ??
      KBO_TEAM_STOCKS[this.tick % KBO_TEAM_STOCKS.length];

    const delta = (Math.random() > 0.48 ? 1 : -1) * (0.006 + Math.random() * 0.014);
    const inst = await this.market.applyPlaySentiment(seed.id, delta);
    if (!inst) return;

    const situation = this.buildDemoSituation(highlight?.inning);
    const pct = Math.round(delta * 1000) / 10;
    this.lastMessage = `[데모] ${seed.teamShort} ${inst.playerName} ${pct >= 0 ? '+' : ''}${pct}% · 프리마켓 흐름`;

    try {
      const gateway = this.moduleRef.get(StockStreamGateway, { strict: false });
      gateway?.broadcastLiveEvent('demoPulse', {
        demoMode: true,
        trigger,
        message: this.lastMessage,
        instrument: {
          id: inst.id,
          playerName: inst.playerName,
          teamShort: inst.teamShort,
          price: inst.price,
          oracleValue: inst.oracleValue,
        },
        situation,
        gameId: highlight?.id ?? null,
        team: seed.teamShort,
      });
    } catch {
      /* optional */
    }

    this.tick += 1;
    this.logger.debug(`${this.lastMessage} [${trigger}]`);
  }

  private buildDemoSituation(inning?: string): GameSituation {
    const balls = Math.floor(Math.random() * 4);
    const strikes = Math.floor(Math.random() * 3);
    const outs = Math.floor(Math.random() * 3);
    return {
      balls,
      strikes,
      outs,
      bases: {
        first: Math.random() > 0.52,
        second: Math.random() > 0.68,
        third: Math.random() > 0.8,
      },
      countText: `${balls}-${strikes}`,
      demo: true,
      inning: inning ?? '▲7',
    };
  }
}
