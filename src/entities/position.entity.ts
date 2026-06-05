import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('positions')
export class PositionEntity {
  @PrimaryColumn()
  userId: string;

  @PrimaryColumn()
  instrumentId: string;

  @Column({ type: 'int', default: 0 })
  longShares: number;

  @Column({ type: 'int', default: 0 })
  shortShares: number;

  @ManyToOne(() => UserEntity, (u) => u.positions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
