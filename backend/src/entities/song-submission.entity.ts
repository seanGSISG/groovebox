import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Room } from './room.entity';
import { User } from './user.entity';

@Entity('song_submissions')
@Index(['roomId', 'isActive'])
export class SongSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'uuid', name: 'submitted_by' })
  submittedBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submitted_by' })
  submitter: User;

  @Column({ type: 'varchar', length: 500, name: 'youtube_url' })
  youtubeUrl: string;

  @Column({ type: 'varchar', length: 200, nullable: true, name: 'song_title' })
  songTitle: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  artist: string | null;

  @Column({ type: 'integer', default: 0, name: 'vote_count' })
  voteCount: number;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'played_at' })
  playedAt: Date | null;
}
