import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmmEngineService } from './amm/amm-engine.service';
import { StockStreamGateway } from './amm/stock-stream.gateway';
import { AmmController } from './amm.controller';
import { AppController } from './app.controller';
import { CommunityController } from './community/community.controller';
import { COMMUNITY_STORE } from './community/community-store.interface';
import { CommunityService } from './community/community.service';
import { MemoryCommunityStoreService } from './community/memory-community-store.service';
import { PostgresCommunityStoreService } from './community/postgres-community-store.service';
import { DatabaseHealthService } from './database/database-health.service';
import { buildTypeOrmOptions } from './database/typeorm.factory';
import { CommunityMessageEntity } from './entities/community-message.entity';
import { InstrumentEntity } from './entities/instrument.entity';
import { PositionEntity } from './entities/position.entity';
import { PriceSnapshotEntity } from './entities/price-snapshot.entity';
import { TradeEntity } from './entities/trade.entity';
import { UserWeekStatEntity } from './entities/user-week-stat.entity';
import { UserEntity } from './entities/user.entity';
import { GamesController } from './games/games.controller';
import { GamesSyncService } from './games/games-sync.service';
import { GamesService } from './games/games.service';
import { KboScoreProvider } from './games/kbo-score.provider';
import { HubService } from './hub/hub.service';
import { MemoryMarketStoreService } from './market/memory-market-store.service';
import { MARKET_STORE } from './market/market-store.interface';
import { MarketService } from './market/market.service';
import { PostgresMarketStoreService } from './market/postgres-market-store.service';
import { PricingService } from './market/pricing.service';
import { PresenceService } from './presence/presence.service';
import { KboRecordProvider } from './stats/kbo-record.provider';
import { LiveStatsSyncService } from './stats/live-stats-sync.service';
import { MemeOracleProvider } from './stats/meme-oracle.provider';
import { MemeSyncService } from './stats/meme-sync.service';
import { MlbRecordProvider } from './stats/mlb-record.provider';

const ENTITIES = [
  InstrumentEntity,
  UserEntity,
  PositionEntity,
  TradeEntity,
  UserWeekStatEntity,
  PriceSnapshotEntity,
  CommunityMessageEntity,
];

const usePostgres = process.env.STORAGE_MODE === 'postgres';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ...(usePostgres
      ? [
          TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) =>
              buildTypeOrmOptions(config, ENTITIES),
          }),
          TypeOrmModule.forFeature(ENTITIES),
        ]
      : []),
  ],
  controllers: [AmmController, GamesController, CommunityController, AppController],
  providers: [
    PricingService,
    MemoryMarketStoreService,
    MemoryCommunityStoreService,
    ...(usePostgres
      ? [PostgresMarketStoreService, PostgresCommunityStoreService]
      : []),
    {
      provide: MARKET_STORE,
      useFactory: (
        memory: MemoryMarketStoreService,
        config: ConfigService,
        postgres?: PostgresMarketStoreService,
      ) => {
        if (config.get('STORAGE_MODE') === 'postgres' && postgres) {
          return postgres;
        }
        return memory;
      },
      inject: usePostgres
        ? [MemoryMarketStoreService, ConfigService, PostgresMarketStoreService]
        : [MemoryMarketStoreService, ConfigService],
    },
    {
      provide: COMMUNITY_STORE,
      useFactory: (
        memory: MemoryCommunityStoreService,
        config: ConfigService,
        postgres?: PostgresCommunityStoreService,
      ) => {
        if (config.get('STORAGE_MODE') === 'postgres' && postgres) {
          return postgres;
        }
        return memory;
      },
      inject: usePostgres
        ? [
            MemoryCommunityStoreService,
            ConfigService,
            PostgresCommunityStoreService,
          ]
        : [MemoryCommunityStoreService, ConfigService],
    },
    DatabaseHealthService,
    PresenceService,
    KboScoreProvider,
    GamesService,
    GamesSyncService,
    HubService,
    KboRecordProvider,
    MlbRecordProvider,
    LiveStatsSyncService,
    MemeOracleProvider,
    MemeSyncService,
    CommunityService,
    MarketService,
    AmmEngineService,
    StockStreamGateway,
  ],
})
export class AppModule {}
