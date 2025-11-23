import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, QueryRunner } from 'typeorm';
import { Vote, VoteType } from '../entities/vote.entity';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RoomDjHistory, RemovalReason } from '../entities/room-dj-history.entity';
import { User } from '../entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { StartVoteDto, CastVoteDto, VoteStateDto } from './dto';
import { v4 as uuidv4 } from 'uuid';

interface VoteSessionData {
  voteSessionId: string;
  roomId: string;
  voteType: VoteType;
  targetUserId: string | null;
  initiatorId: string;
  votesFor: number;
  votesAgainst: number;
  totalEligibleVoters: number;
  requiredVotes: number;
  threshold: number;
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
  passed: boolean | null;
}

@Injectable()
export class VotingService {
  constructor(
    @InjectRepository(Vote)
    private voteRepository: Repository<Vote>,
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(RoomMember)
    private roomMemberRepository: Repository<RoomMember>,
    @InjectRepository(RoomDjHistory)
    private djHistoryRepository: Repository<RoomDjHistory>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private redisService: RedisService,
    private dataSource: DataSource,
  ) {}

  async startVote(
    roomId: string,
    initiatorId: string,
    startVoteDto: StartVoteDto,
  ): Promise<{ voteSessionId: string; voteState: VoteStateDto }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const room = await queryRunner.manager.findOne(Room, { where: { id: roomId } });
      if (!room) {
        throw new NotFoundException('Room not found');
      }

      // Check if there's an active vote session (inside transaction)
      const activeVote = await queryRunner.manager.findOne(Vote, {
        where: { roomId, isActive: true },
      });

      if (activeVote) {
        throw new BadRequestException('A vote is already in progress');
      }

      // Validate vote type specific rules
      if (startVoteDto.voteType === VoteType.DJ_ELECTION) {
        if (!startVoteDto.targetUserId) {
          throw new BadRequestException('Target user required for DJ election');
        }

        // Check if target is a room member
        const targetMember = await queryRunner.manager.findOne(RoomMember, {
          where: { roomId, userId: startVoteDto.targetUserId },
        });

        if (!targetMember) {
          throw new BadRequestException('Target user is not a room member');
        }

        // Check if target is already DJ
        const currentDjId = await this.redisService.getCurrentDj(roomId);
        if (currentDjId === startVoteDto.targetUserId) {
          throw new BadRequestException('User is already the DJ');
        }

        // Check DJ cooldown
        const lastDjSession = await queryRunner.manager.findOne(RoomDjHistory, {
          where: { roomId, userId: startVoteDto.targetUserId },
          order: { becameDjAt: 'DESC' },
        });

        if (lastDjSession && !lastDjSession.removedAt) {
          throw new BadRequestException('User is currently DJ');
        }

        if (lastDjSession && lastDjSession.removedAt) {
          const cooldownMinutes = room.settings.djCooldownMinutes || 5;
          const cooldownEnd = new Date(lastDjSession.removedAt.getTime() + cooldownMinutes * 60000);
          if (new Date() < cooldownEnd) {
            const minutesLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / 60000);
            throw new BadRequestException(
              `User is in DJ cooldown. ${minutesLeft} minute(s) remaining.`
            );
          }
        }
      } else if (startVoteDto.voteType === VoteType.MUTINY) {
        // Check if there's a current DJ
        const currentDjId = await this.redisService.getCurrentDj(roomId);
        if (!currentDjId) {
          throw new BadRequestException('No DJ to mutiny against');
        }

        // Owner cannot be mutinied
        if (currentDjId === room.ownerId) {
          throw new BadRequestException('Cannot mutiny against room owner');
        }
      }

      // Create vote session
      const voteSessionId = uuidv4();

      // Get total eligible voters (all room members)
      const members = await queryRunner.manager.find(RoomMember, {
        where: { roomId },
      });

      const totalEligibleVoters = members.length;
      const threshold = room.settings.mutinyThreshold || 0.51;
      const requiredVotes = Math.ceil(totalEligibleVoters * threshold);

      // Store vote session in Redis
      await this.redisService.set(
        `vote:${voteSessionId}`,
        JSON.stringify({
          voteSessionId,
          roomId,
          voteType: startVoteDto.voteType,
          targetUserId: startVoteDto.targetUserId || null,
          initiatorId,
          votesFor: 0,
          votesAgainst: 0,
          totalEligibleVoters,
          requiredVotes,
          threshold,
          isActive: true,
          startedAt: new Date().toISOString(),
          endedAt: null,
          passed: null,
        }),
        300, // 5 minute TTL
      );

      await queryRunner.commitTransaction();

      const voteState = await this.getVoteState(voteSessionId);
      return { voteSessionId, voteState };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async castVote(
    voteSessionId: string,
    voterId: string,
    castVoteDto: CastVoteDto,
  ): Promise<VoteStateDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get vote session from Redis
      const voteSessionData = await this.redisService.get(`vote:${voteSessionId}`);
      if (!voteSessionData) {
        throw new NotFoundException('Vote session not found or expired');
      }

      const voteSession = JSON.parse(voteSessionData);

      if (!voteSession.isActive) {
        throw new BadRequestException('Vote session is no longer active');
      }

      // Check if user is a room member
      const member = await queryRunner.manager.findOne(RoomMember, {
        where: { roomId: voteSession.roomId, userId: voterId },
      });

      if (!member) {
        throw new ForbiddenException('You must be a room member to vote');
      }

      // Check if user already voted
      const existingVote = await queryRunner.manager.findOne(Vote, {
        where: { voteSessionId, voterId },
      });

      if (existingVote) {
        throw new BadRequestException('You have already voted');
      }

      // Create vote record
      const vote = queryRunner.manager.create(Vote, {
        roomId: voteSession.roomId,
        voterId,
        voteType: voteSession.voteType,
        targetUserId: voteSession.targetUserId,
        voteSessionId,
        voteFor: castVoteDto.voteFor,
        isActive: true,
      });

      await queryRunner.manager.save(vote);

      // Count votes in real-time from the database
      const votes = await queryRunner.manager.find(Vote, {
        where: { voteSessionId },
      });
      const votesFor = votes.filter(v => v.voteFor).length;
      const votesAgainst = votes.filter(v => !v.voteFor).length;

      // Update vote session with real counts
      voteSession.votesFor = votesFor;
      voteSession.votesAgainst = votesAgainst;

      // Check if vote passed or failed
      const totalVotes = voteSession.votesFor + voteSession.votesAgainst;
      let voteComplete = false;

      if (voteSession.votesFor >= voteSession.requiredVotes) {
        // Vote passed
        voteSession.passed = true;
        voteSession.isActive = false;
        voteSession.endedAt = new Date().toISOString();
        voteComplete = true;

        // Execute vote outcome
        await this.executeVoteOutcome(queryRunner, voteSession);
      } else if (totalVotes >= voteSession.totalEligibleVoters) {
        // All votes cast but didn't reach threshold
        voteSession.passed = false;
        voteSession.isActive = false;
        voteSession.endedAt = new Date().toISOString();
        voteComplete = true;
      } else if (
        voteSession.votesAgainst > voteSession.totalEligibleVoters - voteSession.requiredVotes
      ) {
        // Mathematically impossible to pass
        voteSession.passed = false;
        voteSession.isActive = false;
        voteSession.endedAt = new Date().toISOString();
        voteComplete = true;
      }

      // Update Redis with new vote counts
      await this.redisService.set(
        `vote:${voteSessionId}`,
        JSON.stringify(voteSession),
        voteComplete ? 60 : 300, // Shorter TTL for completed votes
      );

      await queryRunner.commitTransaction();

      return await this.getVoteState(voteSessionId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async executeVoteOutcome(queryRunner: QueryRunner, voteSession: VoteSessionData): Promise<void> {
    if (voteSession.voteType === VoteType.DJ_ELECTION) {
      // Get current DJ
      const currentDjId = await this.redisService.getCurrentDj(voteSession.roomId);

      // End current DJ's session if exists
      if (currentDjId) {
        await queryRunner.manager.update(
          RoomDjHistory,
          { roomId: voteSession.roomId, userId: currentDjId, removedAt: null },
          { removedAt: new Date(), removalReason: RemovalReason.VOTE },
        );
      }

      // Set new DJ
      await this.redisService.setCurrentDj(voteSession.roomId, voteSession.targetUserId);

      // Create DJ history entry
      const djHistory = queryRunner.manager.create(RoomDjHistory, {
        roomId: voteSession.roomId,
        userId: voteSession.targetUserId!,
        becameDjAt: new Date(),
      });

      await queryRunner.manager.save(djHistory);
    } else if (voteSession.voteType === VoteType.MUTINY) {
      // Get current DJ
      const currentDjId = await this.redisService.getCurrentDj(voteSession.roomId);

      if (currentDjId) {
        // Remove DJ
        await this.redisService.removeCurrentDj(voteSession.roomId);

        // Update DJ history
        await queryRunner.manager.update(
          RoomDjHistory,
          { roomId: voteSession.roomId, userId: currentDjId, removedAt: null },
          { removedAt: new Date(), removalReason: RemovalReason.MUTINY },
        );
      }
    }

    // Deactivate all votes in this session
    await queryRunner.manager.update(
      Vote,
      { voteSessionId: voteSession.voteSessionId },
      { isActive: false },
    );
  }

  async getVoteState(voteSessionId: string): Promise<VoteStateDto> {
    const voteSessionData = await this.redisService.get(`vote:${voteSessionId}`);
    if (!voteSessionData) {
      throw new NotFoundException('Vote session not found');
    }

    const voteSession = JSON.parse(voteSessionData);

    let targetUsername: string | null = null;
    if (voteSession.targetUserId) {
      const targetUser = await this.userRepository.findOne({
        where: { id: voteSession.targetUserId },
      });
      targetUsername = targetUser?.displayName || targetUser?.username || null;
    }

    return {
      voteSessionId: voteSession.voteSessionId,
      voteType: voteSession.voteType,
      targetUserId: voteSession.targetUserId,
      targetUsername,
      votesFor: voteSession.votesFor,
      votesAgainst: voteSession.votesAgainst,
      totalEligibleVoters: voteSession.totalEligibleVoters,
      requiredVotes: voteSession.requiredVotes,
      threshold: voteSession.threshold,
      isActive: voteSession.isActive,
      startedAt: new Date(voteSession.startedAt),
      endedAt: voteSession.endedAt ? new Date(voteSession.endedAt) : null,
      passed: voteSession.passed,
    };
  }

  async getActiveVote(roomId: string): Promise<VoteStateDto | null> {
    const activeVote = await this.voteRepository.findOne({
      where: { roomId, isActive: true },
    });

    if (!activeVote || !activeVote.voteSessionId) {
      return null;
    }

    return await this.getVoteState(activeVote.voteSessionId);
  }
}
