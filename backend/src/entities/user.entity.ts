import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { RoomMember } from './room-member.entity';
import { Room } from './room.entity';
import { Vote } from './vote.entity';
import { RoomDjHistory } from './room-dj-history.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @Index('idx_username')
  username: string;

  @Column({ type: 'varchar', length: 100, name: 'display_name' })
  displayName: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'password_hash' })
  passwordHash: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', name: 'last_seen', default: () => 'CURRENT_TIMESTAMP' })
  lastSeen: Date;

  // Relations
  @OneToMany(() => Room, (room) => room.owner)
  ownedRooms: Room[];

  @OneToMany(() => RoomMember, (roomMember) => roomMember.user)
  roomMemberships: RoomMember[];

  @OneToMany(() => Vote, (vote) => vote.voter)
  votes: Vote[];

  @OneToMany(() => Vote, (vote) => vote.targetUser)
  receivedVotes: Vote[];

  @OneToMany(() => RoomDjHistory, (djHistory) => djHistory.user)
  djHistory: RoomDjHistory[];
}
