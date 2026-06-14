import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { ModuleRef } from '@nestjs/core';
import { LocalJsonStore } from '../persist/local-json-store';
import { StockStreamGateway } from '../amm/stock-stream.gateway';
import { isKboGameDay } from '../stats/game-day.util';
import { GamesService } from '../games/games.service';
import { KBO_TEAM_STOCKS, LineupSeed } from './market-lineup';
import { MarketService } from './market.service';
import { DisclosureItem, DisclosureKind } from './disclosure.types';
import { getMarketSession } from './market-session.util';

interface Template {
  kind: DisclosureKind;
  headline: (s: LineupSeed) => string;
  deltaPct: number;
}

interface DisclosureFeedFile {
  updatedAt: string;
  seq: number;
  items: DisclosureItem[];
}

const TEMPLATES: Template[] = [
  {
    kind: 'starter',
    headline: (s) => `[${s.teamShort}] ${s.playerName} 선발 확정 — 오늘 마운드/타선 핵심`,
    deltaPct: 2.2,
  },
  {
    kind: 'lineup',
    headline: (s) => `[${s.teamShort}] ${s.playerName} 1번·3번 타선 고정 — 감독 “오늘 간다”`,
    deltaPct: 1.4,
  },
  {
    kind: 'coach',
    headline: (s) => `[${s.teamShort}] ${s.playerName} 기용 확대 시사 — “흐름 탈 때까지”`,
    deltaPct: 1.8,
  },
  {
    kind: 'injury',
    headline: (s) => `[${s.teamShort}] ${s.playerName} 컨디션 체크 — 팀 트레이너 동행`,
    deltaPct: -2.8,
  },
  {
    kind: 'rumor',
    headline: (s) => `[찌라시] ${s.teamShort} ${s.playerName} 교체설 — 단장 “확인 중”`,
    deltaPct: -1.6,
  },
  {
    kind: 'rumor',
    headline: (s) => `[팀 SNS] ${s.playerName} “오늘 장난 없음” — 팬심 상승`,
    deltaPct: 1.2,
  },
];

@Injectable()
export class DisclosureService implements OnModuleInit {
  private readonly logger = new Logger(DisclosureService.name);
  private readonly store = new LocalJsonStore<DisclosureFeedFile>(
    'disclosure-feed.json',
  );
  private seq = 0;
  private feed: DisclosureItem[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly market: MarketService,
    private readonly games: GamesService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private seedAttempts = 0;

  onModuleInit(): void {
    if (this.config.get('DISCLOSURE_ENABLED') === 'false') return;
    this.loadFromDisk();
    if (this.feed.length === 0) {
      setTimeout(() => void this.seedBootFeed(), 8_000);
    } else {
      setTimeout(() => void this.pulse('boot').catch(() => {}), 12_000);
    }
  }

  /** 프리마켓·월요일 20분마다 공시 펄스 */
  @Cron('*/20 9-21 * * *', { timeZone: 'Asia/Seoul' })
  async scheduledPulse(): Promise<void> {
    if (this.config.get('DISCLOSURE_ENABLED') === 'false') return;
    const tz = this.config.get('GAMES_TZ') ?? 'Asia/Seoul';
    const gameDay = isKboGameDay(tz);
    const live = this.games.getTodayGames().some((g) => g.status === 'live');
    const session = getMarketSession({ timeZone: tz, hasLiveGame: live, isGameDay: gameDay });
    if (session.kind === 'closed' && gameDay) return;
    await this.pulse('cron');
  }

  getFeed(limit = 12): DisclosureItem[] {
    if (this.feed.length > 0) return this.feed.slice(0, limit);
    void this.scheduleSeedRetry();
    return this.buildStaticFeed(limit);
  }

  private buildStaticFeed(limit: number): DisclosureItem[] {
    const session = this.getSessionContext();
    const now = Date.now();
    const count = Math.min(limit, TEMPLATES.length, KBO_TEAM_STOCKS.length);
    return Array.from({ length: count }, (_, i) => {
      const tpl = TEMPLATES[i % TEMPLATES.length];
      const seed = KBO_TEAM_STOCKS[i % KBO_TEAM_STOCKS.length];
      return {
        id: `disc-static-${i}`,
        at: new Date(now - i * 480_000).toISOString(),
        session: session.label,
        kind: tpl.kind,
        headline: tpl.headline(seed),
        teamShort: seed.teamShort,
        playerName: seed.playerName,
        instrumentId: seed.id,
        priceDeltaPct: tpl.deltaPct,
        source: tpl.kind === 'rumor' ? 'team_feed' : 'kbo_official',
      };
    });
  }

  private scheduleSeedRetry(): void {
    if (this.seedAttempts >= 6 || this.feed.length >= 3) return;
    this.seedAttempts += 1;
    const delay = this.seedAttempts * 10_000;
    setTimeout(() => {
      void (async () => {
        if (this.feed.length >= 3) return;
        const item = await this.pulse(`retry-${this.seedAttempts}`);
        if (!item && this.seedAttempts < 6) this.scheduleSeedRetry();
        else if (this.feed.length < 3 && this.seedAttempts < 6) {
          this.scheduleSeedRetry();
        }
      })();
    }, delay);
  }

  getSessionContext(): ReturnType<typeof getMarketSession> {
    const tz = this.config.get('GAMES_TZ') ?? 'Asia/Seoul';
    const gameDay = isKboGameDay(tz);
    const live = this.games.getTodayGames().some((g) => g.status === 'live');
    return getMarketSession({ timeZone: tz, hasLiveGame: live, isGameDay: gameDay });
  }

  async pulse(trigger: string): Promise<DisclosureItem | null> {
    const session = this.getSessionContext();

    const seed = KBO_TEAM_STOCKS[Math.floor(Math.random() * KBO_TEAM_STOCKS.length)];
    const tpl = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    const sentimentDelta = tpl.deltaPct / 100;

    const inst = await this.market.applyDisclosureShock(seed.id, sentimentDelta);
    if (!inst) return null;

    const item: DisclosureItem = {
      id: `disc-${++this.seq}`,
      at: new Date().toISOString(),
      session: session.label,
      kind: tpl.kind,
      headline: tpl.headline(seed),
      teamShort: seed.teamShort,
      playerName: seed.playerName,
      instrumentId: seed.id,
      priceDeltaPct: tpl.deltaPct,
      source: tpl.kind === 'rumor' ? 'team_feed' : 'kbo_official',
    };

    this.feed.unshift(item);
    this.feed = this.feed.slice(0, 40);
    this.persistFeed();
    this.logger.debug(`공시 [${trigger}] ${item.headline} → ${tpl.deltaPct}%`);

    try {
      const gateway = this.moduleRef.get(StockStreamGateway, { strict: false });
      gateway?.broadcastLiveEvent('disclosure', { item, instrument: inst });
    } catch {
      /* optional */
    }

    return item;
  }

  private loadFromDisk(): void {
    const cached = this.store.load();
    if (!cached?.items?.length) return;
    this.feed = cached.items;
    this.seq = cached.seq ?? cached.items.length;
  }

  private persistFeed(): void {
    this.store.save({
      updatedAt: new Date().toISOString(),
      seq: this.seq,
      items: this.feed,
    });
  }

  private async seedBootFeed(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      const item = await this.pulse('boot-seed');
      if (item) await new Promise((r) => setTimeout(r, 400));
      else await new Promise((r) => setTimeout(r, 4_000));
    }
    if (this.feed.length < 3) this.scheduleSeedRetry();
  }
}
