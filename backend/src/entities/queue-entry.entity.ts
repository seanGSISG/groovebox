import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Room } from './room.entity';
import { User } from './user.entity';

@Entity('queue_entries')
@Index('idx_room_queue', ['roomId', 'isPlayed', 'createdAt'])
@Index('idx_youtube_video', ['youtubeVideoId'])
@Index('idx_duplicate_check', ['roomId', 'youtubeVideoId', 'isPlayed'])
export class QueueEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'room_id' })
  roomId: string;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: Room;

  @Column({ type: 'varchar', length: 20, name: 'youtube_video_id' })
  youtubeVideoId: string;

  @Column({ type: 'varchar', length: 500, name: 'youtube_url' })
  youtubeUrl: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255 })
  artist: string;

  @Column({ type: 'varchar', length: 500, name: 'thumbnail_url' })
  thumbnailUrl: string;

  @Column({ type: 'integer', name: 'duration_seconds' })
  durationSeconds: number;

  @Column({ type: 'uuid', name: 'added_by_id' })
  addedById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'added_by_id' })
  addedBy: User;

  @Column({ type: 'boolean', default: false, name: 'is_played' })
  isPlayed: boolean;

  @Column({ type: 'timestamptz', nullable: true, name: 'played_at' })
  playedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
