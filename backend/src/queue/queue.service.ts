import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueEntry } from '../entities/queue-entry.entity';
import { Room } from '../entities/room.entity';
import { User } from '../entities/user.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RedisService } from '../redis/redis.service';
import { YouTubeService } from '../youtube/youtube.service';
import { AddToQueueDto, QueueEntryDto, QueueStateDto } from './dto';

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
    @InjectRepository(RoomMember)
    private readonly roomMemberRepository: Repository<RoomMember>,
    private readonly redisService: RedisService,
    private readonly youtubeService: YouTubeService,
  ) {}

  /**
   * Add a song to the queue
   */
  async addToQueue(
    roomCode: string,
    userId: string,
    dto: AddToQueueDto,
  ): Promise<QueueEntryDto> {
    // Find room
    const room = await this.roomRepository.findOne({ where: { roomCode } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify user is a member
    const member = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });
    if (!member) {
      throw new ForbiddenException('You must be a member of this room');
    }

    // Validate YouTube URL and get video details
    const videoId = await this.youtubeService.validateUrl(dto.youtubeUrl);
    const videoDetails = await this.youtubeService.getVideoDetails(videoId);

    // Check if song is already in queue (unplayed)
    const existing = await this.queueEntryRepository.findOne({
      where: {
        roomId: room.id,
        youtubeVideoId: videoId,
        isPlayed: false,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'This song is already in the queue',
      );
    }

    // Create queue entry
    const queueEntry = this.queueEntryRepository.create({
      roomId: room.id,
      youtubeVideoId: videoId,
      youtubeUrl: dto.youtubeUrl,
      title: videoDetails.title,
      artist: videoDetails.channelTitle,
      thumbnailUrl: videoDetails.thumbnails.high?.url || videoDetails.thumbnails.medium?.url || videoDetails.thumbnails.default.url,
      durationSeconds: videoDetails.durationSeconds,
      addedById: userId,
      isPlayed: false,
    });

    await this.queueEntryRepository.save(queueEntry);

    // Get user details
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Return DTO
    return this.mapToDto(queueEntry, user, 0, 0, null);
  }

  /**
   * Get queue for a room with vote scores
   */
  async getQueueForRoom(
    roomCode: string,
    userId: string,
  ): Promise<QueueStateDto> {
    // Find room
    const room = await this.roomRepository.findOne({ where: { roomCode } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify user is a member
    const member = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });
    if (!member) {
      throw new ForbiddenException('You must be a member of this room');
    }

    // Get unplayed entries
    const entries = await this.queueEntryRepository.find({
      where: { roomId: room.id, isPlayed: false },
      relations: ['addedBy'],
      order: { createdAt: 'ASC' },
    });

    // Get vote counts using Redis pipeline for better performance
    const redis = this.redisService.getClient();
    const pipeline = redis.pipeline();

    // Batch all Redis operations
    entries.forEach((entry) => {
      pipeline.scard(`queue:${entry.id}:upvotes`);
      pipeline.scard(`queue:${entry.id}:downvotes`);
      pipeline.sismember(`queue:${entry.id}:upvotes`, userId);
      pipeline.sismember(`queue:${entry.id}:downvotes`, userId);
    });

    const results = await pipeline.exec();

    if (!results) {
      throw new Error('Failed to fetch vote data from Redis');
    }

    // Process results and create DTOs
    const entriesWithScores = entries.map((entry, index) => {
      const baseIndex = index * 4;
      const upvoteCount = (results[baseIndex][1] as number) || 0;
      const downvoteCount = (results[baseIndex + 1][1] as number) || 0;
      const hasUpvoted = results[baseIndex + 2][1] === 1;
      const hasDownvoted = results[baseIndex + 3][1] === 1;
      const userVote = hasUpvoted ? 'up' : hasDownvoted ? 'down' : null;
      const netScore = upvoteCount - downvoteCount;

      return {
        entry,
        dto: this.mapToDto(entry, entry.addedBy, upvoteCount, downvoteCount, userVote as 'up' | 'down' | null),
        netScore,
      };
    });

    // Sort by net score descending (highest first)
    entriesWithScores.sort((a, b) => b.netScore - a.netScore);

    const sortedEntries = entriesWithScores.map((item) => item.dto);

    // Get currently playing song (if any)
    const currentlyPlaying = await this.getCurrentlyPlaying(room.id, userId);

    return {
      entries: sortedEntries,
      currentlyPlaying,
      totalEntries: sortedEntries.length,
    };
  }

  /**
   * Get the currently playing song
   */
  private async getCurrentlyPlaying(
    roomId: string,
    userId: string,
  ): Promise<QueueEntryDto | null> {
    const playingEntry = await this.getNextSong(roomId);

    if (!playingEntry) {
      return null;
    }

    const { upvoteCount, downvoteCount } = await this.getVoteScore(playingEntry.id);
    const userVote = await this.getUserVote(playingEntry.id, userId);

    return this.mapToDto(playingEntry, playingEntry.addedBy, upvoteCount, downvoteCount, userVote);
  }

  /**
   * Remove an entry from the queue
   */
  async removeFromQueue(
    roomCode: string,
    entryId: string,
    userId: string,
  ): Promise<{ message: string }> {
    // Find room
    const room = await this.roomRepository.findOne({ where: { roomCode } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Find entry
    const entry = await this.queueEntryRepository.findOne({
      where: { id: entryId, roomId: room.id },
    });
    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    // Check if user is the creator or if entry should be auto-removed
    const isCreator = entry.addedById === userId;
    const shouldAutoRemove = await this.shouldAutoRemove(entryId, room.id);

    if (!isCreator && !shouldAutoRemove) {
      throw new ForbiddenException(
        'You can only remove your own songs',
      );
    }

    // Remove entry
    await this.queueEntryRepository.remove(entry);

    // Clean up votes from Redis
    await this.cleanupVotes(entryId);

    return { message: 'Song removed from queue' };
  }

  /**
   * Mark a song as played
   */
  async markAsPlayed(entryId: string): Promise<void> {
    const entry = await this.queueEntryRepository.findOne({
      where: { id: entryId },
    });

    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    entry.isPlayed = true;
    entry.playedAt = new Date();
    await this.queueEntryRepository.save(entry);

    // Clean up votes from Redis
    await this.cleanupVotes(entryId);
  }

  /**
   * Get the next song to play (highest net score)
   */
  async getNextSong(roomId: string): Promise<QueueEntry | null> {
    const entries = await this.queueEntryRepository.find({
      where: { roomId, isPlayed: false },
      relations: ['addedBy'],
    });

    if (entries.length === 0) {
      return null;
    }

    // Get scores for all entries
    const entriesWithScores = await Promise.all(
      entries.map(async (entry) => {
        const { upvoteCount, downvoteCount } = await this.getVoteScore(entry.id);
        return {
          entry,
          netScore: upvoteCount - downvoteCount,
        };
      }),
    );

    // Sort by net score descending and return the first one
    entriesWithScores.sort((a, b) => b.netScore - a.netScore);

    return entriesWithScores[0].entry;
  }

  /**
   * Upvote an entry
   */
  async upvoteEntry(
    roomCode: string,
    entryId: string,
    userId: string,
  ): Promise<{ entry: QueueEntryDto | null; wasAutoRemoved: boolean }> {
    // Find room
    const room = await this.roomRepository.findOne({ where: { roomCode } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify user is a member
    const member = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });
    if (!member) {
      throw new ForbiddenException('You must be a member of this room');
    }

    // Find entry
    const entry = await this.queueEntryRepository.findOne({
      where: { id: entryId, roomId: room.id, isPlayed: false },
      relations: ['addedBy'],
    });
    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    // Prevent voting on own songs
    if (entry.addedById === userId) {
      throw new BadRequestException('You cannot vote on your own song');
    }

    // Check if user has already voted
    const hasVoted = await this.hasUserVoted(entryId, userId);
    if (hasVoted) {
      throw new BadRequestException('You have already voted on this song');
    }

    // Add upvote to Redis
    const redis = this.redisService.getClient();
    await redis.sadd(`queue:${entryId}:upvotes`, userId);
    // Set 7-day TTL to prevent memory leaks
    await redis.expire(`queue:${entryId}:upvotes`, 7 * 24 * 60 * 60);

    // Get updated scores
    const { upvoteCount, downvoteCount } = await this.getVoteScore(entryId);

    // Return updated DTO (upvotes don't auto-remove, so wasAutoRemoved is always false)
    return {
      entry: this.mapToDto(entry, entry.addedBy, upvoteCount, downvoteCount, 'up'),
      wasAutoRemoved: false,
    };
  }

  /**
   * Downvote an entry
   */
  async downvoteEntry(
    roomCode: string,
    entryId: string,
    userId: string,
  ): Promise<{ entry: QueueEntryDto | null; wasAutoRemoved: boolean }> {
    // Find room
    const room = await this.roomRepository.findOne({ where: { roomCode } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify user is a member
    const member = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });
    if (!member) {
      throw new ForbiddenException('You must be a member of this room');
    }

    // Find entry
    const entry = await this.queueEntryRepository.findOne({
      where: { id: entryId, roomId: room.id, isPlayed: false },
      relations: ['addedBy'],
    });
    if (!entry) {
      throw new NotFoundException('Queue entry not found');
    }

    // Prevent voting on own songs
    if (entry.addedById === userId) {
      throw new BadRequestException('You cannot vote on your own song');
    }

    // Check if user has already voted
    const hasVoted = await this.hasUserVoted(entryId, userId);
    if (hasVoted) {
      throw new BadRequestException('You have already voted on this song');
    }

    // Add downvote to Redis
    const redis = this.redisService.getClient();
    await redis.sadd(`queue:${entryId}:downvotes`, userId);
    // Set 7-day TTL to prevent memory leaks
    await redis.expire(`queue:${entryId}:downvotes`, 7 * 24 * 60 * 60);

    // Get updated scores
    const { upvoteCount, downvoteCount } = await this.getVoteScore(entryId);

    // Check if song should be auto-removed
    await this.checkAndRemoveDownvoted(entryId, room.id);

    // Reload entry after potential auto-removal to check if it still exists
    const reloadedEntry = await this.queueEntryRepository.findOne({
      where: { id: entryId },
      relations: ['addedBy'],
    });

    // If entry was auto-removed, return null entry with wasAutoRemoved = true
    if (!reloadedEntry) {
      this.logger.log(`Entry ${entryId} was auto-removed after downvote`);
      return { entry: null, wasAutoRemoved: true };
    }

    // Return updated DTO with reloaded entry
    return {
      entry: this.mapToDto(reloadedEntry, reloadedEntry.addedBy, upvoteCount, downvoteCount, 'down'),
      wasAutoRemoved: false,
    };
  }

  /**
   * Get vote score for an entry
   */
  async getVoteScore(entryId: string): Promise<{
    upvoteCount: number;
    downvoteCount: number;
  }> {
    const redis = this.redisService.getClient();

    const upvoteCount = await redis.scard(`queue:${entryId}:upvotes`);
    const downvoteCount = await redis.scard(`queue:${entryId}:downvotes`);

    return { upvoteCount, downvoteCount };
  }

  /**
   * Check if user has voted (either up or down)
   */
  async hasUserVoted(entryId: string, userId: string): Promise<boolean> {
    const redis = this.redisService.getClient();

    const hasUpvoted = await redis.sismember(`queue:${entryId}:upvotes`, userId);
    const hasDownvoted = await redis.sismember(`queue:${entryId}:downvotes`, userId);

    return hasUpvoted === 1 || hasDownvoted === 1;
  }

  /**
   * Get user's vote on an entry
   */
  async getUserVote(entryId: string, userId: string): Promise<'up' | 'down' | null> {
    const redis = this.redisService.getClient();

    const hasUpvoted = await redis.sismember(`queue:${entryId}:upvotes`, userId);
    if (hasUpvoted === 1) {
      return 'up';
    }

    const hasDownvoted = await redis.sismember(`queue:${entryId}:downvotes`, userId);
    if (hasDownvoted === 1) {
      return 'down';
    }

    return null;
  }

  /**
   * Check if entry should be auto-removed based on downvote percentage
   */
  private async shouldAutoRemove(entryId: string, roomId: string): Promise<boolean> {
    const totalMembers = await this.roomMemberRepository.count({
      where: { roomId },
    });

    // Auto-remove all songs when room is empty
    if (totalMembers === 0) {
      return true;
    }

    const { downvoteCount } = await this.getVoteScore(entryId);
    const downvotePercentage = downvoteCount / totalMembers;

    return downvotePercentage >= 0.51;
  }

  /**
   * Check and remove entry if it has 51%+ downvotes
   */
  async checkAndRemoveDownvoted(entryId: string, roomId: string): Promise<void> {
    const shouldRemove = await this.shouldAutoRemove(entryId, roomId);

    if (shouldRemove) {
      const entry = await this.queueEntryRepository.findOne({
        where: { id: entryId },
      });

      if (entry) {
        this.logger.log(`Auto-removing entry ${entryId} due to 51%+ downvotes`);
        await this.queueEntryRepository.remove(entry);
        await this.cleanupVotes(entryId);
      }
    }
  }

  /**
   * Clean up votes from Redis when entry is removed
   */
  private async cleanupVotes(entryId: string): Promise<void> {
    const redis = this.redisService.getClient();
    await redis.del(`queue:${entryId}:upvotes`);
    await redis.del(`queue:${entryId}:downvotes`);
  }

  /**
   * Map QueueEntry to QueueEntryDto
   */
  private mapToDto(
    entry: QueueEntry,
    user: User | null,
    upvoteCount: number,
    downvoteCount: number,
    userVote: 'up' | 'down' | null,
  ): QueueEntryDto {
    if (!user) {
      throw new NotFoundException('User not found for queue entry');
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
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      upvoteCount,
      downvoteCount,
      netScore: upvoteCount - downvoteCount,
      userVote,
      isPlayed: entry.isPlayed,
      createdAt: entry.createdAt,
    };
  }
}
