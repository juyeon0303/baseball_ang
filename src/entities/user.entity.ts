import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { PositionEntity } from './position.entity';
import { TradeEntity } from './trade.entity';

@Entity('users')
export class UserEntity {
  @PrimaryColumn()
  externalId: string;

  @Column({ type: 'varchar', length: 24, unique: true, nullable: true })
  nickname: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true, select: false })
  pinHash: string | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  displayName: string | null;

  @Column({ type: 'bigint', default: 100_000 })
  points: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => PositionEntity, (p) => p.user)
  positions: PositionEntity[];

  @OneToMany(() => TradeEntity, (t) => t.user)
  trades: TradeEntity[];
}
