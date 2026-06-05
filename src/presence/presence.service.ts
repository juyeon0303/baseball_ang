import { Injectable } from '@nestjs/common';

@Injectable()
export class PresenceService {
  private count = 0;

  join(): number {
    this.count += 1;
    return this.count;
  }

  leave(): number {
    this.count = Math.max(0, this.count - 1);
    return this.count;
  }

  getCount(): number {
    return this.count;
  }
}
