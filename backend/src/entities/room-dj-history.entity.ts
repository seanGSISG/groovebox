import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Room } from './room.entity';

export enum RemovalReason {
  MUTINY = 'mutiny',
  VOLUNTARY = 'voluntary',
  DISCONNECT = 'disconnect',
  VOTE = 'vote',
}

@Entity('room_dj_history')
@Index('idx_room_current_dj', ['roomId', 'removedAt'])
@Index('idx_dj_history', ['roomId', 'becameDjAt'])
export class RoomDjHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, (room) => room.djHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.djHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz', name: 'became_dj_at' })
  becameDjAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'removed_at' })
  removedAt: Date | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'removal_reason' })
  removalReason: RemovalReason | null;
}
