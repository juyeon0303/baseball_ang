// src/amm/stock-stream.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CommunityService } from '../community/community.service';
import { PresenceService } from '../presence/presence.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class StockStreamGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly presence: PresenceService,
    private readonly community: CommunityService,
  ) {}

  handleConnection(client: Socket) {
    const liveCount = this.presence.join();
    this.server?.emit('presence', { liveCount });
  }

  handleDisconnect(client: Socket) {
    const liveCount = this.presence.leave();
    this.server?.emit('presence', { liveCount });
  }

  getLiveCount(): number {
    return this.presence.getCount();
  }

  // 🚪 유저가 특정 선수 방 입장 요청을 보냈을 때 처리
  @SubscribeMessage('subscribePlayer')
  handleSubscribePlayer(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    // 숫자로 들어오든 객체로 들어오든 다 발라내는 철벽 파싱
    const playerId = typeof data === 'object' && data !== null ? data.playerId : data;
    
    if (playerId) {
      client.join(String(playerId));
      client.join(`player_${playerId}`);
      console.log(`👤 [구독 완료] 유저[${client.id}]가 선수 방[${playerId}]에 입장함`);
    }
  }

  // 🎯 [핵심 교정] 시뮬레이터가 시세를 뿜을 때 어떤 버그도 허용하지 않는 융단폭격 메서드!
  broadcastPriceUpdate(item: any) {
    if (!this.server) return;

    // 1. [철벽 안전장치] 방 이름 검증 필요 없는 '전체 브로드캐스팅'으로 한 방 쏘고!
    this.server.emit('priceUpdate', item);
    this.server.emit('stockUpdate', item);

    // 2. [룸 타겟팅] 혹시 모를 멀티 채널 규격에 맞춰 방마다 쪼개서 한 번 더 쏩니다!
    this.server.to(String(item.id)).emit('priceUpdate', item);
    this.server.to(`player_${item.id}`).emit('priceUpdate', item);
  }

  broadcastTradeFeed(trade: {
    userId: string;
    action: string;
    instrumentName?: string;
    quantity: number;
    price: number;
  }): void {
    if (!this.server) return;
    this.server.emit('tradeFeed', trade);
  }

  broadcastGameUpdate(snapshot: unknown): void {
    if (!this.server) return;
    this.server.emit('gameUpdate', snapshot);
  }

  broadcastPlayFeed(play: unknown): void {
    if (!this.server) return;
    this.server.emit('playFeed', play);
  }

  broadcastCommunity(message: unknown): void {
    if (!this.server) return;
    this.server.emit('community', message);
  }

  @SubscribeMessage('sendChat')
  async handleSendChat(@MessageBody() data: Record<string, unknown>) {
    try {
      const msg = await this.community.postChat(
        String(data.userId ?? 'guest'),
        String(data.text ?? ''),
        data.gameId ? String(data.gameId) : undefined,
      );
      return { ok: true, message: msg };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  @SubscribeMessage('sendReaction')
  async handleSendReaction(@MessageBody() data: Record<string, unknown>) {
    try {
      const msg = await this.community.postReaction(
        String(data.userId ?? 'guest'),
        String(data.emoji ?? '🔥'),
      );
      return { ok: true, message: msg };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}