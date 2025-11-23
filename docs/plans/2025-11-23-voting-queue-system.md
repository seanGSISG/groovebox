# Voting-Based Music Queue Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a Reddit-style voting system where chat participants submit YouTube song URLs and upvote submissions, with the highest-voted song playing next when the current song ends.

**Architecture:** Extend existing room/playback system with SongSubmission entity for tracking YouTube URLs and votes. Use Redis for real-time vote counting and PostgreSQL for persistence. WebSocket events broadcast vote changes in real-time. When a song ends, the highest-voted submission auto-plays and is removed from the queue.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Redis, Socket.io (backend); React Native, Socket.io-client (frontend)

---

## Task 1: Create SongSubmission Database Entity

**Files:**
- Create: `backend/src/entities/song-submission.entity.ts`
- Modify: `backend/src/entities/index.ts`
- Create: `backend/src/database/migrations/1732320000000-AddSongSubmissions.ts`

**Step 1: Write SongSubmission entity**

Create `backend/src/entities/song-submission.entity.ts`:

```typescript
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
```

**Step 2: Export entity from index**

Modify `backend/src/entities/index.ts`:

```typescript
export * from './user.entity';
export * from './room.entity';
export * from './room-member.entity';
export * from './vote.entity';
export * from './room-dj-history.entity';
export * from './message.entity';
export * from './song-submission.entity';
```

**Step 3: Create migration**

Create `backend/src/database/migrations/1732320000000-AddSongSubmissions.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class AddSongSubmissions1732320000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'song_submissions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'roomId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'submittedBy',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'youtubeUrl',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'songTitle',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'artist',
            type: 'varchar',
            length: '200',
            isNullable: true,
          },
          {
            name: 'voteCount',
            type: 'integer',
            default: 0,
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'playedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'song_submissions',
      new TableIndex({
        name: 'IDX_song_submissions_room_active',
        columnNames: ['roomId', 'isActive'],
      }),
    );

    await queryRunner.createForeignKey(
      'song_submissions',
      new TableForeignKey({
        columnNames: ['roomId'],
        referencedTableName: 'rooms',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'song_submissions',
      new TableForeignKey({
        columnNames: ['submittedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('song_submissions');
  }
}
```

**Step 4: Commit**

```bash
git add backend/src/entities/song-submission.entity.ts backend/src/entities/index.ts backend/src/database/migrations/1732320000000-AddSongSubmissions.ts
git commit -m "feat: add SongSubmission entity and migration"
```

---

## Task 2: Create SongSubmissionVote Entity for Individual Votes

**Files:**
- Create: `backend/src/entities/song-submission-vote.entity.ts`
- Modify: `backend/src/entities/index.ts`
- Modify: `backend/src/database/migrations/1732320000000-AddSongSubmissions.ts`

**Step 1: Write SongSubmissionVote entity**

Create `backend/src/entities/song-submission-vote.entity.ts`:

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { SongSubmission } from './song-submission.entity';
import { User } from './user.entity';

@Entity('song_submission_votes')
@Unique(['submissionId', 'userId'])
export class SongSubmissionVote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  submissionId: string;

  @ManyToOne(() => SongSubmission, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submissionId' })
  submission: SongSubmission;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Step 2: Export entity from index**

Modify `backend/src/entities/index.ts`:

```typescript
export * from './user.entity';
export * from './room.entity';
export * from './room-member.entity';
export * from './vote.entity';
export * from './room-dj-history.entity';
export * from './message.entity';
export * from './song-submission.entity';
export * from './song-submission-vote.entity';
```

**Step 3: Update migration to include votes table**

Modify `backend/src/database/migrations/1732320000000-AddSongSubmissions.ts` by adding to the `up` method after the song_submissions table creation:

```typescript
    await queryRunner.createTable(
      new Table({
        name: 'song_submission_votes',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'submissionId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'song_submission_votes',
      new TableIndex({
        name: 'IDX_song_submission_votes_unique',
        columnNames: ['submissionId', 'userId'],
        isUnique: true,
      }),
    );

    await queryRunner.createForeignKey(
      'song_submission_votes',
      new TableForeignKey({
        columnNames: ['submissionId'],
        referencedTableName: 'song_submissions',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'song_submission_votes',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
```

And update the `down` method:

```typescript
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('song_submission_votes');
    await queryRunner.dropTable('song_submissions');
  }
```

**Step 4: Commit**

```bash
git add backend/src/entities/song-submission-vote.entity.ts backend/src/entities/index.ts backend/src/database/migrations/1732320000000-AddSongSubmissions.ts
git commit -m "feat: add SongSubmissionVote entity for tracking individual votes"
```

---

## Task 3: Create DTOs for Queue Operations

**Files:**
- Create: `backend/src/queue/dto/submit-song.dto.ts`
- Create: `backend/src/queue/dto/vote-submission.dto.ts`
- Create: `backend/src/queue/dto/song-submission.dto.ts`
- Create: `backend/src/queue/dto/queue-state.dto.ts`
- Create: `backend/src/queue/dto/index.ts`

**Step 1: Create submit-song DTO**

Create `backend/src/queue/dto/submit-song.dto.ts`:

```typescript
import { IsString, IsUrl, Matches, IsOptional, MaxLength } from 'class-validator';

export class SubmitSongDto {
  @IsString()
  @IsUrl()
  @Matches(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/, {
    message: 'Must be a valid YouTube URL',
  })
  youtubeUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  songTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  artist?: string;
}
```

**Step 2: Create vote-submission DTO**

Create `backend/src/queue/dto/vote-submission.dto.ts`:

```typescript
import { IsUUID } from 'class-validator';

export class VoteSubmissionDto {
  @IsUUID()
  submissionId: string;
}
```

**Step 3: Create song-submission response DTO**

Create `backend/src/queue/dto/song-submission.dto.ts`:

```typescript
export class SongSubmissionDto {
  id: string;
  roomId: string;
  submittedBy: string;
  submitterUsername: string;
  submitterDisplayName: string;
  youtubeUrl: string;
  songTitle: string | null;
  artist: string | null;
  voteCount: number;
  hasVoted: boolean; // Has current user voted for this
  createdAt: Date;
}
```

**Step 4: Create queue-state DTO**

Create `backend/src/queue/dto/queue-state.dto.ts`:

```typescript
import { SongSubmissionDto } from './song-submission.dto';

export class QueueStateDto {
  submissions: SongSubmissionDto[];
  totalSubmissions: number;
}
```

**Step 5: Create index for exports**

Create `backend/src/queue/dto/index.ts`:

```typescript
export * from './submit-song.dto';
export * from './vote-submission.dto';
export * from './song-submission.dto';
export * from './queue-state.dto';
```

**Step 6: Commit**

```bash
git add backend/src/queue/dto/
git commit -m "feat: add DTOs for queue operations"
```

---

## Task 4: Create Queue Service with Core Logic

**Files:**
- Create: `backend/src/queue/queue.service.ts`
- Create: `backend/src/queue/queue.module.ts`

**Step 1: Create queue service**

Create `backend/src/queue/queue.service.ts`:

```typescript
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SongSubmission, SongSubmissionVote, User } from '../entities';
import { SubmitSongDto, SongSubmissionDto, QueueStateDto } from './dto';

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(SongSubmission)
    private songSubmissionRepository: Repository<SongSubmission>,
    @InjectRepository(SongSubmissionVote)
    private voteRepository: Repository<SongSubmissionVote>,
  ) {}

  async submitSong(
    roomId: string,
    userId: string,
    submitSongDto: SubmitSongDto,
  ): Promise<SongSubmission> {
    // Check if URL already submitted and active in this room
    const existing = await this.songSubmissionRepository.findOne({
      where: {
        roomId,
        youtubeUrl: submitSongDto.youtubeUrl,
        isActive: true,
      },
    });

    if (existing) {
      throw new BadRequestException('This song is already in the queue');
    }

    const submission = this.songSubmissionRepository.create({
      roomId,
      submittedBy: userId,
      youtubeUrl: submitSongDto.youtubeUrl,
      songTitle: submitSongDto.songTitle,
      artist: submitSongDto.artist,
      voteCount: 1, // Auto-upvote by submitter
    });

    const saved = await this.songSubmissionRepository.save(submission);

    // Auto-vote by submitter
    const vote = this.voteRepository.create({
      submissionId: saved.id,
      userId,
    });
    await this.voteRepository.save(vote);

    return saved;
  }

  async getQueueState(roomId: string, currentUserId: string): Promise<QueueStateDto> {
    const submissions = await this.songSubmissionRepository
      .createQueryBuilder('submission')
      .leftJoinAndSelect('submission.submitter', 'submitter')
      .leftJoin('submission.room', 'room')
      .where('submission.roomId = :roomId', { roomId })
      .andWhere('submission.isActive = :isActive', { isActive: true })
      .orderBy('submission.voteCount', 'DESC')
      .addOrderBy('submission.createdAt', 'ASC')
      .getMany();

    // Get user's votes for all submissions
    const userVotes = await this.voteRepository.find({
      where: {
        userId: currentUserId,
        submissionId: submissions.map(s => s.id) as any,
      },
    });

    const userVoteMap = new Set(userVotes.map(v => v.submissionId));

    const submissionDtos: SongSubmissionDto[] = submissions.map(sub => ({
      id: sub.id,
      roomId: sub.roomId,
      submittedBy: sub.submittedBy,
      submitterUsername: (sub.submitter as any).username,
      submitterDisplayName: (sub.submitter as any).displayName,
      youtubeUrl: sub.youtubeUrl,
      songTitle: sub.songTitle,
      artist: sub.artist,
      voteCount: sub.voteCount,
      hasVoted: userVoteMap.has(sub.id),
      createdAt: sub.createdAt,
    }));

    return {
      submissions: submissionDtos,
      totalSubmissions: submissions.length,
    };
  }

  async voteForSubmission(submissionId: string, userId: string): Promise<SongSubmission> {
    const submission = await this.songSubmissionRepository.findOne({
      where: { id: submissionId, isActive: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Check if already voted
    const existingVote = await this.voteRepository.findOne({
      where: { submissionId, userId },
    });

    if (existingVote) {
      throw new BadRequestException('You have already voted for this song');
    }

    // Create vote
    const vote = this.voteRepository.create({
      submissionId,
      userId,
    });
    await this.voteRepository.save(vote);

    // Increment vote count
    submission.voteCount += 1;
    return await this.songSubmissionRepository.save(submission);
  }

  async unvoteSubmission(submissionId: string, userId: string): Promise<SongSubmission> {
    const submission = await this.songSubmissionRepository.findOne({
      where: { id: submissionId, isActive: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const vote = await this.voteRepository.findOne({
      where: { submissionId, userId },
    });

    if (!vote) {
      throw new BadRequestException('You have not voted for this song');
    }

    // Remove vote
    await this.voteRepository.remove(vote);

    // Decrement vote count
    submission.voteCount = Math.max(0, submission.voteCount - 1);
    return await this.songSubmissionRepository.save(submission);
  }

  async getTopSubmission(roomId: string): Promise<SongSubmission | null> {
    return await this.songSubmissionRepository.findOne({
      where: { roomId, isActive: true },
      order: {
        voteCount: 'DESC',
        createdAt: 'ASC',
      },
    });
  }

  async markAsPlayed(submissionId: string): Promise<void> {
    await this.songSubmissionRepository.update(submissionId, {
      isActive: false,
      playedAt: new Date(),
    });
  }

  async removeSubmission(submissionId: string, userId: string): Promise<void> {
    const submission = await this.songSubmissionRepository.findOne({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Only submitter can remove their own submission
    if (submission.submittedBy !== userId) {
      throw new BadRequestException('You can only remove your own submissions');
    }

    await this.songSubmissionRepository.remove(submission);
  }
}
```

**Step 2: Create queue module**

Create `backend/src/queue/queue.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { SongSubmission, SongSubmissionVote } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([SongSubmission, SongSubmissionVote])],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
```

**Step 3: Commit**

```bash
git add backend/src/queue/queue.service.ts backend/src/queue/queue.module.ts
git commit -m "feat: add QueueService with core voting logic"
```

---

## Task 5: Add Queue WebSocket Events to Room Gateway

**Files:**
- Modify: `backend/src/gateway/room.gateway.ts`
- Modify: `backend/src/gateway/gateway.module.ts`

**Step 1: Import queue dependencies in gateway module**

Modify `backend/src/gateway/gateway.module.ts` to import QueueModule:

```typescript
import { Module } from '@nestjs/common';
import { RoomGateway } from './room.gateway';
import { SyncGateway } from '../sync/sync.gateway';
import { RoomsModule } from '../rooms/rooms.module';
import { RedisModule } from '../redis/redis.module';
import { QueueModule } from '../queue/queue.module';
import { PlaybackSyncService } from './services/playback-sync.service';

@Module({
  imports: [RoomsModule, RedisModule, QueueModule],
  providers: [RoomGateway, SyncGateway, PlaybackSyncService],
})
export class GatewayModule {}
```

**Step 2: Add queue event handlers to RoomGateway**

Modify `backend/src/gateway/room.gateway.ts`. Add the QueueService injection in the constructor:

```typescript
import { QueueService } from '../queue/queue.service';

// In the constructor:
constructor(
  private roomsService: RoomsService,
  private redisService: RedisService,
  private playbackSyncService: PlaybackSyncService,
  private queueService: QueueService,
) {}
```

Then add these event handlers before the closing brace of the class:

```typescript
  @SubscribeMessage('queue:submit')
  async handleQueueSubmit(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string; youtubeUrl: string; songTitle?: string; artist?: string },
  ) {
    try {
      const room = await this.roomsService.findByCode(payload.roomCode);
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is in the room
      const member = await this.roomsService.getRoomMember(room.id, client.user.userId);
      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      const submission = await this.queueService.submitSong(
        room.id,
        client.user.userId,
        {
          youtubeUrl: payload.youtubeUrl,
          songTitle: payload.songTitle,
          artist: payload.artist,
        },
      );

      // Broadcast new submission to all room members
      const queueState = await this.queueService.getQueueState(room.id, client.user.userId);
      this.server.to(payload.roomCode).emit('queue:updated', queueState);

      return { success: true, submission };
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('queue:vote')
  async handleQueueVote(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string; submissionId: string },
  ) {
    try {
      const room = await this.roomsService.findByCode(payload.roomCode);
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is in the room
      const member = await this.roomsService.getRoomMember(room.id, client.user.userId);
      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      await this.queueService.voteForSubmission(payload.submissionId, client.user.userId);

      // Broadcast updated queue to all room members
      const queueState = await this.queueService.getQueueState(room.id, client.user.userId);
      this.server.to(payload.roomCode).emit('queue:updated', queueState);

      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('queue:unvote')
  async handleQueueUnvote(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string; submissionId: string },
  ) {
    try {
      const room = await this.roomsService.findByCode(payload.roomCode);
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is in the room
      const member = await this.roomsService.getRoomMember(room.id, client.user.userId);
      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      await this.queueService.unvoteSubmission(payload.submissionId, client.user.userId);

      // Broadcast updated queue to all room members
      const queueState = await this.queueService.getQueueState(room.id, client.user.userId);
      this.server.to(payload.roomCode).emit('queue:updated', queueState);

      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('queue:remove')
  async handleQueueRemove(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string; submissionId: string },
  ) {
    try {
      const room = await this.roomsService.findByCode(payload.roomCode);
      if (!room) {
        return { error: 'Room not found' };
      }

      await this.queueService.removeSubmission(payload.submissionId, client.user.userId);

      // Broadcast updated queue to all room members
      const queueState = await this.queueService.getQueueState(room.id, client.user.userId);
      this.server.to(payload.roomCode).emit('queue:updated', queueState);

      return { success: true };
    } catch (error) {
      return { error: error.message };
    }
  }

  @SubscribeMessage('queue:get')
  async handleQueueGet(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string },
  ) {
    try {
      const room = await this.roomsService.findByCode(payload.roomCode);
      if (!room) {
        return { error: 'Room not found' };
      }

      const queueState = await this.queueService.getQueueState(room.id, client.user.userId);
      return queueState;
    } catch (error) {
      return { error: error.message };
    }
  }
```

**Step 3: Add queue state to room:state event**

In the same file, find the `handleRoomJoin` method and modify it to include queue state. Find this section:

```typescript
// Send current room state to the joining user
client.emit('room:state', {
  room: roomDto,
  members: membersDto,
  currentDjId,
  playbackState,
});
```

Replace it with:

```typescript
// Get queue state
const queueState = await this.queueService.getQueueState(room.id, userId);

// Send current room state to the joining user
client.emit('room:state', {
  room: roomDto,
  members: membersDto,
  currentDjId,
  playbackState,
  queueState,
});
```

**Step 4: Commit**

```bash
git add backend/src/gateway/room.gateway.ts backend/src/gateway/gateway.module.ts
git commit -m "feat: add queue WebSocket events to room gateway"
```

---

## Task 6: Add Auto-Play Next Song on Playback End

**Files:**
- Modify: `backend/src/gateway/room.gateway.ts`

**Step 1: Add playback:ended event handler**

Add this new event handler to `backend/src/gateway/room.gateway.ts`:

```typescript
  @SubscribeMessage('playback:ended')
  async handlePlaybackEnded(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string },
  ) {
    try {
      const room = await this.roomsService.findByCode(payload.roomCode);
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is the current DJ
      const currentDjId = await this.redisService.get(`room:${room.id}:state.currentDjId`);
      if (currentDjId !== client.user.userId) {
        return { error: 'Only the DJ can signal playback ended' };
      }

      // Get top voted submission
      const topSubmission = await this.queueService.getTopSubmission(room.id);

      if (topSubmission) {
        // Mark as played
        await this.queueService.markAsPlayed(topSubmission.id);

        // Broadcast auto-play event with the winning song
        this.server.to(payload.roomCode).emit('queue:auto-play', {
          submission: {
            id: topSubmission.id,
            youtubeUrl: topSubmission.youtubeUrl,
            songTitle: topSubmission.songTitle,
            artist: topSubmission.artist,
            submittedBy: topSubmission.submittedBy,
          },
        });

        // Broadcast updated queue
        const queueState = await this.queueService.getQueueState(room.id, client.user.userId);
        this.server.to(payload.roomCode).emit('queue:updated', queueState);
      }

      return { success: true, hasNext: !!topSubmission };
    } catch (error) {
      return { error: error.message };
    }
  }
```

**Step 2: Commit**

```bash
git add backend/src/gateway/room.gateway.ts
git commit -m "feat: add auto-play next song when current song ends"
```

---

## Task 7: Add REST Endpoint for Queue State

**Files:**
- Create: `backend/src/queue/queue.controller.ts`
- Modify: `backend/src/queue/queue.module.ts`
- Modify: `backend/src/app.module.ts`

**Step 1: Create queue controller**

Create `backend/src/queue/queue.controller.ts`:

```typescript
import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueueService } from './queue.service';
import { QueueStateDto } from './dto';

@Controller('queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private queueService: QueueService) {}

  @Get(':roomCode')
  async getQueueState(
    @Param('roomCode') roomCode: string,
    @Request() req,
  ): Promise<QueueStateDto> {
    // Note: You'll need to get roomId from roomCode via RoomsService
    // For now, assuming roomCode is passed as roomId
    return this.queueService.getQueueState(roomCode, req.user.userId);
  }
}
```

**Step 2: Update queue module to include controller**

Modify `backend/src/queue/queue.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { SongSubmission, SongSubmissionVote } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([SongSubmission, SongSubmissionVote])],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
```

**Step 3: Import QueueModule in app.module**

Modify `backend/src/app.module.ts` to include QueueModule in imports array:

```typescript
import { QueueModule } from './queue/queue.module';

// In @Module decorator imports array, add:
QueueModule,
```

**Step 4: Commit**

```bash
git add backend/src/queue/queue.controller.ts backend/src/queue/queue.module.ts backend/src/app.module.ts
git commit -m "feat: add REST endpoint for queue state"
```

---

## Task 8: Add TypeScript Types for Frontend

**Files:**
- Create: `mobile/src/types/queue.types.ts`

**Step 1: Create queue types**

Create `mobile/src/types/queue.types.ts`:

```typescript
export interface SongSubmission {
  id: string;
  roomId: string;
  submittedBy: string;
  submitterUsername: string;
  submitterDisplayName: string;
  youtubeUrl: string;
  songTitle: string | null;
  artist: string | null;
  voteCount: number;
  hasVoted: boolean;
  createdAt: Date;
}

export interface QueueState {
  submissions: SongSubmission[];
  totalSubmissions: number;
}

export interface SubmitSongPayload {
  roomCode: string;
  youtubeUrl: string;
  songTitle?: string;
  artist?: string;
}

export interface VotePayload {
  roomCode: string;
  submissionId: string;
}

export interface AutoPlayPayload {
  submission: {
    id: string;
    youtubeUrl: string;
    songTitle: string | null;
    artist: string | null;
    submittedBy: string;
  };
}
```

**Step 2: Update socket types**

Modify `mobile/src/types/socket.types.ts` to add queue events. Add these to the existing interface:

```typescript
// Add to ServerToClientEvents interface:
'queue:updated': (queueState: QueueState) => void;
'queue:auto-play': (payload: AutoPlayPayload) => void;

// Add to ClientToServerEvents interface:
'queue:submit': (payload: SubmitSongPayload, callback: (response: any) => void) => void;
'queue:vote': (payload: VotePayload, callback: (response: any) => void) => void;
'queue:unvote': (payload: VotePayload, callback: (response: any) => void) => void;
'queue:remove': (payload: VotePayload, callback: (response: any) => void) => void;
'queue:get': (payload: { roomCode: string }, callback: (response: QueueState | { error: string }) => void) => void;
'playback:ended': (payload: { roomCode: string }, callback: (response: any) => void) => void;
```

Don't forget to import the types at the top:

```typescript
import { QueueState, SubmitSongPayload, VotePayload, AutoPlayPayload } from './queue.types';
```

**Step 3: Commit**

```bash
git add mobile/src/types/queue.types.ts mobile/src/types/socket.types.ts
git commit -m "feat: add TypeScript types for queue system"
```

---

## Task 9: Create Queue Management Hook

**Files:**
- Create: `mobile/src/hooks/useQueue.ts`

**Step 1: Create useQueue hook**

Create `mobile/src/hooks/useQueue.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import { QueueState, SongSubmission } from '../types/queue.types';

export const useQueue = (roomCode: string | null) => {
  const { socket } = useSocket();
  const [queueState, setQueueState] = useState<QueueState>({
    submissions: [],
    totalSubmissions: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial queue state
  const fetchQueue = useCallback(() => {
    if (!socket || !roomCode) return;

    setIsLoading(true);
    socket.emit('queue:get', { roomCode }, (response: any) => {
      setIsLoading(false);
      if (!response.error) {
        setQueueState(response);
      }
    });
  }, [socket, roomCode]);

  // Submit a new song
  const submitSong = useCallback(
    (youtubeUrl: string, songTitle?: string, artist?: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit(
          'queue:submit',
          { roomCode, youtubeUrl, songTitle, artist },
          (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve();
            }
          },
        );
      });
    },
    [socket, roomCode],
  );

  // Vote for a submission
  const voteForSubmission = useCallback(
    (submissionId: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit('queue:vote', { roomCode, submissionId }, (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        });
      });
    },
    [socket, roomCode],
  );

  // Unvote a submission
  const unvoteSubmission = useCallback(
    (submissionId: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit('queue:unvote', { roomCode, submissionId }, (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        });
      });
    },
    [socket, roomCode],
  );

  // Remove own submission
  const removeSubmission = useCallback(
    (submissionId: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit('queue:remove', { roomCode, submissionId }, (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        });
      });
    },
    [socket, roomCode],
  );

  // Listen for queue updates
  useEffect(() => {
    if (!socket) return;

    const handleQueueUpdated = (newQueueState: QueueState) => {
      setQueueState(newQueueState);
    };

    socket.on('queue:updated', handleQueueUpdated);

    return () => {
      socket.off('queue:updated', handleQueueUpdated);
    };
  }, [socket]);

  // Fetch queue on mount
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return {
    queueState,
    isLoading,
    submitSong,
    voteForSubmission,
    unvoteSubmission,
    removeSubmission,
    refetchQueue: fetchQueue,
  };
};
```

**Step 2: Commit**

```bash
git add mobile/src/hooks/useQueue.ts
git commit -m "feat: add useQueue hook for queue management"
```

---

## Task 10: Create Queue UI Components

**Files:**
- Create: `mobile/src/components/QueueItem.tsx`
- Create: `mobile/src/components/QueueList.tsx`
- Create: `mobile/src/components/SubmitSongModal.tsx`

**Step 1: Create QueueItem component**

Create `mobile/src/components/QueueItem.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SongSubmission } from '../types/queue.types';

interface QueueItemProps {
  submission: SongSubmission;
  onVote: (submissionId: string) => void;
  onUnvote: (submissionId: string) => void;
  onRemove?: (submissionId: string) => void;
  currentUserId: string | null;
}

export const QueueItem: React.FC<QueueItemProps> = ({
  submission,
  onVote,
  onUnvote,
  onRemove,
  currentUserId,
}) => {
  const handleVoteToggle = () => {
    if (submission.hasVoted) {
      onUnvote(submission.id);
    } else {
      onVote(submission.id);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Song',
      'Are you sure you want to remove this submission?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemove?.(submission.id),
        },
      ],
    );
  };

  const canRemove = currentUserId === submission.submittedBy && onRemove;

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <TouchableOpacity
          style={[styles.voteButton, submission.hasVoted && styles.votedButton]}
          onPress={handleVoteToggle}
        >
          <Text style={styles.voteIcon}>▲</Text>
          <Text style={styles.voteCount}>{submission.voteCount}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.middleSection}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {submission.songTitle || 'Untitled'}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {submission.artist || 'Unknown Artist'}
        </Text>
        <Text style={styles.submitter} numberOfLines={1}>
          Added by {submission.submitterDisplayName}
        </Text>
      </View>

      {canRemove && (
        <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
          <Text style={styles.removeIcon}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1e1e2e',
    borderRadius: 8,
    marginBottom: 8,
  },
  leftSection: {
    marginRight: 12,
  },
  voteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#2a2a3e',
  },
  votedButton: {
    backgroundColor: '#5865F2',
  },
  voteIcon: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 2,
  },
  voteCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  middleSection: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  artist: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 2,
  },
  submitter: {
    fontSize: 12,
    color: '#808080',
  },
  removeButton: {
    padding: 8,
    marginLeft: 8,
  },
  removeIcon: {
    fontSize: 28,
    color: '#ff5555',
    fontWeight: 'bold',
  },
});
```

**Step 2: Create QueueList component**

Create `mobile/src/components/QueueList.tsx`:

```typescript
import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { QueueItem } from './QueueItem';
import { SongSubmission } from '../types/queue.types';

interface QueueListProps {
  submissions: SongSubmission[];
  onVote: (submissionId: string) => void;
  onUnvote: (submissionId: string) => void;
  onRemove?: (submissionId: string) => void;
  currentUserId: string | null;
}

export const QueueList: React.FC<QueueListProps> = ({
  submissions,
  onVote,
  onUnvote,
  onRemove,
  currentUserId,
}) => {
  if (submissions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No songs in queue</Text>
        <Text style={styles.emptySubtext}>
          Be the first to submit a song!
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={submissions}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <QueueItem
          submission={item}
          onVote={onVote}
          onUnvote={onUnvote}
          onRemove={onRemove}
          currentUserId={currentUserId}
        />
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#808080',
  },
});
```

**Step 3: Create SubmitSongModal component**

Create `mobile/src/components/SubmitSongModal.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';

interface SubmitSongModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (youtubeUrl: string, songTitle?: string, artist?: string) => Promise<void>;
}

export const SubmitSongModal: React.FC<SubmitSongModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!youtubeUrl.trim()) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    // Basic YouTube URL validation
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeRegex.test(youtubeUrl)) {
      Alert.alert('Error', 'Please enter a valid YouTube URL');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(
        youtubeUrl.trim(),
        songTitle.trim() || undefined,
        artist.trim() || undefined,
      );
      // Reset form
      setYoutubeUrl('');
      setSongTitle('');
      setArtist('');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit song');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Submit a Song</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>YouTube URL *</Text>
            <TextInput
              style={styles.input}
              value={youtubeUrl}
              onChangeText={setYoutubeUrl}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.label}>Song Title (optional)</Text>
            <TextInput
              style={styles.input}
              value={songTitle}
              onChangeText={setSongTitle}
              placeholder="Enter song title"
              placeholderTextColor="#666"
              maxLength={200}
            />

            <Text style={styles.label}>Artist (optional)</Text>
            <TextInput
              style={styles.input}
              value={artist}
              onChangeText={setArtist}
              placeholder="Enter artist name"
              placeholderTextColor="#666"
              maxLength={200}
            />

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Submitting...' : 'Submit Song'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  closeIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
  form: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b0b0b0',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3a3a4e',
  },
  submitButton: {
    backgroundColor: '#5865F2',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
```

**Step 4: Commit**

```bash
git add mobile/src/components/QueueItem.tsx mobile/src/components/QueueList.tsx mobile/src/components/SubmitSongModal.tsx
git commit -m "feat: add queue UI components"
```

---

## Task 11: Integrate Queue into RoomScreen

**Files:**
- Modify: `mobile/src/screens/RoomScreen.tsx`

**Step 1: Add queue integration to RoomScreen**

Modify `mobile/src/screens/RoomScreen.tsx`. First, add imports at the top:

```typescript
import { useQueue } from '../hooks/useQueue';
import { QueueList } from '../components/QueueList';
import { SubmitSongModal } from '../components/SubmitSongModal';
```

Then add state and hooks after existing hooks:

```typescript
  const { queueState, submitSong, voteForSubmission, unvoteSubmission, removeSubmission } = useQueue(roomCode);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
```

Add handlers before the return statement:

```typescript
  const handleSubmitSong = async (youtubeUrl: string, songTitle?: string, artist?: string) => {
    await submitSong(youtubeUrl, songTitle, artist);
  };

  const handleVote = async (submissionId: string) => {
    try {
      await voteForSubmission(submissionId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleUnvote = async (submissionId: string) => {
    try {
      await unvoteSubmission(submissionId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRemove = async (submissionId: string) => {
    try {
      await removeSubmission(submissionId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };
```

Add UI elements in the render section. Find where the chat/player tabs are and add a Queue tab:

```typescript
  <View style={styles.tabContainer}>
    <TouchableOpacity
      style={[styles.tab, !showQueue && styles.activeTab]}
      onPress={() => setShowQueue(false)}
    >
      <Text style={[styles.tabText, !showQueue && styles.activeTabText]}>
        Chat
      </Text>
    </TouchableOpacity>
    <TouchableOpacity
      style={[styles.tab, showQueue && styles.activeTab]}
      onPress={() => setShowQueue(true)}
    >
      <Text style={[styles.tabText, showQueue && styles.activeTabText]}>
        Queue ({queueState.totalSubmissions})
      </Text>
    </TouchableOpacity>
  </View>

  {showQueue ? (
    <QueueList
      submissions={queueState.submissions}
      onVote={handleVote}
      onUnvote={handleUnvote}
      onRemove={handleRemove}
      currentUserId={user?.id || null}
    />
  ) : (
    // ... existing chat UI
  )}
```

Add a floating action button for submitting songs:

```typescript
  {showQueue && (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => setShowSubmitModal(true)}
    >
      <Text style={styles.fabIcon}>+</Text>
    </TouchableOpacity>
  )}

  <SubmitSongModal
    visible={showSubmitModal}
    onClose={() => setShowSubmitModal(false)}
    onSubmit={handleSubmitSong}
  />
```

Add styles:

```typescript
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#5865F2',
  },
  tabText: {
    fontSize: 16,
    color: '#808080',
  },
  activeTabText: {
    color: '#fff',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#5865F2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
```

**Step 2: Commit**

```bash
git add mobile/src/screens/RoomScreen.tsx
git commit -m "feat: integrate queue UI into RoomScreen"
```

---

## Task 12: Add Auto-Play Support in Frontend

**Files:**
- Modify: `mobile/src/services/SyncedAudioPlayer.ts`
- Modify: `mobile/src/hooks/useSocket.ts`

**Step 1: Add auto-play event listener to socket hook**

Modify `mobile/src/hooks/useSocket.ts` to handle auto-play events. Add this handler:

```typescript
  useEffect(() => {
    if (!socket) return;

    const handleAutoPlay = (payload: AutoPlayPayload) => {
      // Emit custom event that SyncedAudioPlayer can listen to
      // or handle via callback passed to hook
      console.log('Auto-playing next song:', payload.submission);
    };

    socket.on('queue:auto-play', handleAutoPlay);

    return () => {
      socket.off('queue:auto-play', handleAutoPlay);
    };
  }, [socket]);
```

**Step 2: Add playback ended notification**

Modify `mobile/src/services/SyncedAudioPlayer.ts`. Find the `handlePlaybackEnd` or equivalent method and add:

```typescript
  private handlePlaybackEnd = () => {
    // Notify server that playback has ended (DJ only)
    if (this.socket && this.roomCode && this.isDJ) {
      this.socket.emit('playback:ended', { roomCode: this.roomCode }, (response) => {
        if (response.error) {
          console.error('Error notifying playback end:', response.error);
        }
      });
    }
  };
```

Add the listener when setting up audio player:

```typescript
  // In your audio player setup/initialization
  player.addEventListener('ended', this.handlePlaybackEnd);
```

**Step 3: Commit**

```bash
git add mobile/src/services/SyncedAudioPlayer.ts mobile/src/hooks/useSocket.ts
git commit -m "feat: add auto-play support for queue system"
```

---

## Task 13: Run Database Migration

**Files:**
- None (command execution)

**Step 1: Build backend**

Run:
```bash
cd backend && npm run build
```

Expected: Successful build with no TypeScript errors

**Step 2: Run migrations**

Run:
```bash
npm run migration:run
```

Expected: Migration `AddSongSubmissions1732320000000` runs successfully

**Step 3: Verify database schema**

Run:
```bash
psql -U groovebox_user -d groovebox_db -c "\d song_submissions"
psql -U groovebox_user -d groovebox_db -c "\d song_submission_votes"
```

Expected: Tables exist with correct columns

**Step 4: Commit**

```bash
git add -A
git commit -m "chore: run database migrations for queue system"
```

---

## Task 14: Test Backend Queue Endpoints

**Files:**
- Create: `backend/test/queue.e2e-spec.ts` (optional)

**Step 1: Start backend server**

Run:
```bash
cd backend && npm run start:dev
```

Expected: Server starts on port 3000

**Step 2: Test WebSocket queue events manually**

Using a WebSocket testing tool or the mobile app:
1. Join a room
2. Emit `queue:submit` with YouTube URL
3. Verify `queue:updated` event received
4. Emit `queue:vote` for submission
5. Verify vote count increased

**Step 3: Verify database entries**

Run:
```bash
psql -U groovebox_user -d groovebox_db -c "SELECT * FROM song_submissions;"
psql -U groovebox_user -d groovebox_db -c "SELECT * FROM song_submission_votes;"
```

Expected: Submissions and votes are persisted

**Step 4: Document testing results**

Create a note about what was tested and any issues found.

---

## Task 15: Test Frontend Queue UI

**Files:**
- None (manual testing)

**Step 1: Start mobile development server**

Run:
```bash
cd mobile && npm start
```

Expected: Metro bundler starts

**Step 2: Test on iOS or Android**

Run:
```bash
npm run ios
# or
npm run android
```

**Step 3: Manual testing checklist**

Test these flows:
- [ ] View queue tab in room
- [ ] Submit a YouTube URL
- [ ] See submission appear in queue
- [ ] Upvote a submission
- [ ] Remove upvote
- [ ] Remove own submission
- [ ] See real-time updates when others vote
- [ ] Verify top submission auto-plays when song ends

**Step 4: Document any UI/UX issues**

Note any bugs or improvements needed.

---

## Task 16: Add Error Handling and Edge Cases

**Files:**
- Modify: `backend/src/queue/queue.service.ts`
- Modify: `mobile/src/hooks/useQueue.ts`

**Step 1: Add duplicate URL prevention**

Already implemented in `submitSong` method. Verify it works correctly.

**Step 2: Add max queue size limit**

Modify `backend/src/queue/queue.service.ts` in `submitSong` method:

```typescript
  async submitSong(
    roomId: string,
    userId: string,
    submitSongDto: SubmitSongDto,
  ): Promise<SongSubmission> {
    // Check queue size limit
    const activeCount = await this.songSubmissionRepository.count({
      where: { roomId, isActive: true },
    });

    const MAX_QUEUE_SIZE = 50;
    if (activeCount >= MAX_QUEUE_SIZE) {
      throw new BadRequestException('Queue is full (maximum 50 songs)');
    }

    // ... rest of existing code
  }
```

**Step 3: Add user submission rate limit**

Add to `submitSong` method:

```typescript
    // Check if user has too many active submissions
    const userActiveCount = await this.songSubmissionRepository.count({
      where: { roomId, submittedBy: userId, isActive: true },
    });

    const MAX_USER_SUBMISSIONS = 5;
    if (userActiveCount >= MAX_USER_SUBMISSIONS) {
      throw new BadRequestException('You can only have 5 active submissions at a time');
    }
```

**Step 4: Add error toasts in frontend**

Modify `mobile/src/hooks/useQueue.ts` to use proper error handling with user-friendly messages.

**Step 5: Commit**

```bash
git add backend/src/queue/queue.service.ts mobile/src/hooks/useQueue.ts
git commit -m "feat: add error handling and rate limits for queue"
```

---

## Task 17: Update Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/QUEUE_SYSTEM.md`

**Step 1: Create queue system documentation**

Create `docs/QUEUE_SYSTEM.md`:

```markdown
# Voting-Based Queue System

## Overview

The groovebox voting-based queue system allows chat participants to submit YouTube song URLs and vote on submissions. The song with the most votes automatically plays when the current song ends.

## Features

- **Song Submission**: Any room member can submit YouTube URLs
- **Reddit-Style Voting**: Upvote/downvote submissions
- **Auto-Play**: Highest-voted song plays next automatically
- **Real-Time Updates**: Vote counts update instantly via WebSocket
- **Rate Limiting**: Max 5 submissions per user, 50 total per room

## Architecture

### Database Schema

**song_submissions**
- Tracks YouTube URLs submitted to the queue
- Stores vote counts and play history
- Soft-delete with `isActive` flag

**song_submission_votes**
- Individual votes for submissions
- Unique constraint prevents double-voting
- Cascades on submission deletion

### WebSocket Events

**Client → Server**
- `queue:submit` - Submit new YouTube URL
- `queue:vote` - Upvote a submission
- `queue:unvote` - Remove upvote
- `queue:remove` - Remove own submission
- `queue:get` - Fetch current queue state
- `playback:ended` - DJ signals song finished

**Server → Client**
- `queue:updated` - Broadcast when queue changes
- `queue:auto-play` - Notify clients of next song

### Business Logic

1. User submits YouTube URL (auto-upvoted)
2. Other users can upvote submissions
3. Queue sorted by vote count (DESC), then creation time (ASC)
4. When song ends, DJ signals `playback:ended`
5. Server finds top submission and broadcasts `queue:auto-play`
6. Submission marked as played (inactive)
7. Clients auto-load and play the YouTube video

## Usage

### Submitting a Song

1. Tap "Queue" tab in room
2. Tap "+" button
3. Enter YouTube URL (required)
4. Optionally add song title and artist
5. Tap "Submit Song"

### Voting

1. View queue list
2. Tap up arrow to upvote (turns purple when active)
3. Tap again to remove upvote

### Auto-Play

When a song ends:
- DJ client automatically notifies server
- Server selects top-voted submission
- All clients receive auto-play event
- Clients load and play YouTube video

## Rate Limits

- **Per User**: Maximum 5 active submissions
- **Per Room**: Maximum 50 active submissions
- **Duplicate Prevention**: Same URL cannot be submitted twice

## Future Enhancements

- YouTube metadata extraction (title, artist, thumbnail)
- Downvoting support
- Queue history and statistics
- Playlist import
- Spotify integration
```

**Step 2: Update main README**

Modify `README.md` to add a section about the queue system:

```markdown
## Queue System

Groovebox now features a democratic voting-based queue system:

- **Submit Songs**: Any participant can submit YouTube URLs
- **Vote**: Upvote songs you want to hear next
- **Auto-Play**: Highest-voted song plays automatically

See [Queue System Documentation](docs/QUEUE_SYSTEM.md) for details.
```

**Step 3: Commit**

```bash
git add README.md docs/QUEUE_SYSTEM.md
git commit -m "docs: add queue system documentation"
```

---

## Task 18: Final Integration Testing

**Files:**
- None (testing phase)

**Step 1: Test full flow with multiple users**

1. Create a room with User A
2. Join room with User B and User C
3. Have each user submit different YouTube URLs
4. Vote on various submissions
5. Let a song play to completion
6. Verify top submission auto-plays
7. Check real-time updates across all clients

**Step 2: Test edge cases**

- Submit duplicate URL (should fail)
- Submit more than 5 songs (should fail after 5th)
- Vote for same submission twice (should fail)
- Remove submission you didn't create (should fail)
- Leave room while having active submissions (should remain in queue)

**Step 3: Performance testing**

- Submit 50 songs (max queue size)
- Verify performance with full queue
- Test voting with many concurrent users

**Step 4: Document test results**

Create a test report noting any bugs or issues.

---

## Task 19: Code Review and Refactoring

**Files:**
- Various (as needed)

**Step 1: Review all code changes**

Check for:
- Code duplication
- Missing error handling
- TypeScript type safety
- Consistent naming conventions
- Proper use of async/await

**Step 2: Run linter**

```bash
cd backend && npm run lint
cd mobile && npm run lint
```

Expected: No linting errors

**Step 3: Fix any issues found**

Make necessary corrections.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: code review fixes"
```

---

## Task 20: Final Commit and Push

**Files:**
- None (git operations)

**Step 1: Review all commits**

Run:
```bash
git log --oneline
```

Expected: Clean, descriptive commit history

**Step 2: Run final tests**

```bash
cd backend && npm run test
cd backend && npm run build
cd mobile && npm run build
```

Expected: All tests pass, builds succeed

**Step 3: Push to remote**

```bash
git push -u origin claude/mutiny-chat-submissions-0172JWPuWJPsspp8XgvMfpFT
```

Expected: Successful push to remote branch

**Step 4: Verify GitHub**

Check that all commits are visible on GitHub.

---

## Summary

This plan implements a complete voting-based music queue system:

✅ Database entities for submissions and votes
✅ Backend service with voting logic
✅ WebSocket events for real-time updates
✅ Auto-play when song ends
✅ React Native UI components
✅ Queue management hooks
✅ Integration with existing room system
✅ Error handling and rate limiting
✅ Documentation

**Total Tasks**: 20
**Estimated Implementation Time**: 6-8 hours
**Key Technologies**: NestJS, TypeORM, PostgreSQL, Redis, Socket.io, React Native

**Next Steps After Implementation**:
1. Optional: Add YouTube metadata extraction API
2. Optional: Add downvoting support
3. Optional: Implement queue history/statistics
4. Consider Spotify integration as Phase 4
