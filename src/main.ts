import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { assertValidDatabaseUrl } from './database/database-url.util';
import { isPostgresConfigured } from './persist/storage-mode';
import { mountProductionUis } from './web-ui.util';

async function bootstrap() {
  if (process.env.STORAGE_MODE === 'postgres' && !process.env.DATABASE_URL?.trim()) {
    console.error(
      '[boot] STORAGE_MODE=postgres 이지만 DATABASE_URL이 없습니다. 계정·지갑은 data/ JSON 파일로 임시 저장됩니다. Render Environment에 Supabase URI를 설정하세요.',
    );
  } else if (isPostgresConfigured()) {
    try {
      assertValidDatabaseUrl(process.env.DATABASE_URL!);
    } catch (e) {
      console.error('[boot]', e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const ui = mountProductionUis(app);

  app.enableCors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      process.env.WEB_URL,
      process.env.APP_URL,
      process.env.PUBLIC_URL,
    ].filter(Boolean) as string[],
    credentials: true,
  });

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);

  const publicUrl = process.env.PUBLIC_URL ?? `http://localhost:${port}`;
  if (ui.app) console.log(`플레이볼 — ${publicUrl}`);
  if (ui.stock) console.log(`YASDAQ(야스닥) — ${publicUrl}/stock/`);
  if (!ui.app && !ui.stock) {
    console.log(`API — http://localhost:${port}`);
    console.log(`로컬: npm run dev:app (:5174) · npm run dev:web (:5173)`);
  }
}

bootstrap().catch((err) => {
  console.error('[boot] Nest 시작 실패:', err);
  process.exit(1);
});
