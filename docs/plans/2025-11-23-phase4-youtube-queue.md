# Phase 4: YouTube Queue System with Upvoting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement a democratic music queue where all room members can submit YouTube URLs and upvote songs. The most upvoted song plays next when the current song ends.

**Architecture:** Backend manages queue entries in PostgreSQL, tracks votes in Redis for real-time updates, extracts YouTube metadata via API. Frontend displays queue sorted by votes, allows URL submission and upvoting, uses react-native-youtube-iframe for synchronized playback.

**Tech Stack:** NestJS + YouTube Data API v3, React Native + react-native-youtube-iframe, Redis for vote counting, WebSocket for real-time queue updates

---

## Prerequisites

Before starting, ensure:
- YouTube Data API v3 key obtained from Google Cloud Console
- Phase 1-3 completed (sync system, voting, governance working)
- react-native-youtube-iframe compatible with React Native 0.76+

---

## Task 1: Backend - YouTube Metadata Service

**Goal:** Fetch video metadata from YouTube Data API v3

**Files:**
- Create: `backend/src/youtube/youtube.module.ts`
- Create: `backend/src/youtube/youtube.service.ts`
- Create: `backend/src/youtube/dto/youtube-video.dto.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/.env.example`
- Create: `backend/src/youtube/youtube.service.spec.ts`

**Step 1: Install dependencies**

```bash
cd backend
npm install @nestjs/axios axios
```

**Step 2: Add environment variables**

Add to `backend/.env.example`:
```env
YOUTUBE_API_KEY=your_youtube_api_key_here
```

**Step 3: Create YouTube DTO**

Create `backend/src/youtube/dto/youtube-video.dto.ts`:
```typescript
export interface YouTubeVideoDto {
  videoId: string;
  url: string;
  title: string;
  artist: string; // Channel name
  thumbnailUrl: string;
  durationSeconds: number;
}

export interface YouTubeVideoDetailsDto {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnails: {
    default: { url: string; width: number; height: number };
    medium: { url: string; width: number; height: number };
    high: { url: string; width: number; height: number };
  };
  duration: string; // ISO 8601 format
  durationSeconds: number;
}
```

**Step 4: Create YouTube service**

Create `backend/src/youtube/youtube.service.ts`:
```typescript
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { YouTubeVideoDetailsDto } from './dto/youtube-video.dto';

@Injectable()
export class YouTubeService {
  private readonly logger = new Logger(YouTubeService.name);
  private readonly apiKey: string;
  private readonly apiBaseUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('YOUTUBE_API_KEY');
  }

  /**
   * Extract video ID from YouTube URL
   */
  extractVideoId(url: string): string | null {
    try {
      // Support multiple URL formats:
      // https://www.youtube.com/watch?v=VIDEO_ID
      // https://youtu.be/VIDEO_ID
      // https://www.youtube.com/embed/VIDEO_ID
      const urlObj = new URL(url);

      if (urlObj.hostname === 'youtu.be') {
        return urlObj.pathname.substring(1);
      }

      if (urlObj.hostname.includes('youtube.com')) {
        if (urlObj.pathname === '/watch') {
          return urlObj.searchParams.get('v');
        }
        if (urlObj.pathname.startsWith('/embed/')) {
          return urlObj.pathname.substring(7);
        }
      }

      return null;
    } catch (error) {
      this.logger.warn(`Invalid URL: ${url}`);
      return null;
    }
  }

  /**
   * Get video details from YouTube API
   */
  async getVideoDetails(videoId: string): Promise<YouTubeVideoDetailsDto> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiBaseUrl}/videos`, {
          params: {
            part: 'snippet,contentDetails',
            id: videoId,
            key: this.apiKey,
          },
        }),
      );

      if (!response.data.items || response.data.items.length === 0) {
        throw new BadRequestException('Video not found');
      }

      const video = response.data.items[0];
      const snippet = video.snippet;
      const contentDetails = video.contentDetails;

      // Parse ISO 8601 duration (e.g., "PT4M33S" = 4 minutes 33 seconds)
      const durationSeconds = this.parseDuration(contentDetails.duration);

      return {
        videoId,
        title: snippet.title,
        channelTitle: snippet.channelTitle,
        thumbnails: snippet.thumbnails,
        duration: contentDetails.duration,
        durationSeconds,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch video details: ${error.message}`);

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Failed to fetch video details from YouTube');
    }
  }

  /**
   * Parse ISO 8601 duration to seconds
   * Format: PT#H#M#S (e.g., PT1H30M45S = 1:30:45)
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Validate YouTube URL and return video ID
   */
  async validateUrl(url: string): Promise<string> {
    const videoId = this.extractVideoId(url);

    if (!videoId) {
      throw new BadRequestException('Invalid YouTube URL format');
    }

    // Verify video exists and is accessible
    await this.getVideoDetails(videoId);

    return videoId;
  }
}
```

**Step 5: Create YouTube module**

Create `backend/src/youtube/youtube.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { YouTubeService } from './youtube.service';

@Module({
  imports: [HttpModule, ConfigModule],
  providers: [YouTubeService],
  exports: [YouTubeService],
})
export class YouTubeModule {}
```

**Step 6: Register in AppModule**

Modify `backend/src/app.module.ts`:
```typescript
import { YouTubeModule } from './youtube/youtube.module';

@Module({
  imports: [
    // ... existing imports
    YouTubeModule,
  ],
})
export class AppModule {}
```

**Step 7: Write tests**

Create `backend/src/youtube/youtube.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { YouTubeService } from './youtube.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { BadRequestException } from '@nestjs/common';

describe('YouTubeService', () => {
  let service: YouTubeService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'YOUTUBE_API_KEY') return 'test_api_key';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YouTubeService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<YouTubeService>(YouTubeService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('extractVideoId', () => {
    it('should extract video ID from standard watch URL', () => {
      const videoId = service.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(videoId).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from short URL', () => {
      const videoId = service.extractVideoId('https://youtu.be/dQw4w9WgXcQ');
      expect(videoId).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from embed URL', () => {
      const videoId = service.extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(videoId).toBe('dQw4w9WgXcQ');
    });

    it('should return null for invalid URL', () => {
      const videoId = service.extractVideoId('https://example.com/video');
      expect(videoId).toBeNull();
    });
  });

  describe('getVideoDetails', () => {
    it('should fetch video details successfully', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              snippet: {
                title: 'Test Video',
                channelTitle: 'Test Channel',
                thumbnails: {
                  default: { url: 'http://thumb1.jpg', width: 120, height: 90 },
                  medium: { url: 'http://thumb2.jpg', width: 320, height: 180 },
                  high: { url: 'http://thumb3.jpg', width: 480, height: 360 },
                },
              },
              contentDetails: {
                duration: 'PT4M33S',
              },
            },
          ],
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getVideoDetails('test_video_id');

      expect(result.title).toBe('Test Video');
      expect(result.channelTitle).toBe('Test Channel');
      expect(result.durationSeconds).toBe(273); // 4*60 + 33
    });

    it('should throw BadRequestException if video not found', async () => {
      mockHttpService.get.mockReturnValue(of({ data: { items: [] } }));

      await expect(service.getVideoDetails('invalid_id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should parse complex duration correctly', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              snippet: {
                title: 'Long Video',
                channelTitle: 'Test',
                thumbnails: {
                  default: { url: 'http://thumb.jpg', width: 120, height: 90 },
                },
              },
              contentDetails: {
                duration: 'PT1H30M45S', // 1:30:45
              },
            },
          ],
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const result = await service.getVideoDetails('long_video');

      expect(result.durationSeconds).toBe(5445); // 1*3600 + 30*60 + 45
    });
  });

  describe('validateUrl', () => {
    it('should validate and return video ID for valid URL', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              snippet: {
                title: 'Test',
                channelTitle: 'Test',
                thumbnails: { default: { url: 'test.jpg' } },
              },
              contentDetails: { duration: 'PT3M' },
            },
          ],
        },
      };

      mockHttpService.get.mockReturnValue(of(mockResponse));

      const videoId = await service.validateUrl('https://youtu.be/abc123');

      expect(videoId).toBe('abc123');
      expect(mockHttpService.get).toHaveBeenCalled();
    });

    it('should throw for invalid URL format', async () => {
      await expect(service.validateUrl('https://example.com')).rejects.toThrow(
        'Invalid YouTube URL format',
      );
    });
  });
});
```

**Step 8: Run tests**

```bash
npm test -- youtube.service.spec.ts
```

Expected: All tests pass

**Step 9: Commit**

```bash
git add backend/src/youtube backend/src/app.module.ts backend/.env.example
git commit -m "feat: add YouTube metadata service with URL validation"
```

---

## Task 2: Backend - Queue Entity and Module

**Goal:** Create queue entry database schema and CRUD operations

**Files:**
- Create: `backend/src/entities/queue-entry.entity.ts`
- Create: `backend/src/queue/queue.module.ts`
- Create: `backend/src/queue/queue.service.ts`
- Create: `backend/src/queue/queue.controller.ts`
- Create: `backend/src/queue/dto/add-to-queue.dto.ts`
- Create: `backend/src/queue/dto/queue-entry.dto.ts`
- Modify: `backend/src/database/database.module.ts`
- Create: `backend/src/queue/queue.service.spec.ts`

**Step 1: Create QueueEntry entity**

Create `backend/src/entities/queue-entry.entity.ts`:
```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Room } from './room.entity';
import { User } from './user.entity';

@Entity('queue_entries')
export class QueueEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  roomId: string;

  @ManyToOne(() => Room, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roomId' })
  room: Room;

  @Column()
  youtubeVideoId: string;

  @Column()
  youtubeUrl: string;

  @Column()
  title: string;

  @Column()
  artist: string; // Channel name

  @Column()
  thumbnailUrl: string;

  @Column()
  durationSeconds: number;

  @Column()
  addedById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'addedById' })
  addedBy: User;

  @Column({ default: false })
  isPlayed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  playedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
```

**Step 2: Register entity**

Modify `backend/src/database/database.module.ts`:
```typescript
import { QueueEntry } from '../entities/queue-entry.entity';

TypeOrmModule.forRoot({
  // ...
  entities: [
    // ... existing entities
    QueueEntry,
  ],
})
```

**Step 3: Create DTOs**

Create `backend/src/queue/dto/add-to-queue.dto.ts`:
```typescript
import { IsString, IsUrl, IsNotEmpty } from 'class-validator';

export class AddToQueueDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  youtubeUrl: string;
}
```

Create `backend/src/queue/dto/queue-entry.dto.ts`:
```typescript
export interface QueueEntryDto {
  id: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number;
  addedBy: {
    id: string;
    username: string;
    displayName: string;
  };
  voteCount: number;
  hasVoted: boolean; // For current user
  isPlayed: boolean;
  createdAt: Date;
}

export interface QueueStateDto {
  entries: QueueEntryDto[];
  currentlyPlaying: QueueEntryDto | null;
  totalEntries: number;
}
```

**Step 4: Create Queue service**

Create `backend/src/queue/queue.service.ts`:
```typescript
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueEntry } from '../entities/queue-entry.entity';
import { User } from '../entities/user.entity';
import { Room } from '../entities/room.entity';
import { YouTubeService } from '../youtube/youtube.service';
import { RedisService } from '../redis/redis.service';
import { AddToQueueDto } from './dto/add-to-queue.dto';
import { QueueEntryDto, QueueStateDto } from './dto/queue-entry.dto';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectRepository(QueueEntry)
    private readonly queueEntryRepository: Repository<QueueEntry>,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly youtubeService: YouTubeService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Add song to queue
   */
  async addToQueue(
    roomId: string,
    userId: string,
    dto: AddToQueueDto,
  ): Promise<QueueEntryDto> {
    // Verify room exists
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Validate YouTube URL and get video ID
    const videoId = await this.youtubeService.validateUrl(dto.youtubeUrl);

    // Check if video already in queue
    const existingEntry = await this.queueEntryRepository.findOne({
      where: {
        roomId,
        youtubeVideoId: videoId,
        isPlayed: false,
      },
    });

    if (existingEntry) {
      throw new BadRequestException('This video is already in the queue');
    }

    // Get video details from YouTube
    const videoDetails = await this.youtubeService.getVideoDetails(videoId);

    // Create queue entry
    const queueEntry = this.queueEntryRepository.create({
      roomId,
      youtubeVideoId: videoId,
      youtubeUrl: dto.youtubeUrl,
      title: videoDetails.title,
      artist: videoDetails.channelTitle,
      thumbnailUrl: videoDetails.thumbnails.high.url,
      durationSeconds: videoDetails.durationSeconds,
      addedById: userId,
    });

    const saved = await this.queueEntryRepository.save(queueEntry);

    // Initialize vote count in Redis
    await this.initializeVotes(saved.id);

    this.logger.log(`Added to queue: ${videoDetails.title} in room ${room.roomCode}`);

    return this.mapToDto(saved, userId);
  }

  /**
   * Get queue for room
   */
  async getQueueForRoom(roomId: string, userId: string): Promise<QueueStateDto> {
    const entries = await this.queueEntryRepository.find({
      where: { roomId, isPlayed: false },
      relations: ['addedBy'],
      order: { createdAt: 'ASC' },
    });

    // Get currently playing entry
    const currentlyPlaying = await this.queueEntryRepository.findOne({
      where: { roomId, isPlayed: true },
      relations: ['addedBy'],
      order: { playedAt: 'DESC' },
    });

    // Map to DTOs with vote counts
    const entriesWithVotes = await Promise.all(
      entries.map((entry) => this.mapToDto(entry, userId)),
    );

    // Sort by vote count descending
    entriesWithVotes.sort((a, b) => b.voteCount - a.voteCount);

    return {
      entries: entriesWithVotes,
      currentlyPlaying: currentlyPlaying
        ? await this.mapToDto(currentlyPlaying, userId)
        : null,
      totalEntries: entriesWithVotes.length,
    };
  }

  /**
   * Upvote queue entry
   */
  async upvoteEntry(entryId: string, userId: string): Promise<number> {
    const entry = await this.queueEntryRepository.findOne({
      where: { id: entryId },
    });

    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    if (entry.isPlayed) {
      throw new BadRequestException('Cannot vote on played songs');
    }

    const redis = this.redisService.getClient();
    const voteKey = `queue:${entryId}:votes`;
    const voterKey = `queue:${entryId}:voters`;

    // Check if user already voted
    const hasVoted = await redis.sismember(voterKey, userId);
    if (hasVoted) {
      throw new BadRequestException('You have already voted for this song');
    }

    // Add vote
    await redis.incr(voteKey);
    await redis.sadd(voterKey, userId);

    const voteCount = await redis.get(voteKey);
    this.logger.log(`Vote added for entry ${entryId}, total: ${voteCount}`);

    return parseInt(voteCount || '0', 10);
  }

  /**
   * Remove vote from entry
   */
  async removeVote(entryId: string, userId: string): Promise<number> {
    const redis = this.redisService.getClient();
    const voteKey = `queue:${entryId}:votes`;
    const voterKey = `queue:${entryId}:voters`;

    // Check if user has voted
    const hasVoted = await redis.sismember(voterKey, userId);
    if (!hasVoted) {
      throw new BadRequestException('You have not voted for this song');
    }

    // Remove vote
    await redis.decr(voteKey);
    await redis.srem(voterKey, userId);

    const voteCount = await redis.get(voteKey);
    return parseInt(voteCount || '0', 10);
  }

  /**
   * Get next song in queue (highest votes)
   */
  async getNextSong(roomId: string): Promise<QueueEntryDto | null> {
    const entries = await this.queueEntryRepository.find({
      where: { roomId, isPlayed: false },
      relations: ['addedBy'],
    });

    if (entries.length === 0) {
      return null;
    }

    // Get vote counts for all entries
    const entriesWithVotes = await Promise.all(
      entries.map(async (entry) => ({
        entry,
        voteCount: await this.getVoteCount(entry.id),
      })),
    );

    // Sort by votes descending, then by creation time ascending (FIFO tie-breaker)
    entriesWithVotes.sort((a, b) => {
      if (b.voteCount !== a.voteCount) {
        return b.voteCount - a.voteCount;
      }
      return a.entry.createdAt.getTime() - b.entry.createdAt.getTime();
    });

    return this.mapToDto(entriesWithVotes[0].entry, null);
  }

  /**
   * Mark entry as played
   */
  async markAsPlayed(entryId: string): Promise<void> {
    await this.queueEntryRepository.update(entryId, {
      isPlayed: true,
      playedAt: new Date(),
    });

    this.logger.log(`Marked entry ${entryId} as played`);
  }

  /**
   * Remove entry from queue (creator or room owner only)
   */
  async removeFromQueue(entryId: string, userId: string): Promise<void> {
    const entry = await this.queueEntryRepository.findOne({
      where: { id: entryId },
      relations: ['room'],
    });

    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    // Only creator or room owner can remove
    if (entry.addedById !== userId && entry.room.ownerId !== userId) {
      throw new BadRequestException('Only the creator or room owner can remove this entry');
    }

    await this.queueEntryRepository.delete(entryId);

    // Clean up votes in Redis
    await this.cleanupVotes(entryId);

    this.logger.log(`Removed entry ${entryId} from queue`);
  }

  /**
   * Initialize vote count in Redis
   */
  private async initializeVotes(entryId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const voteKey = `queue:${entryId}:votes`;
    await redis.set(voteKey, '0');
    // Set expiry to 24 hours (queue entries should be played by then)
    await redis.expire(voteKey, 86400);
  }

  /**
   * Cleanup votes from Redis
   */
  private async cleanupVotes(entryId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const voteKey = `queue:${entryId}:votes`;
    const voterKey = `queue:${entryId}:voters`;
    await redis.del(voteKey, voterKey);
  }

  /**
   * Get vote count for entry
   */
  private async getVoteCount(entryId: string): Promise<number> {
    const redis = this.redisService.getClient();
    const voteKey = `queue:${entryId}:votes`;
    const count = await redis.get(voteKey);
    return parseInt(count || '0', 10);
  }

  /**
   * Check if user has voted
   */
  private async hasUserVoted(entryId: string, userId: string | null): Promise<boolean> {
    if (!userId) return false;

    const redis = this.redisService.getClient();
    const voterKey = `queue:${entryId}:voters`;
    return (await redis.sismember(voterKey, userId)) === 1;
  }

  /**
   * Map entity to DTO
   */
  private async mapToDto(
    entry: QueueEntry,
    userId: string | null,
  ): Promise<QueueEntryDto> {
    const voteCount = await this.getVoteCount(entry.id);
    const hasVoted = await this.hasUserVoted(entry.id, userId);

    // Ensure addedBy is loaded
    if (!entry.addedBy) {
      entry.addedBy = await this.userRepository.findOne({
        where: { id: entry.addedById },
      });
    }

    return {
      id: entry.id,
      youtubeVideoId: entry.youtubeVideoId,
      youtubeUrl: entry.youtubeUrl,
      title: entry.title,
      artist: entry.artist,
      thumbnailUrl: entry.thumbnailUrl,
      durationSeconds: entry.durationSeconds,
      addedBy: {
        id: entry.addedBy.id,
        username: entry.addedBy.username,
        displayName: entry.addedBy.displayName,
      },
      voteCount,
      hasVoted,
      isPlayed: entry.isPlayed,
      createdAt: entry.createdAt,
    };
  }
}
```

**Step 5: Create Queue controller**

Create `backend/src/queue/queue.controller.ts`:
```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueueService } from './queue.service';
import { AddToQueueDto } from './dto/add-to-queue.dto';

@Controller('rooms/:roomCode/queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * GET /rooms/:roomCode/queue
   * Get queue for room
   */
  @Get()
  async getQueue(@Param('roomCode') roomCode: string, @Request() req) {
    const userId = req.user.userId;
    // Note: Need to get roomId from roomCode
    // This will be handled in next step with room lookup
    return { message: 'Queue endpoint - to be implemented with room lookup' };
  }

  /**
   * POST /rooms/:roomCode/queue
   * Add song to queue
   */
  @Post()
  async addToQueue(
    @Param('roomCode') roomCode: string,
    @Request() req,
    @Body() dto: AddToQueueDto,
  ) {
    const userId = req.user.userId;
    // Will implement with room lookup
    return { message: 'Add to queue - to be implemented' };
  }

  /**
   * POST /rooms/:roomCode/queue/:entryId/vote
   * Upvote entry
   */
  @Post(':entryId/vote')
  async upvote(@Param('entryId') entryId: string, @Request() req) {
    const userId = req.user.userId;
    const voteCount = await this.queueService.upvoteEntry(entryId, userId);
    return { voteCount };
  }

  /**
   * DELETE /rooms/:roomCode/queue/:entryId/vote
   * Remove vote
   */
  @Delete(':entryId/vote')
  async removeVote(@Param('entryId') entryId: string, @Request() req) {
    const userId = req.user.userId;
    const voteCount = await this.queueService.removeVote(entryId, userId);
    return { voteCount };
  }

  /**
   * DELETE /rooms/:roomCode/queue/:entryId
   * Remove entry from queue
   */
  @Delete(':entryId')
  async removeEntry(@Param('entryId') entryId: string, @Request() req) {
    const userId = req.user.userId;
    await this.queueService.removeFromQueue(entryId, userId);
    return { success: true };
  }
}
```

**Step 6: Create Queue module**

Create `backend/src/queue/queue.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { QueueEntry } from '../entities/queue-entry.entity';
import { Room } from '../entities/room.entity';
import { User } from '../entities/user.entity';
import { YouTubeModule } from '../youtube/youtube.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QueueEntry, Room, User]),
    YouTubeModule,
    RedisModule,
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
```

**Step 7: Register in AppModule**

Modify `backend/src/app.module.ts`:
```typescript
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    // ... existing
    QueueModule,
  ],
})
```

**Step 8: Create migration**

```bash
npm run migration:generate -- src/database/migrations/AddQueueEntry
npm run migration:run
```

**Step 9: Write tests**

Create `backend/src/queue/queue.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { QueueService } from './queue.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueueEntry } from '../entities/queue-entry.entity';
import { Room } from '../entities/room.entity';
import { User } from '../entities/user.entity';
import { YouTubeService } from '../youtube/youtube.service';
import { RedisService } from '../redis/redis.service';
import { BadRequestException } from '@nestjs/common';

describe('QueueService', () => {
  let service: QueueService;
  let youtubeService: YouTubeService;

  const mockQueueEntryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockRoomRepository = {
    findOne: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockYouTubeService = {
    validateUrl: jest.fn(),
    getVideoDetails: jest.fn(),
  };

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
    incr: jest.fn(),
    decr: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    sismember: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(() => mockRedisClient),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: getRepositoryToken(QueueEntry), useValue: mockQueueEntryRepository },
        { provide: getRepositoryToken(Room), useValue: mockRoomRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: YouTubeService, useValue: mockYouTubeService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    youtubeService = module.get<YouTubeService>(YouTubeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addToQueue', () => {
    it('should add song to queue successfully', async () => {
      const mockRoom = { id: 'room1', roomCode: 'ABC123' };
      const mockVideoDetails = {
        videoId: 'video1',
        title: 'Test Song',
        channelTitle: 'Test Artist',
        thumbnails: { high: { url: 'http://thumb.jpg' } },
        durationSeconds: 180,
      };
      const mockQueueEntry = {
        id: 'entry1',
        roomId: 'room1',
        youtubeVideoId: 'video1',
        title: 'Test Song',
        artist: 'Test Artist',
        addedById: 'user1',
        addedBy: { id: 'user1', username: 'test', displayName: 'Test User' },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockYouTubeService.validateUrl.mockResolvedValue('video1');
      mockQueueEntryRepository.findOne.mockResolvedValue(null); // Not in queue
      mockYouTubeService.getVideoDetails.mockResolvedValue(mockVideoDetails);
      mockQueueEntryRepository.create.mockReturnValue(mockQueueEntry);
      mockQueueEntryRepository.save.mockResolvedValue(mockQueueEntry);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.get.mockResolvedValue('0');
      mockRedisClient.sismember.mockResolvedValue(0);

      const result = await service.addToQueue('room1', 'user1', {
        youtubeUrl: 'https://youtu.be/video1',
      });

      expect(result.title).toBe('Test Song');
      expect(mockQueueEntryRepository.save).toHaveBeenCalled();
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should throw if video already in queue', async () => {
      mockRoomRepository.findOne.mockResolvedValue({ id: 'room1' });
      mockYouTubeService.validateUrl.mockResolvedValue('video1');
      mockQueueEntryRepository.findOne.mockResolvedValue({ id: 'existing' });

      await expect(
        service.addToQueue('room1', 'user1', {
          youtubeUrl: 'https://youtu.be/video1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('upvoteEntry', () => {
    it('should upvote entry successfully', async () => {
      mockQueueEntryRepository.findOne.mockResolvedValue({
        id: 'entry1',
        isPlayed: false,
      });
      mockRedisClient.sismember.mockResolvedValue(0); // Not voted
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.sadd.mockResolvedValue(1);
      mockRedisClient.get.mockResolvedValue('1');

      const voteCount = await service.upvoteEntry('entry1', 'user1');

      expect(voteCount).toBe(1);
      expect(mockRedisClient.incr).toHaveBeenCalled();
      expect(mockRedisClient.sadd).toHaveBeenCalled();
    });

    it('should throw if already voted', async () => {
      mockQueueEntryRepository.findOne.mockResolvedValue({
        id: 'entry1',
        isPlayed: false,
      });
      mockRedisClient.sismember.mockResolvedValue(1); // Already voted

      await expect(service.upvoteEntry('entry1', 'user1')).rejects.toThrow(
        'already voted',
      );
    });
  });
});
```

**Step 10: Run tests**

```bash
npm test -- queue.service.spec.ts
```

Expected: All tests pass

**Step 11: Commit**

```bash
git add backend/src/queue backend/src/entities backend/src/database
git commit -m "feat: add queue system with voting and YouTube integration"
```

---

## Task 3: Backend - Queue WebSocket Events

**Goal:** Add real-time queue updates via WebSocket

**Files:**
- Create: `backend/src/gateway/dto/queue-events.dto.ts`
- Modify: `backend/src/gateway/room.gateway.ts`
- Modify: `backend/src/queue/queue.service.ts`

**Step 1: Create queue event DTOs**

Create `backend/src/gateway/dto/queue-events.dto.ts`:
```typescript
import { IsString, IsNotEmpty, IsUrl } from 'class-validator';

export class AddToQueueEventDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  youtubeUrl: string;
}

export class VoteQueueEntryDto {
  @IsString()
  @IsNotEmpty()
  entryId: string;
}

export class RemoveFromQueueDto {
  @IsString()
  @IsNotEmpty()
  entryId: string;
}
```

**Step 2: Add queue event handlers to gateway**

Modify `backend/src/gateway/room.gateway.ts`:
```typescript
// Add to imports
import { QueueService } from '../queue/queue.service';
import { AddToQueueEventDto, VoteQueueEntryDto, RemoveFromQueueDto } from './dto/queue-events.dto';

// Add to constructor
constructor(
  // ... existing
  private readonly queueService: QueueService,
) {}

/**
 * Handle queue:add event
 */
@SubscribeMessage('queue:add')
@UseGuards(WsJwtGuard)
async handleAddToQueue(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() dto: AddToQueueEventDto,
): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = client.data.room;

    if (!room) {
      throw new WsException('You are not in a room');
    }

    // Add to queue
    const entry = await this.queueService.addToQueue(room.id, userId, {
      youtubeUrl: dto.youtubeUrl,
    });

    // Broadcast queue update to all room members
    const queueState = await this.queueService.getQueueForRoom(room.id, null);
    this.server.to(`room:${room.id}`).emit('queue:updated', queueState);

    this.logger.log(
      `${client.data.user.displayName} added ${entry.title} to queue in ${room.roomCode}`,
    );
  } catch (error) {
    this.logger.error(`Add to queue error: ${error.message}`);
    throw new WsException(error.message);
  }
}

/**
 * Handle queue:vote event
 */
@SubscribeMessage('queue:vote')
@UseGuards(WsJwtGuard)
async handleVoteQueueEntry(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() dto: VoteQueueEntryDto,
): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = client.data.room;

    if (!room) {
      throw new WsException('You are not in a room');
    }

    // Upvote entry
    const voteCount = await this.queueService.upvoteEntry(dto.entryId, userId);

    // Broadcast updated vote count
    this.server.to(`room:${room.id}`).emit('queue:vote-updated', {
      entryId: dto.entryId,
      voteCount,
    });

    this.logger.log(`Vote added for entry ${dto.entryId}, count: ${voteCount}`);
  } catch (error) {
    this.logger.error(`Vote error: ${error.message}`);
    throw new WsException(error.message);
  }
}

/**
 * Handle queue:remove-vote event
 */
@SubscribeMessage('queue:remove-vote')
@UseGuards(WsJwtGuard)
async handleRemoveVote(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() dto: VoteQueueEntryDto,
): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = client.data.room;

    if (!room) {
      throw new WsException('You are not in a room');
    }

    // Remove vote
    const voteCount = await this.queueService.removeVote(dto.entryId, userId);

    // Broadcast updated vote count
    this.server.to(`room:${room.id}`).emit('queue:vote-updated', {
      entryId: dto.entryId,
      voteCount,
    });

    this.logger.log(`Vote removed from entry ${dto.entryId}, count: ${voteCount}`);
  } catch (error) {
    this.logger.error(`Remove vote error: ${error.message}`);
    throw new WsException(error.message);
  }
}

/**
 * Handle queue:remove event
 */
@SubscribeMessage('queue:remove')
@UseGuards(WsJwtGuard)
async handleRemoveFromQueue(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() dto: RemoveFromQueueDto,
): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = client.data.room;

    if (!room) {
      throw new WsException('You are not in a room');
    }

    // Remove from queue
    await this.queueService.removeFromQueue(dto.entryId, userId);

    // Broadcast queue update
    const queueState = await this.queueService.getQueueForRoom(room.id, null);
    this.server.to(`room:${room.id}`).emit('queue:updated', queueState);

    this.logger.log(`Entry ${dto.entryId} removed from queue`);
  } catch (error) {
    this.logger.error(`Remove from queue error: ${error.message}`);
    throw new WsException(error.message);
  }
}

/**
 * Handle queue:get event
 */
@SubscribeMessage('queue:get')
@UseGuards(WsJwtGuard)
async handleGetQueue(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = client.data.room;

    if (!room) {
      throw new WsException('You are not in a room');
    }

    const queueState = await this.queueService.getQueueForRoom(room.id, userId);
    client.emit('queue:state', queueState);
  } catch (error) {
    this.logger.error(`Get queue error: ${error.message}`);
    throw new WsException(error.message);
  }
}
```

**Step 3: Update gateway module**

Ensure QueueModule is imported in gateway module:
```typescript
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    // ... existing
    QueueModule,
  ],
})
```

**Step 4: Add auto-play next song logic**

Modify `backend/src/gateway/room.gateway.ts`, update playback stop handler:
```typescript
@SubscribeMessage('playback:stop')
@UseGuards(WsJwtGuard)
async handlePlaybackStop(@ConnectedSocket() client: AuthenticatedSocket): Promise<void> {
  try {
    const room = client.data.room;
    if (!room) return;

    // Update Redis state
    await this.redisService.getClient().hset(
      `room:${room.id}:state`,
      'playing',
      'false',
    );

    // Broadcast stop to all members
    this.server.to(`room:${room.id}`).emit('playback:stop');

    // Auto-play next song from queue
    const nextSong = await this.queueService.getNextSong(room.id);

    if (nextSong) {
      this.logger.log(`Auto-playing next song: ${nextSong.title}`);

      // Mark as played
      await this.queueService.markAsPlayed(nextSong.id);

      // Calculate sync time
      const maxRtt = await this.playbackSyncService.getMaxRttForRoom(room.id);
      const syncBuffer = Math.max(300, maxRtt * 2);
      const startAtServerTime = Date.now() + syncBuffer;

      // Broadcast playback start
      const playbackEvent = {
        youtubeVideoId: nextSong.youtubeVideoId,
        trackId: nextSong.id,
        trackName: nextSong.title,
        artist: nextSong.artist,
        thumbnailUrl: nextSong.thumbnailUrl,
        durationSeconds: nextSong.durationSeconds,
        startAtServerTime,
        serverTimestamp: Date.now(),
      };

      this.server.to(`room:${room.id}`).emit('playback:start', playbackEvent);

      // Update queue state
      const queueState = await this.queueService.getQueueForRoom(room.id, null);
      this.server.to(`room:${room.id}`).emit('queue:updated', queueState);
    }
  } catch (error) {
    this.logger.error(`Playback stop error: ${error.message}`);
  }
}
```

**Step 5: Test WebSocket events**

Use a WebSocket client:
```javascript
// Add to queue
socket.emit('queue:add', {
  youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ'
});

// Listen for queue updates
socket.on('queue:updated', (queueState) => {
  console.log('Queue:', queueState);
});

// Vote for entry
socket.emit('queue:vote', {
  entryId: 'entry_id_here'
});

// Listen for vote updates
socket.on('queue:vote-updated', (data) => {
  console.log('Votes:', data.voteCount);
});
```

**Step 6: Commit**

```bash
git add backend/src/gateway backend/src/queue
git commit -m "feat: add real-time queue WebSocket events with auto-play"
```

---

## Task 4: Frontend - YouTube Player Integration

**Goal:** Integrate react-native-youtube-iframe for synchronized playback

**Files:**
- Modify: `mobile/package.json`
- Create: `mobile/src/services/YouTubePlayer.ts`
- Modify: `mobile/src/services/SyncedAudioPlayer.ts`

**Step 1: Install YouTube player**

```bash
cd mobile
npm install react-native-youtube-iframe react-native-webview
cd ios && pod install && cd ..
```

**Step 2: Create YouTubePlayer service**

Create `mobile/src/services/YouTubePlayer.ts`:
```typescript
import { ClockSyncManager } from './ClockSyncManager';

export interface YouTubePlayerInterface {
  loadVideoById(videoId: string, startSeconds?: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
}

export class YouTubePlayer {
  private playerRef: YouTubePlayerInterface | null = null;
  private syncManager: ClockSyncManager;
  private syncCheckInterval: NodeJS.Timeout | null = null;
  private currentVideoId: string | null = null;
  private startAtServerTime: number | null = null;
  private durationSeconds: number = 0;

  constructor(syncManager: ClockSyncManager) {
    this.syncManager = syncManager;
  }

  /**
   * Set player reference (from YouTube component)
   */
  setPlayerRef(playerRef: YouTubePlayerInterface): void {
    this.playerRef = playerRef;
    console.log('[YouTubePlayer] Player reference set');
  }

  /**
   * Handle playback start with sync
   */
  async handlePlaybackStart(event: {
    youtubeVideoId: string;
    trackName: string;
    artist: string;
    durationSeconds: number;
    startAtServerTime: number;
    serverTimestamp: number;
  }): Promise<void> {
    if (!this.playerRef) {
      console.error('[YouTubePlayer] Player ref not set');
      return;
    }

    try {
      console.log('[YouTubePlayer] Handling playback start:', event.trackName);

      this.currentVideoId = event.youtubeVideoId;
      this.startAtServerTime = event.startAtServerTime;
      this.durationSeconds = event.durationSeconds;

      // Convert server time to local time
      const localStartTime = this.syncManager.serverTimeToLocal(event.startAtServerTime);
      const now = Date.now();
      const delayMs = localStartTime - now;

      console.log(`[YouTubePlayer] Server start: ${event.startAtServerTime}`);
      console.log(`[YouTubePlayer] Local start: ${localStartTime}`);
      console.log(`[YouTubePlayer] Delay: ${delayMs}ms`);

      if (delayMs > 100) {
        // Future start - load video and schedule playback
        console.log(`[YouTubePlayer] Scheduling playback in ${delayMs}ms`);
        this.playerRef.loadVideoById(event.youtubeVideoId, 0);

        setTimeout(() => {
          this.playerRef?.playVideo();
          this.startDriftCorrection();
        }, delayMs);
      } else if (delayMs < -500) {
        // Past start - calculate catch-up position
        const elapsedMs = Math.abs(delayMs);
        const startSeconds = Math.floor(elapsedMs / 1000);

        console.log(`[YouTubePlayer] Catching up, starting at ${startSeconds}s`);

        if (startSeconds < event.durationSeconds) {
          this.playerRef.loadVideoById(event.youtubeVideoId, startSeconds);
          this.playerRef.playVideo();
        } else {
          // Song already finished
          console.log('[YouTubePlayer] Song already finished');
          return;
        }

        this.startDriftCorrection();
      } else {
        // Start immediately
        console.log('[YouTubePlayer] Starting playback immediately');
        this.playerRef.loadVideoById(event.youtubeVideoId, 0);
        this.playerRef.playVideo();
        this.startDriftCorrection();
      }
    } catch (error) {
      console.error('[YouTubePlayer] Playback start error:', error);
      throw error;
    }
  }

  /**
   * Handle playback pause
   */
  async handlePlaybackPause(): Promise<void> {
    if (!this.playerRef) return;

    try {
      this.playerRef.pauseVideo();
      this.stopDriftCorrection();
      console.log('[YouTubePlayer] Playback paused');
    } catch (error) {
      console.error('[YouTubePlayer] Pause error:', error);
    }
  }

  /**
   * Handle playback stop
   */
  async handlePlaybackStop(): Promise<void> {
    if (!this.playerRef) return;

    try {
      this.playerRef.pauseVideo();
      this.stopDriftCorrection();
      this.currentVideoId = null;
      this.startAtServerTime = null;
      console.log('[YouTubePlayer] Playback stopped');
    } catch (error) {
      console.error('[YouTubePlayer] Stop error:', error);
    }
  }

  /**
   * Start drift correction loop
   */
  private startDriftCorrection(): void {
    this.stopDriftCorrection();

    this.syncCheckInterval = setInterval(async () => {
      await this.checkAndCorrectDrift();
    }, 5000); // Check every 5 seconds

    console.log('[YouTubePlayer] Drift correction started');
  }

  /**
   * Stop drift correction loop
   */
  private stopDriftCorrection(): void {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
      console.log('[YouTubePlayer] Drift correction stopped');
    }
  }

  /**
   * Check and correct drift
   */
  private async checkAndCorrectDrift(): Promise<void> {
    if (!this.playerRef || !this.startAtServerTime) return;

    try {
      // Get current playback position from YouTube player
      const actualPositionSeconds = await this.playerRef.getCurrentTime();

      // Calculate expected position
      const serverNow = this.syncManager.localTimeToServer(Date.now());
      const expectedPositionSeconds = (serverNow - this.startAtServerTime) / 1000;

      const driftSeconds = actualPositionSeconds - expectedPositionSeconds;
      const driftMs = driftSeconds * 1000;

      console.log(`[YouTubePlayer] Drift check: ${driftMs}ms (${driftSeconds}s)`);

      // Correct if drift > 200ms
      if (Math.abs(driftMs) > 200) {
        console.log(`[YouTubePlayer] Correcting drift: ${driftMs}ms`);
        this.playerRef.seekTo(expectedPositionSeconds, true);
      }
    } catch (error) {
      console.error('[YouTubePlayer] Drift check error:', error);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopDriftCorrection();
    this.playerRef = null;
  }
}
```

**Step 3: Update SyncedAudioPlayer to support YouTube**

Modify `mobile/src/services/SyncedAudioPlayer.ts`:
```typescript
// Add YouTube player as alternative to existing player
import { YouTubePlayer } from './YouTubePlayer';

export class SyncedAudioPlayer {
  private youtubePlayer: YouTubePlayer;

  constructor(syncManager: ClockSyncManager) {
    // ... existing code
    this.youtubePlayer = new YouTubePlayer(syncManager);
  }

  setYouTubePlayerRef(playerRef: any): void {
    this.youtubePlayer.setPlayerRef(playerRef);
  }

  async handlePlaybackStart(event: any): Promise<void> {
    // Check if YouTube or other format
    if (event.youtubeVideoId) {
      await this.youtubePlayer.handlePlaybackStart(event);
    } else {
      // Handle other formats (Spotify, local files)
      // ... existing code
    }
  }

  // ... rest of existing methods
}
```

**Step 4: Commit**

```bash
git add mobile/package.json mobile/src/services
git commit -m "feat: add YouTube player service with drift correction"
```

---

## Task 5: Frontend - Queue UI Components

**Goal:** Create queue screen matching the mockup design

**Files:**
- Create: `mobile/src/screens/QueueScreen.tsx`
- Create: `mobile/src/components/QueueItem.tsx`
- Create: `mobile/src/components/AddSongModal.tsx`
- Create: `mobile/src/types/queue.types.ts`
- Modify: `mobile/src/navigation/AppNavigator.tsx`

**Step 1: Create queue types**

Create `mobile/src/types/queue.types.ts`:
```typescript
export interface QueueEntry {
  id: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number;
  addedBy: {
    id: string;
    username: string;
    displayName: string;
  };
  voteCount: number;
  hasVoted: boolean;
  isPlayed: boolean;
  createdAt: Date;
}

export interface QueueState {
  entries: QueueEntry[];
  currentlyPlaying: QueueEntry | null;
  totalEntries: number;
}
```

**Step 2: Create QueueItem component**

Create `mobile/src/components/QueueItem.tsx`:
```typescript
import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { QueueEntry } from '../types/queue.types';

interface QueueItemProps {
  entry: QueueEntry;
  onVote: (entryId: string) => void;
  currentUserId: string;
}

export const QueueItem: React.FC<QueueItemProps> = ({ entry, onVote, currentUserId }) => {
  const canRemoveVote = entry.hasVoted;
  const isOwnSong = entry.addedBy.id === currentUserId;

  return (
    <View style={styles.container}>
      {/* Vote count and arrow */}
      <TouchableOpacity
        style={styles.voteContainer}
        onPress={() => onVote(entry.id)}
        disabled={isOwnSong}
      >
        <Text style={styles.arrow}>▲</Text>
        <Text style={[styles.voteCount, entry.hasVoted && styles.votedCount]}>
          {entry.voteCount}
        </Text>
      </TouchableOpacity>

      {/* Thumbnail */}
      <Image source={{ uri: entry.thumbnailUrl }} style={styles.thumbnail} />

      {/* Track info */}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {entry.artist} • Added by {entry.addedBy.displayName}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#1a1f3a',
    marginBottom: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  voteContainer: {
    alignItems: 'center',
    marginRight: 16,
    minWidth: 40,
  },
  arrow: {
    color: '#fff',
    fontSize: 18,
    marginBottom: 4,
  },
  voteCount: {
    color: '#888',
    fontSize: 18,
    fontWeight: '700',
  },
  votedCount: {
    color: '#8b5cf6', // Purple when voted
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  artist: {
    color: '#9ca3af',
    fontSize: 14,
  },
});
```

**Step 3: Create AddSongModal**

Create `mobile/src/components/AddSongModal.tsx`:
```typescript
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';

interface AddSongModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
}

export const AddSongModal: React.FC<AddSongModalProps> = ({ visible, onClose, onSubmit }) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    // Basic YouTube URL validation
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      Alert.alert('Error', 'Please enter a valid YouTube URL');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(url);
      setUrl('');
      onClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to add song. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Add Song to Queue</Text>
          <Text style={styles.subtitle}>Paste a YouTube URL below</Text>

          <TextInput
            style={styles.input}
            placeholder="https://youtube.com/watch?v=..."
            placeholderTextColor="#666"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Add to Queue</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#1a1f3a',
    borderRadius: 16,
    padding: 24,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#0f1329',
    color: '#fff',
    fontSize: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d3351',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#2d3351',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#8b5cf6',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**Step 4: Create QueueScreen**

Create `mobile/src/screens/QueueScreen.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { QueueItem } from '../components/QueueItem';
import { AddSongModal } from '../components/AddSongModal';
import { QueueState, QueueEntry } from '../types/queue.types';

interface QueueScreenProps {
  socket: any;
  user: any;
}

export const QueueScreen: React.FC<QueueScreenProps> = ({ socket, user }) => {
  const [queueState, setQueueState] = useState<QueueState>({
    entries: [],
    currentlyPlaying: null,
    totalEntries: 0,
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Request initial queue state
    socket.emit('queue:get');

    // Listen for queue updates
    socket.on('queue:state', (state: QueueState) => {
      console.log('[Queue] State received:', state);
      setQueueState(state);
    });

    socket.on('queue:updated', (state: QueueState) => {
      console.log('[Queue] Updated:', state);
      setQueueState(state);
    });

    socket.on('queue:vote-updated', ({ entryId, voteCount }) => {
      console.log('[Queue] Vote updated:', entryId, voteCount);
      // Update specific entry vote count
      setQueueState((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) =>
          entry.id === entryId ? { ...entry, voteCount } : entry
        ),
      }));
    });

    return () => {
      socket.off('queue:state');
      socket.off('queue:updated');
      socket.off('queue:vote-updated');
    };
  }, [socket]);

  const handleRefresh = () => {
    setRefreshing(true);
    socket?.emit('queue:get');
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleAddSong = async (url: string) => {
    if (!socket) return;
    socket.emit('queue:add', { youtubeUrl: url });
  };

  const handleVote = (entryId: string) => {
    if (!socket) return;

    const entry = queueState.entries.find((e) => e.id === entryId);
    if (!entry) return;

    if (entry.hasVoted) {
      // Remove vote
      socket.emit('queue:remove-vote', { entryId });
    } else {
      // Add vote
      socket.emit('queue:vote', { entryId });
    }
  };

  const renderCurrentlyPlaying = () => {
    if (!queueState.currentlyPlaying) return null;

    const current = queueState.currentlyPlaying;

    return (
      <View style={styles.currentlyPlayingContainer}>
        <View style={styles.currentlyPlayingContent}>
          <Image source={{ uri: current.thumbnailUrl }} style={styles.currentThumbnail} />
          <View style={styles.currentInfo}>
            <Text style={styles.currentTitle} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.currentArtist} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
          <View style={styles.playingBadge}>
            <Text style={styles.playingText}>Playing</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Queue</Text>
        <Text style={styles.subtitle}>Next up based on votes</Text>
      </View>

      {/* Currently Playing */}
      {renderCurrentlyPlaying()}

      {/* Queue List */}
      <FlatList
        data={queueState.entries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <QueueItem entry={item} onVote={handleVote} currentUserId={user?.id} />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No songs in queue</Text>
            <Text style={styles.emptySubtext}>Add a song to get started!</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8b5cf6" />
        }
      />

      {/* Add Song Button */}
      <TouchableOpacity style={styles.addButton} onPress={() => setShowAddModal(true)}>
        <Text style={styles.addButtonText}>+ Add Song</Text>
      </TouchableOpacity>

      {/* Add Song Modal */}
      <AddSongModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddSong}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1329',
  },
  header: {
    padding: 20,
    paddingTop: 60, // Account for status bar
  },
  title: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: 16,
  },
  currentlyPlayingContainer: {
    padding: 16,
    marginBottom: 8,
  },
  currentlyPlayingContent: {
    flexDirection: 'row',
    backgroundColor: '#1a1f3a',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  currentThumbnail: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 12,
  },
  currentInfo: {
    flex: 1,
  },
  currentTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  currentArtist: {
    color: '#9ca3af',
    fontSize: 14,
  },
  playingBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  playingText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100, // Space for add button
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptySubtext: {
    color: '#9ca3af',
    fontSize: 14,
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#1a1f3a',
    padding: 18,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2d3351',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addButtonText: {
    color: '#9ca3af',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

**Step 5: Add to navigation**

Modify `mobile/src/navigation/AppNavigator.tsx`:
```typescript
import { QueueScreen } from '../screens/QueueScreen';

// Add bottom tab for Queue
<Tab.Screen
  name="Queue"
  component={QueueScreen}
  options={{
    tabBarIcon: ({ color }) => <QueueIcon color={color} />,
  }}
/>
```

**Step 6: Test queue UI**

1. Navigate to Queue screen
2. Add a YouTube URL
3. Verify song appears in queue
4. Test upvoting/removing votes
5. Verify real-time updates when others add songs

**Step 7: Commit**

```bash
git add mobile/src/screens mobile/src/components mobile/src/types mobile/src/navigation
git commit -m "feat: add queue UI with voting and real-time updates"
```

---

## Task 6: Frontend - YouTube Player Component

**Goal:** Integrate YouTube player in RoomScreen with synchronized playback

**Files:**
- Modify: `mobile/src/screens/RoomScreen.tsx`
- Create: `mobile/src/components/YouTubePlayerView.tsx`

**Step 1: Create YouTubePlayerView component**

Create `mobile/src/components/YouTubePlayerView.tsx`:
```typescript
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';

interface YouTubePlayerViewProps {
  videoId: string | null;
  playing: boolean;
  onReady: (playerRef: YoutubeIframeRef) => void;
  onEnd: () => void;
}

export const YouTubePlayerView: React.FC<YouTubePlayerViewProps> = ({
  videoId,
  playing,
  onReady,
  onEnd,
}) => {
  const playerRef = useRef<YoutubeIframeRef>(null);

  useEffect(() => {
    if (playerRef.current) {
      onReady(playerRef.current);
    }
  }, [playerRef.current]);

  if (!videoId) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No video playing</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <YoutubePlayer
        ref={playerRef}
        height={220}
        videoId={videoId}
        play={playing}
        onReady={() => console.log('[YouTube] Player ready')}
        onChangeState={(state) => console.log('[YouTube] State:', state)}
        onError={(error) => console.error('[YouTube] Error:', error)}
        webViewProps={{
          androidLayerType: 'hardware',
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 16,
  },
});
```

**Step 2: Integrate into RoomScreen**

Modify `mobile/src/screens/RoomScreen.tsx`:
```typescript
// Add to imports
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { YouTubePlayer } from '../services/YouTubePlayer';
import { YoutubeIframeRef } from 'react-native-youtube-iframe';

// Add to component state
const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
const [isPlaying, setIsPlaying] = useState(false);
const youtubePlayerRef = useRef<YouTubePlayer | null>(null);

useEffect(() => {
  if (!socket || !syncManagerRef.current) return;

  // Initialize YouTube player
  youtubePlayerRef.current = new YouTubePlayer(syncManagerRef.current);

  // Listen for playback events
  socket.on('playback:start', async (event) => {
    console.log('[Room] Playback start:', event);

    if (event.youtubeVideoId && youtubePlayerRef.current) {
      setCurrentVideoId(event.youtubeVideoId);
      setIsPlaying(true);

      try {
        await youtubePlayerRef.current.handlePlaybackStart(event);
        syncManagerRef.current?.startSync(true);
      } catch (error) {
        console.error('[Room] Playback error:', error);
        Alert.alert('Playback Error', 'Failed to start video playback');
      }
    }
  });

  socket.on('playback:pause', async () => {
    if (youtubePlayerRef.current) {
      await youtubePlayerRef.current.handlePlaybackPause();
      setIsPlaying(false);
    }
  });

  socket.on('playback:stop', async () => {
    if (youtubePlayerRef.current) {
      await youtubePlayerRef.current.handlePlaybackStop();
      setIsPlaying(false);
      setCurrentVideoId(null);
    }
  });

  return () => {
    socket.off('playback:start');
    socket.off('playback:pause');
    socket.off('playback:stop');
    youtubePlayerRef.current?.destroy();
  };
}, [socket]);

const handlePlayerReady = (playerRef: YoutubeIframeRef) => {
  if (youtubePlayerRef.current) {
    youtubePlayerRef.current.setPlayerRef(playerRef);
  }
};

const handleVideoEnd = () => {
  if (!socket) return;
  // Notify server that video ended
  socket.emit('playback:stop');
};

// Add to render
return (
  <View style={styles.container}>
    {/* YouTube Player */}
    <YouTubePlayerView
      videoId={currentVideoId}
      playing={isPlaying}
      onReady={handlePlayerReady}
      onEnd={handleVideoEnd}
    />

    {/* Rest of UI */}
  </View>
);
```

**Step 3: Test synchronized playback**

1. Two devices join same room
2. User adds song to queue
3. Song starts playing on both devices
4. Verify sync <50ms drift
5. Test pause/resume
6. Test auto-play next song when current ends

**Step 4: Commit**

```bash
git add mobile/src/components mobile/src/screens mobile/src/services
git commit -m "feat: integrate YouTube player with synchronized playback"
```

---

## Final Verification

**Manual Testing Checklist:**

1. **Backend**
   - [ ] YouTube URL validation works
   - [ ] Queue CRUD operations functional
   - [ ] Voting system increments/decrements correctly
   - [ ] Auto-play next song when current ends
   - [ ] WebSocket events broadcast correctly

2. **Frontend**
   - [ ] Queue screen displays songs
   - [ ] Add song modal accepts YouTube URLs
   - [ ] Upvoting updates in real-time
   - [ ] YouTube player loads and plays videos
   - [ ] Synchronized playback <50ms drift

3. **Integration**
   - [ ] Multiple users can add songs
   - [ ] Votes update for all users in real-time
   - [ ] Highest voted song plays next
   - [ ] Currently playing badge shows correct song
   - [ ] Auto-play works when queue has songs

**Success Criteria:**

✅ **Phase 4 complete when:**
- All manual tests pass
- All automated tests pass (unit + e2e)
- Documentation complete
- Code committed and pushed

---

**Estimated Time:** 3-4 days with subagent-driven-development workflow

**Dependencies:** Phases 1-3 must be complete
