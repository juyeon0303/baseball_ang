import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Post,
} from '@nestjs/common';
import { MarketService } from '../market/market.service';
import { SessionAuthService } from './session-auth.service';

@Controller('amm/auth')
export class AuthController {
  constructor(
    private readonly auth: SessionAuthService,
    private readonly market: MarketService,
  ) {}

  @Post('bootstrap')
  async bootstrap(@Body() body: { deviceId?: string }) {
    if (!body.deviceId?.trim()) {
      throw new BadRequestException('deviceId가 필요합니다.');
    }
    const record = this.auth.bootstrap(body.deviceId.trim());
    await this.market.getPortfolio(record.accountId);
    return this.auth.toPublic(record);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const record = this.auth.requireBearer(authorization);
    return {
      accountId: record.accountId,
      displayName: record.displayName,
      createdAt: record.createdAt,
    };
  }

  @Patch('profile')
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { displayName?: string },
  ) {
    const record = this.auth.requireBearer(authorization);
    const updated = this.auth.updateDisplayName(
      record.accountId,
      body.displayName ?? '',
    );
    return { displayName: updated.displayName };
  }
}
