import { existsSync } from 'fs';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { resolveIndexHtml, resolveStaticDir } from './paths.util';

async function bootstrap() {
  const indexPath = resolveIndexHtml();
  if (!existsSync(indexPath)) {
    console.error(`[FATAL] index.html 없음: ${indexPath}`);
  } else {
    console.log(`[UI] ${indexPath}`);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors();
  app.useStaticAssets(resolveStaticDir(), { index: false });

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);

  const publicUrl = process.env.PUBLIC_URL;
  console.log(`야구주식 MVP — http://localhost:${port}`);
  if (publicUrl) {
    console.log(`공개 URL — ${publicUrl}`);
  }
}
bootstrap();
