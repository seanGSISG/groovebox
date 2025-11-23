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

  @Column({ type: 'uuid' })
  roomId: string;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: Room;

  @Column({ type: 'uuid' })
  submittedBy: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submittedBy' })
  submitter: User;

  @Column({ type: 'varchar', length: 500 })
  youtubeUrl: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  songTitle: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  artist: string;

  @Column({ type: 'integer', default: 0 })
  voteCount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  playedAt: Date;
}
