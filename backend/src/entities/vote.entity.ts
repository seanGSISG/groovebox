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

export enum VoteType {
  DJ_ELECTION = 'dj_election',
  MUTINY = 'mutiny',
}

@Entity('votes')
@Unique(['roomId', 'voterId', 'voteSessionId'])
@Index('idx_active_votes', ['roomId', 'voteSessionId', 'isActive'])
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, (room) => room.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'uuid', name: 'voter_id' })
  voterId: string;

  @ManyToOne(() => User, (user) => user.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'voter_id' })
  voter: User;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'vote_type',
  })
  voteType: VoteType;

  @Column({ type: 'uuid', nullable: true, name: 'target_user_id' })
  targetUserId: string | null;

  @ManyToOne(() => User, (user) => user.receivedVotes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_user_id' })
  targetUser: User | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', nullable: true, name: 'vote_session_id' })
  voteSessionId: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;
}
