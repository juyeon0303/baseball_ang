import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CommunityService } from './community.service';

@Controller('amm/community')
export class CommunityController {
  constructor(private readonly community: CommunityService) {}

  @Get('feed')
  async getFeed(@Query('limit') limit?: string) {
    const n = Math.min(80, Math.max(1, parseInt(limit ?? '40', 10) || 40));
    return {
      title: '가가존',
      subtitle: '실시간 중계창',
      messages: await this.community.getFeed(n),
    };
  }

  @Post('chat')
  async postChat(
    @Body() body: { userId?: string; text?: string; gameId?: string },
  ) {
    const msg = await this.community.postChat(
      body.userId ?? 'guest',
      body.text ?? '',
      body.gameId,
    );
    return { success: true, message: msg };
  }

  @Post('reaction')
  async postReaction(@Body() body: { userId?: string; emoji?: string }) {
    const msg = await this.community.postReaction(
      body.userId ?? 'guest',
      body.emoji ?? '🔥',
    );
    return { success: true, message: msg };
  }
}
