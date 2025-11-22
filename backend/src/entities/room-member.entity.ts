import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Room } from './room.entity';

export enum RoomMemberRole {
  OWNER = 'owner',
  DJ = 'dj',
  LISTENER = 'listener',
}

@Entity('room_members')
@Unique(['roomId', 'userId'])
@Index('idx_room_members', ['roomId', 'lastActive'])
@Index('idx_user_rooms', ['userId', 'joinedAt'])
export class RoomMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, (room) => room.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (user) => user.roomMemberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'varchar',
    length: 20,
    default: RoomMemberRole.LISTENER,
  })
  role: RoomMemberRole;

  @CreateDateColumn({ type: 'timestamptz', name: 'joined_at' })
  joinedAt: Date;

  @Column({ type: 'timestamptz', name: 'last_active', default: () => 'CURRENT_TIMESTAMP' })
  lastActive: Date;

  @Column({ type: 'integer', nullable: true, name: 'last_clock_offset_ms' })
  lastClockOffsetMs: number | null;

  @Column({ type: 'integer', nullable: true, name: 'average_rtt_ms' })
  averageRttMs: number | null;
}
