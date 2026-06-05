import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('instruments')
export class InstrumentEntity {
  @PrimaryColumn()
  id: string;

  @Column()
  name: string;

  @Column()
  symbol: string;

  @Column()
  teamName: string;

  @Column()
  teamShort: string;

  @Column()
  playerName: string;

  @Column()
  metric: string;

  @Column()
  metricLabel: string;

  @Column({ type: 'decimal', precision: 8, scale: 3 })
  oracleValue: number;

  @Column({ type: 'decimal', precision: 8, scale: 5, default: 1 })
  sentiment: number;

  @Column({ type: 'bigint' })
  fairPrice: number;

  @Column({ type: 'bigint' })
  price: number;

  @Column()
  accent: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
