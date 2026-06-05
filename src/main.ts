import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { mountProductionUis } from './web-ui.util';

async function bootstrap() {
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
  if (ui.stock) console.log(`야구주식 — ${publicUrl}/stock/`);
  if (!ui.app && !ui.stock) {
    console.log(`API — http://localhost:${port}`);
    console.log(`로컬: npm run dev:app (:5174) · npm run dev:web (:5173)`);
  }
}

bootstrap();
