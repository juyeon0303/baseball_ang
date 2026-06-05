import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('price_snapshots')
@Index(['instrumentId', 'createdAt'])
export class PriceSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  instrumentId: string;

  @Column({ type: 'bigint' })
  price: number;

  @Column({ type: 'bigint' })
  fairPrice: number;

  @Column({ type: 'decimal', precision: 8, scale: 3 })
  oracleValue: number;

  @Column({ type: 'decimal', precision: 8, scale: 5 })
  sentiment: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
