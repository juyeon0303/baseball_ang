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
import { AuthAccountService } from './auth-account.service';
import { SessionAuthService } from './session-auth.service';

@Controller('amm/auth')
export class AuthController {
  constructor(
    private readonly auth: SessionAuthService,
    private readonly accounts: AuthAccountService,
    private readonly market: MarketService,
  ) {}

  @Post('register')
  async register(
    @Body() body: { nickname?: string; pin?: string; deviceId?: string },
  ) {
    const account = await this.accounts.register(
      body.nickname ?? '',
      body.pin ?? '',
    );
    await this.market.getPortfolio(account.accountId);
    const session = this.auth.openSession(
      account.accountId,
      account.displayName,
      account.nickname,
      body.deviceId,
    );
    return this.auth.toPublic(session);
  }

  @Post('login')
  async login(@Body() body: { nickname?: string; pin?: string; deviceId?: string }) {
    const account = await this.accounts.login(body.nickname ?? '', body.pin ?? '');
    await this.market.getPortfolio(account.accountId);
    const session = this.auth.openSession(
      account.accountId,
      account.displayName,
      account.nickname,
      body.deviceId,
    );
    return this.auth.toPublic(session);
  }

  /** @deprecated 게스트 자동가입 — 닉+PIN 가입 권장 */
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
  async me(@Headers('authorization') authorization?: string) {
    const record = this.auth.requireBearer(authorization);
    await this.accounts.warmDisplayName(record.accountId);
    return {
      accountId: record.accountId,
      displayName: this.auth.getDisplayName(record.accountId),
      nickname: record.nickname ?? record.displayName,
      createdAt: record.createdAt,
    };
  }

  @Patch('profile')
  async updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: { displayName?: string },
  ) {
    const record = this.auth.requireBearer(authorization);
    const name = await this.accounts.updateDisplayName(
      record.accountId,
      body.displayName ?? '',
    );
    record.displayName = name;
    return { displayName: name };
  }
}
