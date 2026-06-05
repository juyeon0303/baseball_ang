import { BadRequestException, Injectable } from '@nestjs/common';
import { resolveInstrumentId } from '../market/market-lineup';
import { MarketService } from '../market/market.service';
import { OrderSide } from '../market/market.types';

@Injectable()
export class AmmEngineService {
  constructor(private readonly market: MarketService) {}

  async getLineup() {
    return this.market.getLineup();
  }

  async executeBuy(
    userId: string,
    playerId: number | string,
    quantity: number,
    side: OrderSide = 'long',
  ) {
    const instrumentId = this.resolveInstrumentId(playerId);
    return this.market.executeBuy(userId, instrumentId, quantity, side);
  }

  async executeSell(
    userId: string,
    playerId: number | string,
    quantity: number,
    side: OrderSide = 'long',
  ) {
    const instrumentId = this.resolveInstrumentId(playerId);
    return this.market.executeSell(userId, instrumentId, quantity, side);
  }

  resolveInstrumentId(playerId: number | string): string {
    const id = resolveInstrumentId(playerId);
    if (!id) {
      throw new BadRequestException(
        'playerId(1~10) 또는 instrumentId(예: lee-jung-hoo, kia-kim)를 확인하세요.',
      );
    }
    return id;
  }
}
