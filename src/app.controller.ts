import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { resolveIndexHtml } from './paths.util';

@Controller()
export class AppController {
  @Get()
  getHome(@Res() res: Response) {
    return res.sendFile(resolveIndexHtml());
  }
}
