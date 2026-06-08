import { existsSync } from 'fs';
import { join } from 'path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';

/** 플레이볼 앱 (app/dist) — 배포 시 / */
export function resolveAppDist(): string | null {
  const candidates = [
    join(process.cwd(), 'app', 'dist'),
    join(__dirname, '..', 'app', 'dist'),
  ];
  return (
    candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? null
  );
}

/** YASDAQ 웹 (web/dist) — 배포 시 /stock/ */
export function resolveWebDist(): string | null {
  const candidates = [
    join(process.cwd(), 'web', 'dist'),
    join(__dirname, '..', 'web', 'dist'),
  ];
  return (
    candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? null
  );
}

export function mountProductionUis(app: NestExpressApplication): {
  app: boolean;
  stock: boolean;
} {
  const appDist = resolveAppDist();
  const webDist = resolveWebDist();
  const http = app.getHttpAdapter().getInstance();

  if (webDist) {
    app.useStaticAssets(webDist, {
      prefix: '/stock/assets',
      index: false,
      redirect: false,
    });
  }

  if (appDist) {
    app.useStaticAssets(appDist, { index: false });
    http.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/amm') ||
        req.path.startsWith('/socket.io') ||
        req.path.startsWith('/api') ||
        req.path.startsWith('/stock')
      ) {
        return next();
      }
      if (req.path.includes('.')) {
        return next();
      }
      return res.sendFile(join(appDist, 'index.html'));
    });
  }

  return { app: !!appDist, stock: !!webDist };
}

/** @deprecated use mountProductionUis */
export function mountWebUi(app: NestExpressApplication): boolean {
  const r = mountProductionUis(app);
  return r.app;
}
