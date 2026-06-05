import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user_week_stats')
export class UserWeekStatEntity {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  weekKey: string;

  @Column({ type: 'bigint' })
  startEquity: number;

  @Column({ type: 'int', default: 0 })
  opsTradeCount: number;
}
