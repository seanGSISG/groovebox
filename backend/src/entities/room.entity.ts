import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { RoomMember } from './room-member.entity';
import { Vote } from './vote.entity';
import { RoomDjHistory } from './room-dj-history.entity';

export interface RoomSettings {
  maxMembers: number;
  mutinyThreshold: number;
  djCooldownMinutes: number;
  autoRandomizeDJ: boolean;
}

@Entity('rooms')
@Index('idx_active_rooms', ['isActive', 'createdAt'])
export class Room {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10, unique: true, name: 'room_code' })
  @Index('idx_room_code')
  roomCode: string;

  @Column({ type: 'varchar', length: 100, name: 'room_name' })
  roomName: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'password_hash' })
  passwordHash: string | null;

  @Column({ type: 'uuid', nullable: true, name: 'owner_id' })
  ownerId: string | null;

  @ManyToOne(() => User, (user) => user.ownedRooms, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  @Column({
    type: 'jsonb',
    default: {
      maxMembers: 50,
      mutinyThreshold: 0.51,
      djCooldownMinutes: 5,
      autoRandomizeDJ: false,
    },
  })
  settings: RoomSettings;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  // Relations
  @OneToMany(() => RoomMember, (roomMember) => roomMember.room)
  members: RoomMember[];

  @OneToMany(() => Vote, (vote) => vote.room)
  votes: Vote[];

  @OneToMany(() => RoomDjHistory, (djHistory) => djHistory.room)
  djHistory: RoomDjHistory[];
}
