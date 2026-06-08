import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { assertValidDatabaseUrl } from './database-url.util';

export function buildTypeOrmOptions(
  config: ConfigService,
  entities: Function[],
): TypeOrmModuleOptions {
  const url = config.get<string>('DATABASE_URL');
  const synchronize = config.get('DB_SYNCHRONIZE') !== 'false';

  const base: TypeOrmModuleOptions = {
    type: 'postgres',
    entities,
    synchronize,
    logging: config.get('DB_LOGGING') === 'true',
    retryAttempts: Number(config.get('DB_RETRY_ATTEMPTS') ?? 10),
    retryDelay: Number(config.get('DB_RETRY_DELAY_MS') ?? 3000),
    extra: {
      connectionTimeoutMillis: Number(
        config.get('DB_CONNECT_TIMEOUT_MS') ?? 10_000,
      ),
    },
  };

  const ssl = resolveSsl(config, url);
  if (ssl) {
    (base as { ssl?: unknown }).ssl = ssl;
  }

  if (url) {
    assertValidDatabaseUrl(url);
    return { ...base, url };
  }

  return {
    ...base,
    host: config.get<string>('DB_HOST') ?? 'localhost',
    port: Number(config.get('DB_PORT') ?? 5432),
    username: config.get<string>('DB_USER') ?? 'yagu',
    password: config.get<string>('DB_PASS') ?? 'yagu',
    database: config.get<string>('DB_NAME') ?? 'yagu_jusik',
  };
}

function resolveSsl(
  config: ConfigService,
  url?: string,
): false | { rejectUnauthorized: boolean } {
  const flag = config.get<string>('DATABASE_SSL');
  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') {
    return { rejectUnauthorized: false };
  }
  if (
    url &&
    (url.includes('supabase') ||
      url.includes('render.com') ||
      url.includes('neon.tech'))
  ) {
    return { rejectUnauthorized: false };
  }
  return false;
}
