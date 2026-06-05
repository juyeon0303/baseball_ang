import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('community_messages')
export class CommunityMessageEntity {
  @PrimaryColumn()
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;

  @Column({ length: 16 })
  kind: string;

  @Column({ nullable: true, length: 16 })
  userId?: string;

  @Column({ type: 'varchar', length: 200 })
  text: string;

  @Column({ nullable: true, length: 64 })
  gameId?: string;

  @Column({ nullable: true, length: 64 })
  instrumentId?: string;

  @Column({ nullable: true, length: 8 })
  emoji?: string;
}
