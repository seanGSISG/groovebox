import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Vote, VoteType } from '../entities/vote.entity';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RoomDjHistory, RemovalReason } from '../entities/room-dj-history.entity';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';
import {
  StartVoteDto,
  CastVoteDto,
  VoteResultsDto,
  VoteCounts,
  MutinyVoteCounts,
} from './dto';

@Injectable()
export class VotesService {
  private readonly VOTE_EXPIRY_SECONDS = 300; // 5 minutes
  private readonly MUTINY_COOLDOWN_SECONDS = 600; // 10 minutes

  constructor(
    @InjectRepository(Vote)
    private readonly voteRepository: Repository<Vote>,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    @InjectRepository(RoomMember)
    private readonly roomMemberRepository: Repository<RoomMember>,
    @InjectRepository(RoomDjHistory)
    private readonly roomDjHistoryRepository: Repository<RoomDjHistory>,
    private readonly redisService: RedisService,
    private readonly roomsService: RoomsService,
  ) {}

  /**
   * Generate a unique vote session ID
   */
  private generateVoteSessionId(): string {
    return uuidv4();
  }

  /**
   * Start a new DJ election
   */
  async startDjElection(roomId: string): Promise<VoteResultsDto> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const redis = this.redisService.getClient();

    // Check for concurrent vote prevention
    const activeVoteKey = `room:${roomId}:active_vote`;
    const activeVote = await redis.get(activeVoteKey);
    if (activeVote) {
      throw new ConflictException('Another vote is already in progress in this room');
    }

    const totalVoters = await this.roomMemberRepository.count({
      where: { roomId },
    });

    const voteSessionId = this.generateVoteSessionId();

    // Store active vote session ID
    await redis.setex(activeVoteKey, this.VOTE_EXPIRY_SECONDS, voteSessionId);

    // Store vote session metadata in Redis
    const voteKey = `vote:${voteSessionId}`;
    await redis.hset(voteKey, {
      voteType: VoteType.DJ_ELECTION,
      roomId,
      totalVoters: totalVoters.toString(),
      isComplete: 'false',
    });
    await redis.expire(voteKey, this.VOTE_EXPIRY_SECONDS);

    return {
      voteSessionId,
      voteType: VoteType.DJ_ELECTION,
      isComplete: false,
      totalVoters,
      voteCounts: {},
    };
  }

  /**
   * Start a new mutiny vote
   */
  async startMutiny(roomId: string, initiatorId: string): Promise<VoteResultsDto> {
    const room = await this.roomRepository.findOne({ where: { id: roomId } });
    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const redis = this.redisService.getClient();

    // Check for concurrent vote prevention
    const activeVoteKey = `room:${roomId}:active_vote`;
    const activeVote = await redis.get(activeVoteKey);
    if (activeVote) {
      throw new ConflictException('Another vote is already in progress in this room');
    }

    // Check mutiny cooldown
    const cooldownKey = `room:${roomId}:mutiny_cooldown`;
    const cooldown = await redis.get(cooldownKey);
    if (cooldown) {
      throw new ConflictException('Mutiny is on cooldown. Please wait before starting another.');
    }

    const totalVoters = await this.roomMemberRepository.count({
      where: { roomId },
    });

    const voteSessionId = this.generateVoteSessionId();

    // Store active vote session ID
    await redis.setex(activeVoteKey, this.VOTE_EXPIRY_SECONDS, voteSessionId);

    // Store vote session metadata
    const voteKey = `vote:${voteSessionId}`;
    await redis.hset(voteKey, {
      voteType: VoteType.MUTINY,
      roomId,
      totalVoters: totalVoters.toString(),
      isComplete: 'false',
      yesVotes: '0',
      noVotes: '0',
      threshold: room.settings.mutinyThreshold.toString(),
    });
    await redis.expire(voteKey, this.VOTE_EXPIRY_SECONDS);

    // Set cooldown
    await redis.setex(cooldownKey, this.MUTINY_COOLDOWN_SECONDS, '1');

    return {
      voteSessionId,
      voteType: VoteType.MUTINY,
      isComplete: false,
      totalVoters,
      mutinyVotes: { yes: 0, no: 0 },
      threshold: room.settings.mutinyThreshold,
    };
  }

  /**
   * Cast a vote in an active session
   */
  async castVote(
    roomId: string,
    userId: string,
    castVoteDto: CastVoteDto,
  ): Promise<VoteResultsDto> {
    const { voteSessionId, targetUserId, voteValue } = castVoteDto;
    const redis = this.redisService.getClient();
    const voteKey = `vote:${voteSessionId}`;

    // Check if vote session exists
    const voteData = await redis.hgetall(voteKey);
    if (!voteData || Object.keys(voteData).length === 0) {
      throw new NotFoundException('Vote session not found or expired');
    }

    if (voteData.roomId !== roomId) {
      throw new BadRequestException('Vote session does not belong to this room');
    }

    // Check if user already voted
    const userVoteKey = `voter:${userId}`;
    const existingVote = await redis.hget(voteKey, userVoteKey);
    if (existingVote) {
      throw new ConflictException('You have already voted in this session');
    }

    const voteType = voteData.voteType as VoteType;

    if (voteType === VoteType.DJ_ELECTION) {
      if (!targetUserId) {
        throw new BadRequestException('Target user ID is required for DJ election');
      }

      // Record vote in PostgreSQL
      const vote = this.voteRepository.create({
        roomId,
        voterId: userId,
        voteType: VoteType.DJ_ELECTION,
        targetUserId,
        voteSessionId,
      });
      await this.voteRepository.save(vote);

      // Check if this is the first vote for this candidate (for tie-breaking)
      const firstVoteKey = `first_vote:${targetUserId}`;
      const hasFirstVote = await redis.hexists(voteKey, firstVoteKey);
      if (!hasFirstVote) {
        // Store timestamp when this candidate received their first vote
        await redis.hset(voteKey, firstVoteKey, Date.now().toString());
      }

      // Update Redis counters atomically
      await redis.hset(voteKey, userVoteKey, targetUserId);
      await redis.hincrby(voteKey, `vote_count:${targetUserId}`, 1);
    } else if (voteType === VoteType.MUTINY) {
      if (voteValue === undefined) {
        throw new BadRequestException('Vote value (yes/no) is required for mutiny');
      }

      // Record vote in PostgreSQL
      const vote = this.voteRepository.create({
        roomId,
        voterId: userId,
        voteType: VoteType.MUTINY,
        voteSessionId,
        targetUserId: null, // Mutiny doesn't target a specific user
      });
      await this.voteRepository.save(vote);

      // Update Redis counters
      await redis.hset(voteKey, userVoteKey, voteValue ? 'yes' : 'no');
      const voteField = voteValue ? 'yesVotes' : 'noVotes';
      await redis.hincrby(voteKey, voteField, 1);
    }

    return this.getVoteResults(voteSessionId);
  }

  /**
   * Get current vote results
   */
  async getVoteResults(voteSessionId: string): Promise<VoteResultsDto> {
    const redis = this.redisService.getClient();
    const voteKey = `vote:${voteSessionId}`;
    const voteData = await redis.hgetall(voteKey);

    if (!voteData || Object.keys(voteData).length === 0) {
      throw new NotFoundException('Vote session not found or expired');
    }

    const voteType = voteData.voteType as VoteType;
    const totalVoters = parseInt(voteData.totalVoters, 10);
    const isComplete = voteData.isComplete === 'true';

    if (voteType === VoteType.DJ_ELECTION) {
      const voteCounts: VoteCounts = {};
      const firstVoteTimestamps: { [userId: string]: number } = {};
      let winner: string | undefined;

      // Extract vote counts and first vote timestamps
      for (const [key, value] of Object.entries(voteData)) {
        if (key.startsWith('vote_count:')) {
          const userId = key.replace('vote_count:', '');
          voteCounts[userId] = parseInt(value as string, 10);
        } else if (key.startsWith('first_vote:')) {
          const userId = key.replace('first_vote:', '');
          firstVoteTimestamps[userId] = parseInt(value as string, 10);
        }
      }

      // Determine winner (most votes, with tie-breaking)
      if (isComplete) {
        let maxVotes = 0;
        const candidates: string[] = [];

        // Find the maximum vote count
        for (const [userId, count] of Object.entries(voteCounts)) {
          if (count > maxVotes) {
            maxVotes = count;
            candidates.length = 0; // Clear previous candidates
            candidates.push(userId);
          } else if (count === maxVotes) {
            candidates.push(userId);
          }
        }

        // If there's a tie, select the candidate who received votes first
        if (candidates.length > 1) {
          winner = candidates.reduce((earliest, current) => {
            const earliestTime = firstVoteTimestamps[earliest] || Infinity;
            const currentTime = firstVoteTimestamps[current] || Infinity;
            return currentTime < earliestTime ? current : earliest;
          });
        } else if (candidates.length === 1) {
          winner = candidates[0];
        }
      }

      return {
        voteSessionId,
        voteType: VoteType.DJ_ELECTION,
        isComplete,
        totalVoters,
        voteCounts,
        winner,
      };
    } else if (voteType === VoteType.MUTINY) {
      const yesVotes = parseInt(voteData.yesVotes || '0', 10);
      const noVotes = parseInt(voteData.noVotes || '0', 10);
      const threshold = parseFloat(voteData.threshold);
      const totalVotes = yesVotes + noVotes;
      const mutinyPassed = totalVotes > 0 && yesVotes / totalVoters >= threshold;

      return {
        voteSessionId,
        voteType: VoteType.MUTINY,
        isComplete,
        totalVoters,
        mutinyVotes: { yes: yesVotes, no: noVotes },
        threshold,
        mutinyPassed: isComplete ? mutinyPassed : undefined,
      };
    }

    throw new BadRequestException('Invalid vote type');
  }

  /**
   * Complete a vote session and apply results
   */
  async completeVote(voteSessionId: string): Promise<VoteResultsDto> {
    const redis = this.redisService.getClient();
    const voteKey = `vote:${voteSessionId}`;

    // Get vote data before marking complete
    const voteData = await redis.hgetall(voteKey);
    const roomId = voteData.roomId;

    // Mark as complete
    await redis.hset(voteKey, 'isComplete', 'true');

    const results = await this.getVoteResults(voteSessionId);

    // Clean up active vote key
    const activeVoteKey = `room:${roomId}:active_vote`;
    await redis.del(activeVoteKey);

    if (results.voteType === VoteType.DJ_ELECTION && results.winner) {
      // Set new DJ using vote-specific method
      await this.roomsService.setDjByVote(roomId, results.winner);
    } else if (results.voteType === VoteType.MUTINY && results.mutinyPassed) {
      // Remove current DJ
      await this.roomsService.removeDj(roomId, RemovalReason.MUTINY);
    }

    return results;
  }

  /**
   * Check if user is on DJ cooldown
   */
  async isDjCooldown(roomId: string, userId: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    const cooldownKey = `room:${roomId}:dj_cooldown:${userId}`;
    const cooldown = await redis.get(cooldownKey);
    return !!cooldown;
  }

  /**
   * Set DJ cooldown for user
   */
  async setDjCooldown(roomId: string, userId: string, minutes: number): Promise<void> {
    const redis = this.redisService.getClient();
    const cooldownKey = `room:${roomId}:dj_cooldown:${userId}`;
    await redis.setex(cooldownKey, minutes * 60, '1');
  }
}
