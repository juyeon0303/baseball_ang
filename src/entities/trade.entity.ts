import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('trades')
export class TradeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  instrumentId: string;

  @Column({ nullable: true })
  instrumentName: string;

  @Column()
  action: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'bigint' })
  price: number;

  @Column({ type: 'bigint' })
  pointsDelta: number;

  @Column({ type: 'decimal', precision: 8, scale: 3 })
  oracleValue: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => UserEntity, (u) => u.trades, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', referencedColumnName: 'externalId' })
  user: UserEntity;
}
