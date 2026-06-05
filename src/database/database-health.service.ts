import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseHealthService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseHealthService.name);
  private connected = false;
  private lastError: string | null = null;

  constructor(
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.dataSource?.isInitialized) return;
    await this.ping();
  }

  async ping(): Promise<boolean> {
    if (!this.dataSource?.isInitialized) {
      this.connected = false;
      return false;
    }
    try {
      await this.dataSource.query('SELECT 1');
      this.connected = true;
      this.lastError = null;
      this.logger.log('Postgres 연결 확인');
      return true;
    } catch (e) {
      this.connected = false;
      this.lastError = String(e);
      this.logger.error(`Postgres 연결 실패: ${e}`);
      return false;
    }
  }

  getStatus() {
    return {
      enabled: !!this.dataSource,
      connected: this.connected,
      error: this.lastError,
    };
  }
}
