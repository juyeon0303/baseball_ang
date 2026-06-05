import { Controller, Get } from '@nestjs/common';
import { resolveAppDist, resolveWebDist } from './web-ui.util';

@Controller()
export class AppController {
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
