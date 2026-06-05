import { Controller, Get, Req, Res } from '@nestjs/common';
import { join } from 'path';
import type { Request, Response } from 'express';
import { resolveAppDist, resolveWebDist } from './web-ui.util';

@Controller()
export class AppController {
  @Get(['stock', 'stock/'])
  serveStock(@Req() req: Request, @Res() res: Response) {
    const webDist = resolveWebDist();
    if (!webDist) {
      return res.status(404).json({ message: 'stock web not built' });
    }
    if (req.path === '/stock') {
      return res.redirect(302, '/stock/');
    }
    return res.sendFile(join(webDist, 'index.html'));
  }

  @Get('api')
  getApiInfo() {
    return {
      service: 'baseball-backend',
      version: '0.1.0',
      appUi: resolveAppDist() ? 'served at /' : 'http://localhost:5174',
      stockWeb: resolveWebDist()
        ? 'served at /stock/'
        : (process.env.WEB_URL ?? 'http://localhost:5173'),
      endpoints: {
        games: '/amm/games/today',
        community: '/amm/community/feed',
        hub: '/amm/hub',
      },
    };
  }
}
