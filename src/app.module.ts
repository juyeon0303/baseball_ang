import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AmmEngineService } from './amm/amm-engine.service';
import { StockStreamGateway } from './amm/stock-stream.gateway';
import { AmmController } from './amm.controller';
import { AppController } from './app.controller';
import { InstrumentEntity } from './entities/instrument.entity';
import { PositionEntity } from './entities/position.entity';
import { PriceSnapshotEntity } from './entities/price-snapshot.entity';
import { TradeEntity } from './entities/trade.entity';
import { UserWeekStatEntity } from './entities/user-week-stat.entity';
import { UserEntity } from './entities/user.entity';
import { MemoryMarketStoreService } from './market/memory-market-store.service';
import { MARKET_STORE } from './market/market-store.interface';
import { MarketService } from './market/market.service';
import { PostgresMarketStoreService } from './market/postgres-market-store.service';
import { PricingService } from './market/pricing.service';
import { GamesService } from './games/games.service';
import { PresenceService } from './presence/presence.service';
import { HubService } from './hub/hub.service';
import { KboRecordProvider } from './stats/kbo-record.provider';
import { MlbRecordProvider } from './stats/mlb-record.provider';
import { LiveStatsSyncService } from './stats/live-stats-sync.service';

const ENTITIES = [
  InstrumentEntity,
  UserEntity,
  PositionEntity,
  TradeEntity,
  UserWeekStatEntity,
  PriceSnapshotEntity,
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
            useFactory: (config: ConfigService) => {
              const url = config.get<string>('DATABASE_URL');
              const base = {
                type: 'postgres' as const,
                entities: ENTITIES,
                synchronize: config.get('DB_SYNCHRONIZE') !== 'false',
                ssl: { rejectUnauthorized: false },
              };
              if (url) {
                return { ...base, url };
              }
              return {
                ...base,
                host: config.get<string>('DB_HOST'),
                port: Number(config.get('DB_PORT') ?? 5432),
                username: config.get<string>('DB_USER'),
                password: config.get<string>('DB_PASS'),
                database: config.get<string>('DB_NAME'),
              };
            },
          }),
          TypeOrmModule.forFeature(ENTITIES),
        ]
      : []),
  ],
  controllers: [AmmController, AppController],
  providers: [
    PricingService,
    MemoryMarketStoreService,
    ...(usePostgres ? [PostgresMarketStoreService] : []),
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
    PresenceService,
    GamesService,
    HubService,
    KboRecordProvider,
    MlbRecordProvider,
    LiveStatsSyncService,
    MarketService,
    AmmEngineService,
    StockStreamGateway,
  ],
})
export class AppModule {}
