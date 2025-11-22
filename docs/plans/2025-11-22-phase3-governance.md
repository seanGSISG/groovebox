# Phase 3: Mutiny & Democratic Governance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with code review between tasks.

**Goal:** Implement democratic DJ selection through voting, mutiny system for removing DJs, and randomization features to enable collaborative room governance.

**Architecture:** Backend voting system with Redis-backed vote tracking and atomic operations, WebSocket events for real-time vote updates, frontend vote UI with real-time progress tracking, and DJ cooldown enforcement via Redis TTL.

**Tech Stack:**
- Backend: NestJS + TypeORM + Redis + Socket.io
- Frontend: React Native + TypeScript + Socket.io-client
- Existing entities: Vote, RoomDjHistory (already created in Phase 1)

---

## Task 1: Backend - Votes Module Foundation

**Goal:** Create votes module with service, controller, and DTOs for managing vote sessions.

**Files:**
- Create: `backend/src/votes/votes.module.ts`
- Create: `backend/src/votes/votes.service.ts`
- Create: `backend/src/votes/votes.service.spec.ts`
- Create: `backend/src/votes/votes.controller.ts`
- Create: `backend/src/votes/dto/index.ts`
- Create: `backend/src/votes/dto/start-vote.dto.ts`
- Create: `backend/src/votes/dto/cast-vote.dto.ts`
- Create: `backend/src/votes/dto/vote-results.dto.ts`
- Modify: `backend/src/app.module.ts`

### Step 1: Create DTOs

Create `backend/src/votes/dto/start-vote.dto.ts`:
```typescript
import { IsEnum, IsUUID, IsOptional } from 'class-validator';
import { VoteType } from '../../entities/vote.entity';

export class StartVoteDto {
  @IsEnum(VoteType)
  voteType: VoteType;

  @IsUUID()
  @IsOptional()
  targetUserId?: string; // For DJ_ELECTION, the user being voted for
}
```

Create `backend/src/votes/dto/cast-vote.dto.ts`:
```typescript
import { IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class CastVoteDto {
  @IsUUID()
  voteSessionId: string;

  @IsUUID()
  @IsOptional()
  targetUserId?: string; // For DJ_ELECTION

  @IsBoolean()
  @IsOptional()
  voteValue?: boolean; // For MUTINY (true=yes, false=no)
}
```

Create `backend/src/votes/dto/vote-results.dto.ts`:
```typescript
export interface VoteCounts {
  [userId: string]: number; // For DJ_ELECTION
}

export interface MutinyVoteCounts {
  yes: number;
  no: number;
}

export class VoteResultsDto {
  voteSessionId: string;
  voteType: string;
  isComplete: boolean;
  voteCounts?: VoteCounts; // For DJ_ELECTION
  mutinyVotes?: MutinyVoteCounts; // For MUTINY
  totalVoters: number;
  threshold?: number; // For MUTINY
  winner?: string; // userId of winner (DJ_ELECTION)
  mutinyPassed?: boolean; // For MUTINY
}
```

Create `backend/src/votes/dto/index.ts`:
```typescript
export * from './start-vote.dto';
export * from './cast-vote.dto';
export * from './vote-results.dto';
```

### Step 2: Create votes module

Create `backend/src/votes/votes.module.ts`:
```typescript
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VotesService } from './votes.service';
import { VotesController } from './votes.controller';
import { Vote } from '../entities/vote.entity';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RoomDjHistory } from '../entities/room-dj-history.entity';
import { RedisModule } from '../redis/redis.module';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vote, Room, RoomMember, RoomDjHistory]),
    RedisModule,
    forwardRef(() => RoomsModule),
  ],
  controllers: [VotesController],
  providers: [VotesService],
  exports: [VotesService],
})
export class VotesModule {}
```

### Step 3: Write failing test for VotesService

Create `backend/src/votes/votes.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VotesService } from './votes.service';
import { Vote, VoteType } from '../entities/vote.entity';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RoomDjHistory } from '../entities/room-dj-history.entity';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';
import { v4 as uuidv4 } from 'uuid';

describe('VotesService', () => {
  let service: VotesService;
  let voteRepository: Repository<Vote>;
  let roomRepository: Repository<Room>;
  let roomMemberRepository: Repository<RoomMember>;
  let redisService: RedisService;

  const mockVoteRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockRoomRepository = {
    findOne: jest.fn(),
  };

  const mockRoomMemberRepository = {
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(() => ({
      hset: jest.fn(),
      hget: jest.fn(),
      hgetall: jest.fn(),
      hincrby: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
      setex: jest.fn(),
      get: jest.fn(),
    })),
  };

  const mockRoomsService = {
    setDj: jest.fn(),
    removeDj: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotesService,
        {
          provide: getRepositoryToken(Vote),
          useValue: mockVoteRepository,
        },
        {
          provide: getRepositoryToken(Room),
          useValue: mockRoomRepository,
        },
        {
          provide: getRepositoryToken(RoomMember),
          useValue: mockRoomMemberRepository,
        },
        {
          provide: getRepositoryToken(RoomDjHistory),
          useValue: {},
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: RoomsService,
          useValue: mockRoomsService,
        },
      ],
    }).compile();

    service = module.get<VotesService>(VotesService);
    voteRepository = module.get<Repository<Vote>>(getRepositoryToken(Vote));
    roomRepository = module.get<Repository<Room>>(getRepositoryToken(Room));
    roomMemberRepository = module.get<Repository<RoomMember>>(getRepositoryToken(RoomMember));
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startDjElection', () => {
    it('should create a new DJ election vote session', async () => {
      const roomId = uuidv4();
      const voteSessionId = uuidv4();

      mockRoomRepository.findOne.mockResolvedValue({
        id: roomId,
        roomCode: 'ABC123',
        settings: { mutinyThreshold: 0.51 },
      });

      mockRoomMemberRepository.count.mockResolvedValue(5);

      jest.spyOn(service as any, 'generateVoteSessionId').mockReturnValue(voteSessionId);

      const result = await service.startDjElection(roomId);

      expect(result.voteSessionId).toBe(voteSessionId);
      expect(result.voteType).toBe(VoteType.DJ_ELECTION);
      expect(result.totalVoters).toBe(5);
      expect(mockRedisService.getClient().hset).toHaveBeenCalled();
    });
  });

  describe('castVote', () => {
    it('should cast a vote for DJ election', async () => {
      const roomId = uuidv4();
      const userId = uuidv4();
      const targetUserId = uuidv4();
      const voteSessionId = uuidv4();

      const redisClient = mockRedisService.getClient();
      redisClient.hget.mockResolvedValue(null); // User hasn't voted yet
      redisClient.hgetall.mockResolvedValue({
        voteType: VoteType.DJ_ELECTION,
        roomId,
        totalVoters: '5',
      });

      mockVoteRepository.create.mockReturnValue({});
      mockVoteRepository.save.mockResolvedValue({});

      await service.castVote(roomId, userId, {
        voteSessionId,
        targetUserId,
      });

      expect(voteRepository.save).toHaveBeenCalled();
      expect(redisClient.hset).toHaveBeenCalled();
      expect(redisClient.hincrby).toHaveBeenCalled();
    });

    it('should not allow voting twice', async () => {
      const roomId = uuidv4();
      const userId = uuidv4();
      const targetUserId = uuidv4();
      const voteSessionId = uuidv4();

      const redisClient = mockRedisService.getClient();
      redisClient.hget.mockResolvedValue(targetUserId); // User already voted

      await expect(
        service.castVote(roomId, userId, {
          voteSessionId,
          targetUserId,
        }),
      ).rejects.toThrow('You have already voted in this session');
    });
  });

  describe('getVoteResults', () => {
    it('should return vote results for DJ election', async () => {
      const voteSessionId = uuidv4();
      const userId1 = uuidv4();
      const userId2 = uuidv4();

      const redisClient = mockRedisService.getClient();
      redisClient.hgetall.mockResolvedValue({
        voteType: VoteType.DJ_ELECTION,
        roomId: uuidv4(),
        totalVoters: '5',
        [`vote_count:${userId1}`]: '3',
        [`vote_count:${userId2}`]: '2',
      });

      const results = await service.getVoteResults(voteSessionId);

      expect(results.voteType).toBe(VoteType.DJ_ELECTION);
      expect(results.voteCounts[userId1]).toBe(3);
      expect(results.voteCounts[userId2]).toBe(2);
    });
  });
});
```

### Step 4: Run test to verify it fails

Run:
```bash
cd /home/user/groovebox/backend
npm test -- votes.service.spec.ts
```

Expected: FAIL with "Cannot find module './votes.service'"

### Step 5: Write minimal VotesService implementation

Create `backend/src/votes/votes.service.ts`:
```typescript
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
import { RoomDjHistory } from '../entities/room-dj-history.entity';
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

    const totalVoters = await this.roomMemberRepository.count({
      where: { roomId },
    });

    const voteSessionId = this.generateVoteSessionId();
    const redis = this.redisService.getClient();

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

    // Check mutiny cooldown
    const redis = this.redisService.getClient();
    const cooldownKey = `room:${roomId}:mutiny_cooldown`;
    const cooldown = await redis.get(cooldownKey);
    if (cooldown) {
      throw new ConflictException('Mutiny is on cooldown. Please wait before starting another.');
    }

    const totalVoters = await this.roomMemberRepository.count({
      where: { roomId },
    });

    const voteSessionId = this.generateVoteSessionId();

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
      let winner: string | undefined;

      // Extract vote counts
      for (const [key, value] of Object.entries(voteData)) {
        if (key.startsWith('vote_count:')) {
          const userId = key.replace('vote_count:', '');
          voteCounts[userId] = parseInt(value as string, 10);
        }
      }

      // Determine winner (most votes)
      if (isComplete) {
        let maxVotes = 0;
        for (const [userId, count] of Object.entries(voteCounts)) {
          if (count > maxVotes) {
            maxVotes = count;
            winner = userId;
          }
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
      const mutinyPassed = totalVotes > 0 && yesVotes / totalVotes >= threshold;

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

    // Mark as complete
    await redis.hset(voteKey, 'isComplete', 'true');

    const results = await this.getVoteResults(voteSessionId);
    const voteData = await redis.hgetall(voteKey);
    const roomId = voteData.roomId;

    if (results.voteType === VoteType.DJ_ELECTION && results.winner) {
      // Set new DJ
      await this.roomsService.setDj(roomId, results.winner);
    } else if (results.voteType === VoteType.MUTINY && results.mutinyPassed) {
      // Remove current DJ
      await this.roomsService.removeDj(roomId, 'mutiny');
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
```

### Step 6: Create VotesController

Create `backend/src/votes/votes.controller.ts`:
```typescript
import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { VotesService } from './votes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CastVoteDto, VoteResultsDto } from './dto';

@Controller('votes')
@UseGuards(JwtAuthGuard)
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post(':sessionId/cast')
  async castVote(
    @Param('sessionId') sessionId: string,
    @Body() castVoteDto: CastVoteDto,
    @Req() req: any,
  ): Promise<VoteResultsDto> {
    const userId = req.user.userId;
    // Need to get roomId from session - will be handled by WebSocket primarily
    // This endpoint is for backup/manual testing
    throw new Error('Use WebSocket events for voting');
  }

  @Get(':sessionId')
  async getVoteResults(@Param('sessionId') sessionId: string): Promise<VoteResultsDto> {
    return this.votesService.getVoteResults(sessionId);
  }
}
```

### Step 7: Update app.module.ts

Modify `backend/src/app.module.ts`:
```typescript
// Add to imports array
import { VotesModule } from './votes/votes.module';

// Add VotesModule to the imports array in @Module decorator
```

### Step 8: Run tests to verify they pass

Run:
```bash
cd /home/user/groovebox/backend
npm test -- votes.service.spec.ts
```

Expected: All tests pass

### Step 9: Commit

```bash
git add src/votes/ src/app.module.ts
git commit -m "feat: add votes module with DJ election and mutiny support"
```

Expected: Changes committed successfully

---

## Task 2: Backend - DJ Election WebSocket Events

**Goal:** Add WebSocket events for initiating and tracking DJ elections in real-time.

**Files:**
- Modify: `backend/src/gateway/room.gateway.ts`
- Create: `backend/src/gateway/dto/vote-events.dto.ts`
- Modify: `backend/src/gateway/gateway.module.ts`

### Step 1: Create vote event DTOs

Create `backend/src/gateway/dto/vote-events.dto.ts`:
```typescript
import { IsUUID, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { VoteType } from '../../entities/vote.entity';

export class StartElectionDto {
  // No additional fields needed - initiated by any member
}

export class VoteForDjDto {
  @IsUUID()
  voteSessionId: string;

  @IsUUID()
  targetUserId: string;
}

export class VoteResultsEventDto {
  voteSessionId: string;
  voteType: string;
  isComplete: boolean;
  voteCounts?: { [userId: string]: number };
  mutinyVotes?: { yes: number; no: number };
  totalVoters: number;
  winner?: string;
  mutinyPassed?: boolean;
}
```

### Step 2: Write failing test for DJ election events

Modify `backend/src/gateway/room.gateway.spec.ts` to add:
```typescript
describe('DJ Election Events', () => {
  it('should start a DJ election', async () => {
    const mockClient = createMockClient('user1', 'socket1');
    const roomCode = 'ABC123';

    // Mock room membership
    mockRoomsService.getRoomByCode.mockResolvedValue({
      id: 'room1',
      roomCode,
    });
    mockRoomMemberRepository.findOne.mockResolvedValue({
      userId: 'user1',
      roomId: 'room1',
    });

    // Mock votes service
    mockVotesService.startDjElection.mockResolvedValue({
      voteSessionId: 'vote1',
      voteType: VoteType.DJ_ELECTION,
      isComplete: false,
      totalVoters: 5,
      voteCounts: {},
    });

    await gateway.handleStartElection(mockClient, roomCode);

    expect(mockVotesService.startDjElection).toHaveBeenCalledWith('room1');
    expect(mockServer.to).toHaveBeenCalledWith(`room:${roomCode}`);
  });

  it('should cast a vote for DJ', async () => {
    const mockClient = createMockClient('user1', 'socket1');
    const voteDto: VoteForDjDto = {
      voteSessionId: 'vote1',
      targetUserId: 'user2',
    };

    mockRoomMemberRepository.findOne.mockResolvedValue({
      userId: 'user1',
      roomId: 'room1',
    });

    mockVotesService.castVote.mockResolvedValue({
      voteSessionId: 'vote1',
      voteType: VoteType.DJ_ELECTION,
      isComplete: false,
      totalVoters: 5,
      voteCounts: { user2: 1 },
    });

    await gateway.handleVoteForDj(mockClient, voteDto);

    expect(mockVotesService.castVote).toHaveBeenCalledWith(
      'room1',
      'user1',
      {
        voteSessionId: 'vote1',
        targetUserId: 'user2',
      },
    );
  });
});
```

### Step 3: Run test to verify it fails

Run:
```bash
npm test -- room.gateway.spec.ts
```

Expected: FAIL with "handleStartElection is not a function"

### Step 4: Implement DJ election event handlers

Modify `backend/src/gateway/room.gateway.ts`:

Add imports:
```typescript
import { VotesService } from '../votes/votes.service';
import { StartElectionDto, VoteForDjDto } from './dto/vote-events.dto';
```

Add to constructor:
```typescript
constructor(
  // ... existing services
  private readonly votesService: VotesService,
) {}
```

Add event handlers:
```typescript
/**
 * Start a DJ election
 */
@SubscribeMessage('vote:start-election')
async handleStartElection(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() roomCode: string,
): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = await this.roomsService.getRoomByCode(roomCode);

    // Verify user is a member
    const membership = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });

    if (!membership) {
      throw new WsException('You are not a member of this room');
    }

    // Start election
    const voteResults = await this.votesService.startDjElection(room.id);

    // Broadcast to room
    this.server.to(`room:${roomCode}`).emit('vote:election-started', {
      ...voteResults,
      initiatorId: userId,
    });

    this.logger.log(`DJ election started in room ${roomCode} by user ${userId}`);
  } catch (error) {
    this.logger.error(`Start election error: ${error.message}`);
    throw new WsException(error.message);
  }
}

/**
 * Cast vote for DJ candidate
 */
@SubscribeMessage('vote:cast-dj')
async handleVoteForDj(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() voteDto: VoteForDjDto,
): Promise<void> {
  try {
    const userId = client.data.userId;

    // Get room ID from vote session
    const voteResults = await this.votesService.getVoteResults(voteDto.voteSessionId);
    const redis = this.redisService.getClient();
    const voteData = await redis.hgetall(`vote:${voteDto.voteSessionId}`);
    const roomId = voteData.roomId;

    // Cast vote
    const updatedResults = await this.votesService.castVote(roomId, userId, {
      voteSessionId: voteDto.voteSessionId,
      targetUserId: voteDto.targetUserId,
    });

    // Get room code
    const room = await this.roomRepository.findOne({ where: { id: roomId } });

    // Broadcast updated results
    this.server.to(`room:${room.roomCode}`).emit('vote:results-updated', updatedResults);

    // Check if everyone voted (auto-complete)
    const totalVoted = Object.keys(updatedResults.voteCounts || {}).reduce(
      (sum, key) => sum + updatedResults.voteCounts[key],
      0,
    );

    if (totalVoted >= updatedResults.totalVoters) {
      // Complete the vote
      const finalResults = await this.votesService.completeVote(voteDto.voteSessionId);
      this.server.to(`room:${room.roomCode}`).emit('vote:complete', finalResults);

      if (finalResults.winner) {
        // Announce new DJ
        this.server.to(`room:${room.roomCode}`).emit('dj:changed', {
          newDjId: finalResults.winner,
          reason: 'vote',
        });
      }
    }

    this.logger.log(`Vote cast in session ${voteDto.voteSessionId} by user ${userId}`);
  } catch (error) {
    this.logger.error(`Vote cast error: ${error.message}`);
    throw new WsException(error.message);
  }
}
```

### Step 5: Update gateway module

Modify `backend/src/gateway/gateway.module.ts`:

Add to imports:
```typescript
import { VotesModule } from '../votes/votes.module';
```

Add to imports array:
```typescript
imports: [
  // ... existing imports
  VotesModule,
],
```

### Step 6: Run tests to verify they pass

Run:
```bash
npm test -- room.gateway.spec.ts
```

Expected: All tests pass

### Step 7: Commit

```bash
git add src/gateway/
git commit -m "feat: add WebSocket events for DJ election"
```

Expected: Changes committed successfully

---

## Task 3: Backend - Mutiny WebSocket Events

**Goal:** Add WebSocket events for initiating and voting on mutiny to remove current DJ.

**Files:**
- Modify: `backend/src/gateway/room.gateway.ts`
- Modify: `backend/src/gateway/dto/vote-events.dto.ts`

### Step 1: Update vote event DTOs

Modify `backend/src/gateway/dto/vote-events.dto.ts`:
```typescript
export class StartMutinyDto {
  // No additional fields needed
}

export class VoteOnMutinyDto {
  @IsUUID()
  voteSessionId: string;

  @IsBoolean()
  voteValue: boolean; // true = yes, false = no
}
```

### Step 2: Write failing test for mutiny events

Add to `backend/src/gateway/room.gateway.spec.ts`:
```typescript
describe('Mutiny Events', () => {
  it('should start a mutiny vote', async () => {
    const mockClient = createMockClient('user1', 'socket1');
    const roomCode = 'ABC123';

    mockRoomsService.getRoomByCode.mockResolvedValue({
      id: 'room1',
      roomCode,
      settings: { mutinyThreshold: 0.51 },
    });
    mockRoomMemberRepository.findOne.mockResolvedValue({
      userId: 'user1',
      roomId: 'room1',
    });

    mockVotesService.startMutiny.mockResolvedValue({
      voteSessionId: 'mutiny1',
      voteType: VoteType.MUTINY,
      isComplete: false,
      totalVoters: 5,
      mutinyVotes: { yes: 0, no: 0 },
      threshold: 0.51,
    });

    await gateway.handleStartMutiny(mockClient, roomCode);

    expect(mockVotesService.startMutiny).toHaveBeenCalledWith('room1', 'user1');
    expect(mockServer.to).toHaveBeenCalledWith(`room:${roomCode}`);
  });

  it('should cast a mutiny vote', async () => {
    const mockClient = createMockClient('user1', 'socket1');
    const voteDto: VoteOnMutinyDto = {
      voteSessionId: 'mutiny1',
      voteValue: true,
    };

    mockVotesService.castVote.mockResolvedValue({
      voteSessionId: 'mutiny1',
      voteType: VoteType.MUTINY,
      isComplete: false,
      totalVoters: 5,
      mutinyVotes: { yes: 1, no: 0 },
      threshold: 0.51,
    });

    await gateway.handleVoteOnMutiny(mockClient, voteDto);

    expect(mockVotesService.castVote).toHaveBeenCalled();
  });
});
```

### Step 3: Run test to verify it fails

Run:
```bash
npm test -- room.gateway.spec.ts
```

Expected: FAIL with "handleStartMutiny is not a function"

### Step 4: Implement mutiny event handlers

Modify `backend/src/gateway/room.gateway.ts`:

Add imports:
```typescript
import { StartMutinyDto, VoteOnMutinyDto } from './dto/vote-events.dto';
```

Add event handlers:
```typescript
/**
 * Start a mutiny vote
 */
@SubscribeMessage('vote:start-mutiny')
async handleStartMutiny(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() roomCode: string,
): Promise<void> {
  try {
    const userId = client.data.userId;
    const room = await this.roomsService.getRoomByCode(roomCode);

    // Verify user is a member
    const membership = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });

    if (!membership) {
      throw new WsException('You are not a member of this room');
    }

    // Verify there is a current DJ
    const currentDj = await this.roomsService.getCurrentDj(room.id);
    if (!currentDj) {
      throw new WsException('No DJ to mutiny against');
    }

    // Start mutiny
    const voteResults = await this.votesService.startMutiny(room.id, userId);

    // Broadcast to room
    this.server.to(`room:${roomCode}`).emit('vote:mutiny-started', {
      ...voteResults,
      initiatorId: userId,
      targetDjId: currentDj.userId,
    });

    this.logger.log(`Mutiny started in room ${roomCode} by user ${userId}`);
  } catch (error) {
    this.logger.error(`Start mutiny error: ${error.message}`);
    throw new WsException(error.message);
  }
}

/**
 * Cast vote on mutiny (yes/no)
 */
@SubscribeMessage('vote:cast-mutiny')
async handleVoteOnMutiny(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() voteDto: VoteOnMutinyDto,
): Promise<void> {
  try {
    const userId = client.data.userId;

    // Get room ID from vote session
    const redis = this.redisService.getClient();
    const voteData = await redis.hgetall(`vote:${voteDto.voteSessionId}`);
    const roomId = voteData.roomId;

    // Cast vote
    const updatedResults = await this.votesService.castVote(roomId, userId, {
      voteSessionId: voteDto.voteSessionId,
      voteValue: voteDto.voteValue,
    });

    // Get room code
    const room = await this.roomRepository.findOne({ where: { id: roomId } });

    // Broadcast updated results
    this.server.to(`room:${room.roomCode}`).emit('vote:results-updated', updatedResults);

    // Check if everyone voted or threshold reached
    const totalVotes = updatedResults.mutinyVotes.yes + updatedResults.mutinyVotes.no;
    const yesPercentage = totalVotes > 0 ? updatedResults.mutinyVotes.yes / totalVotes : 0;

    if (totalVotes >= updatedResults.totalVoters || yesPercentage >= updatedResults.threshold) {
      // Complete the vote
      const finalResults = await this.votesService.completeVote(voteDto.voteSessionId);
      this.server.to(`room:${room.roomCode}`).emit('vote:complete', finalResults);

      if (finalResults.mutinyPassed) {
        // Get current DJ before removing
        const currentDj = await this.roomsService.getCurrentDj(room.id);

        // Set DJ cooldown
        if (currentDj) {
          await this.votesService.setDjCooldown(
            room.id,
            currentDj.userId,
            room.settings.djCooldownMinutes,
          );
        }

        // Announce mutiny success
        this.server.to(`room:${room.roomCode}`).emit('mutiny:success', {
          removedDjId: currentDj?.userId,
        });

        // Trigger new DJ election if auto-randomize is enabled
        if (room.settings.autoRandomizeDJ) {
          await this.handleRandomizeDj(room.roomCode);
        }
      } else {
        this.server.to(`room:${room.roomCode}`).emit('mutiny:failed', {
          voteSessionId: voteDto.voteSessionId,
        });
      }
    }

    this.logger.log(`Mutiny vote cast in session ${voteDto.voteSessionId} by user ${userId}`);
  } catch (error) {
    this.logger.error(`Mutiny vote error: ${error.message}`);
    throw new WsException(error.message);
  }
}
```

### Step 5: Add getCurrentDj helper to RoomsService

Modify `backend/src/rooms/rooms.service.ts`:

Add method:
```typescript
/**
 * Get current DJ for a room
 */
async getCurrentDj(roomId: string): Promise<RoomDjHistory | null> {
  return this.roomDjHistoryRepository.findOne({
    where: {
      roomId,
      removedAt: IsNull(),
    },
    order: {
      becameDjAt: 'DESC',
    },
  });
}
```

### Step 6: Run tests to verify they pass

Run:
```bash
npm test -- room.gateway.spec.ts
```

Expected: All tests pass

### Step 7: Commit

```bash
git add src/gateway/ src/rooms/
git commit -m "feat: add WebSocket events for mutiny voting"
```

Expected: Changes committed successfully

---

## Task 4: Backend - Randomize DJ Endpoint

**Goal:** Add endpoint and WebSocket event to randomly select a DJ from active members.

**Files:**
- Modify: `backend/src/rooms/rooms.controller.ts`
- Modify: `backend/src/rooms/rooms.service.ts`
- Modify: `backend/src/gateway/room.gateway.ts`

### Step 1: Write failing test for randomize DJ

Add to `backend/src/rooms/rooms.service.spec.ts`:
```typescript
describe('randomizeDj', () => {
  it('should select a random member as DJ', async () => {
    const roomId = 'room1';
    const members = [
      { userId: 'user1', roomId },
      { userId: 'user2', roomId },
      { userId: 'user3', roomId },
    ];

    mockRoomMemberRepository.find.mockResolvedValue(members);
    mockRoomDjHistoryRepository.findOne.mockResolvedValue(null);
    mockRoomDjHistoryRepository.create.mockReturnValue({});
    mockRoomDjHistoryRepository.save.mockResolvedValue({});

    const result = await service.randomizeDj(roomId);

    expect(result).toBeDefined();
    expect(members.some((m) => m.userId === result.userId)).toBe(true);
    expect(mockRoomDjHistoryRepository.save).toHaveBeenCalled();
  });

  it('should exclude users on DJ cooldown', async () => {
    const roomId = 'room1';
    const members = [
      { userId: 'user1', roomId },
      { userId: 'user2', roomId },
    ];

    mockRoomMemberRepository.find.mockResolvedValue(members);
    mockRoomDjHistoryRepository.findOne.mockResolvedValue(null);
    mockRedisService.getClient().get.mockImplementation((key: string) => {
      if (key.includes('user1')) return Promise.resolve('1'); // user1 on cooldown
      return Promise.resolve(null);
    });

    const result = await service.randomizeDj(roomId);

    expect(result.userId).toBe('user2'); // Should select user2, not user1
  });
});
```

### Step 2: Run test to verify it fails

Run:
```bash
npm test -- rooms.service.spec.ts
```

Expected: FAIL with "randomizeDj is not a function"

### Step 3: Implement randomizeDj in RoomsService

Modify `backend/src/rooms/rooms.service.ts`:

Add method:
```typescript
/**
 * Randomly select a DJ from active members (excluding those on cooldown)
 */
async randomizeDj(roomId: string): Promise<RoomDjHistory> {
  const room = await this.roomRepository.findOne({ where: { id: roomId } });
  if (!room) {
    throw new NotFoundException('Room not found');
  }

  // Get all active members
  const members = await this.roomMemberRepository.find({
    where: { roomId },
  });

  if (members.length === 0) {
    throw new BadRequestException('No members in room');
  }

  // Filter out members on DJ cooldown
  const redis = this.redisService.getClient();
  const eligibleMembers = [];

  for (const member of members) {
    const cooldownKey = `room:${roomId}:dj_cooldown:${member.userId}`;
    const onCooldown = await redis.get(cooldownKey);
    if (!onCooldown) {
      eligibleMembers.push(member);
    }
  }

  if (eligibleMembers.length === 0) {
    throw new BadRequestException('No eligible members (all on cooldown)');
  }

  // Select random member
  const randomIndex = Math.floor(Math.random() * eligibleMembers.length);
  const selectedMember = eligibleMembers[randomIndex];

  // Remove current DJ if exists
  await this.removeDj(roomId, RemovalReason.VOTE);

  // Set new DJ
  const djHistory = this.roomDjHistoryRepository.create({
    roomId,
    userId: selectedMember.userId,
    becameDjAt: new Date(),
  });

  await this.roomDjHistoryRepository.save(djHistory);

  // Update Redis
  await redis.set(`room:${roomId}:state.currentDjId`, selectedMember.userId);

  this.logger.log(`Randomized DJ in room ${roomId}: ${selectedMember.userId}`);

  return djHistory;
}
```

### Step 4: Add controller endpoint

Modify `backend/src/rooms/rooms.controller.ts`:

Add method:
```typescript
@Post(':code/randomize-dj')
async randomizeDj(@Param('code') code: string, @Req() req: any) {
  const userId = req.user.userId;
  const room = await this.roomsService.getRoomByCode(code);

  // Verify user is owner or current DJ
  if (room.ownerId !== userId) {
    const currentDj = await this.roomsService.getCurrentDj(room.id);
    if (!currentDj || currentDj.userId !== userId) {
      throw new ForbiddenException('Only room owner or current DJ can randomize DJ');
    }
  }

  const djHistory = await this.roomsService.randomizeDj(room.id);

  return {
    newDjId: djHistory.userId,
  };
}
```

### Step 5: Add WebSocket event for randomize DJ

Modify `backend/src/gateway/room.gateway.ts`:

Add method:
```typescript
/**
 * Randomize DJ selection
 */
@SubscribeMessage('dj:randomize')
async handleRandomizeDj(@MessageBody() roomCode: string): Promise<void> {
  try {
    const room = await this.roomsService.getRoomByCode(roomCode);
    const djHistory = await this.roomsService.randomizeDj(room.id);

    // Broadcast to room
    this.server.to(`room:${roomCode}`).emit('dj:changed', {
      newDjId: djHistory.userId,
      reason: 'randomize',
    });

    this.logger.log(`DJ randomized in room ${roomCode}: ${djHistory.userId}`);
  } catch (error) {
    this.logger.error(`Randomize DJ error: ${error.message}`);
    throw new WsException(error.message);
  }
}
```

### Step 6: Run tests to verify they pass

Run:
```bash
npm test -- rooms.service.spec.ts
npm test -- room.gateway.spec.ts
```

Expected: All tests pass

### Step 7: Commit

```bash
git add src/rooms/ src/gateway/
git commit -m "feat: add randomize DJ endpoint and WebSocket event"
```

Expected: Changes committed successfully

---

## Task 5: Frontend - Vote Types and Context

**Goal:** Create TypeScript types and React context for managing vote state.

**Files:**
- Create: `mobile/src/types/vote.types.ts`
- Create: `mobile/src/contexts/VoteContext.tsx`
- Modify: `mobile/src/types/socket.types.ts`

### Step 1: Create vote types

Create `mobile/src/types/vote.types.ts`:
```typescript
export enum VoteType {
  DJ_ELECTION = 'dj_election',
  MUTINY = 'mutiny',
}

export interface VoteCounts {
  [userId: string]: number;
}

export interface MutinyVoteCounts {
  yes: number;
  no: number;
}

export interface VoteSession {
  voteSessionId: string;
  voteType: VoteType;
  isComplete: boolean;
  totalVoters: number;
  voteCounts?: VoteCounts;
  mutinyVotes?: MutinyVoteCounts;
  threshold?: number;
  winner?: string;
  mutinyPassed?: boolean;
  initiatorId?: string;
  targetDjId?: string;
}

export interface RoomMember {
  userId: string;
  username: string;
  displayName: string;
  isOnline: boolean;
}
```

### Step 2: Update socket types

Modify `mobile/src/types/socket.types.ts`:

Add to ServerToClientEvents:
```typescript
export interface ServerToClientEvents {
  // ... existing events
  'vote:election-started': (data: any) => void;
  'vote:mutiny-started': (data: any) => void;
  'vote:results-updated': (data: any) => void;
  'vote:complete': (data: any) => void;
  'mutiny:success': (data: any) => void;
  'mutiny:failed': (data: any) => void;
  'dj:changed': (data: any) => void;
}
```

Add to ClientToServerEvents:
```typescript
export interface ClientToServerEvents {
  // ... existing events
  'vote:start-election': (roomCode: string) => void;
  'vote:cast-dj': (data: { voteSessionId: string; targetUserId: string }) => void;
  'vote:start-mutiny': (roomCode: string) => void;
  'vote:cast-mutiny': (data: { voteSessionId: string; voteValue: boolean }) => void;
  'dj:randomize': (roomCode: string) => void;
}
```

### Step 3: Create VoteContext

Create `mobile/src/contexts/VoteContext.tsx`:
```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { VoteSession, VoteType, RoomMember } from '../types/vote.types';

interface VoteContextType {
  currentVote: VoteSession | null;
  hasVoted: boolean;
  startElection: (roomCode: string) => void;
  voteForDj: (voteSessionId: string, targetUserId: string) => void;
  startMutiny: (roomCode: string) => void;
  voteOnMutiny: (voteSessionId: string, voteValue: boolean) => void;
  randomizeDj: (roomCode: string) => void;
}

const VoteContext = createContext<VoteContextType | undefined>(undefined);

interface VoteProviderProps {
  children: React.ReactNode;
  socket: Socket | null;
  userId: string | null;
}

export const VoteProvider: React.FC<VoteProviderProps> = ({ children, socket, userId }) => {
  const [currentVote, setCurrentVote] = useState<VoteSession | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Listen for vote events
    socket.on('vote:election-started', (data: VoteSession) => {
      console.log('[Vote] Election started:', data);
      setCurrentVote(data);
      setHasVoted(false);
    });

    socket.on('vote:mutiny-started', (data: VoteSession) => {
      console.log('[Vote] Mutiny started:', data);
      setCurrentVote(data);
      setHasVoted(false);
    });

    socket.on('vote:results-updated', (data: VoteSession) => {
      console.log('[Vote] Results updated:', data);
      setCurrentVote(data);
    });

    socket.on('vote:complete', (data: VoteSession) => {
      console.log('[Vote] Vote complete:', data);
      setCurrentVote(null);
      setHasVoted(false);
    });

    socket.on('mutiny:success', (data: any) => {
      console.log('[Vote] Mutiny succeeded:', data);
      setCurrentVote(null);
      setHasVoted(false);
    });

    socket.on('mutiny:failed', (data: any) => {
      console.log('[Vote] Mutiny failed:', data);
      setCurrentVote(null);
      setHasVoted(false);
    });

    return () => {
      socket.off('vote:election-started');
      socket.off('vote:mutiny-started');
      socket.off('vote:results-updated');
      socket.off('vote:complete');
      socket.off('mutiny:success');
      socket.off('mutiny:failed');
    };
  }, [socket]);

  const startElection = (roomCode: string) => {
    if (!socket) return;
    socket.emit('vote:start-election', roomCode);
  };

  const voteForDj = (voteSessionId: string, targetUserId: string) => {
    if (!socket) return;
    socket.emit('vote:cast-dj', { voteSessionId, targetUserId });
    setHasVoted(true);
  };

  const startMutiny = (roomCode: string) => {
    if (!socket) return;
    socket.emit('vote:start-mutiny', roomCode);
  };

  const voteOnMutiny = (voteSessionId: string, voteValue: boolean) => {
    if (!socket) return;
    socket.emit('vote:cast-mutiny', { voteSessionId, voteValue });
    setHasVoted(true);
  };

  const randomizeDj = (roomCode: string) => {
    if (!socket) return;
    socket.emit('dj:randomize', roomCode);
  };

  return (
    <VoteContext.Provider
      value={{
        currentVote,
        hasVoted,
        startElection,
        voteForDj,
        startMutiny,
        voteOnMutiny,
        randomizeDj,
      }}
    >
      {children}
    </VoteContext.Provider>
  );
};

export const useVote = (): VoteContextType => {
  const context = useContext(VoteContext);
  if (!context) {
    throw new Error('useVote must be used within VoteProvider');
  }
  return context;
};
```

### Step 4: Commit

```bash
git add src/types/vote.types.ts src/contexts/VoteContext.tsx src/types/socket.types.ts
git commit -m "feat: add vote types and VoteContext for frontend"
```

Expected: Changes committed successfully

---

## Task 6: Frontend - DJ Election UI

**Goal:** Create UI components for initiating and voting in DJ elections.

**Files:**
- Create: `mobile/src/components/DjElectionModal.tsx`
- Modify: `mobile/src/screens/RoomScreen.tsx`

### Step 1: Create DJ Election Modal

Create `mobile/src/components/DjElectionModal.tsx`:
```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useVote } from '../contexts/VoteContext';
import { VoteType, RoomMember } from '../types/vote.types';

interface DjElectionModalProps {
  visible: boolean;
  onClose: () => void;
  members: RoomMember[];
  roomCode: string;
}

export const DjElectionModal: React.FC<DjElectionModalProps> = ({
  visible,
  onClose,
  members,
  roomCode,
}) => {
  const { currentVote, hasVoted, voteForDj } = useVote();
  const [showResults, setShowResults] = useState(false);

  const isElectionActive = currentVote?.voteType === VoteType.DJ_ELECTION;

  const handleVote = (userId: string) => {
    if (!currentVote || hasVoted) return;
    voteForDj(currentVote.voteSessionId, userId);
  };

  const getVoteCount = (userId: string): number => {
    if (!currentVote?.voteCounts) return 0;
    return currentVote.voteCounts[userId] || 0;
  };

  const renderMember = ({ item }: { item: RoomMember }) => {
    const voteCount = getVoteCount(item.userId);
    const hasVotes = voteCount > 0;

    return (
      <TouchableOpacity
        style={[styles.memberItem, hasVotes && styles.memberItemHighlight]}
        onPress={() => handleVote(item.userId)}
        disabled={!isElectionActive || hasVoted}
      >
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.displayName}</Text>
          <Text style={styles.memberUsername}>@{item.username}</Text>
        </View>
        {showResults && isElectionActive && (
          <View style={styles.voteCount}>
            <Text style={styles.voteCountText}>{voteCount} votes</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isElectionActive ? 'Vote for DJ' : 'Select New DJ'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>Close</Text>
            </TouchableOpacity>
          </View>

          {isElectionActive && (
            <View style={styles.voteStatus}>
              <Text style={styles.voteStatusText}>
                {hasVoted ? 'You have voted!' : 'Tap a member to vote'}
              </Text>
              <TouchableOpacity onPress={() => setShowResults(!showResults)}>
                <Text style={styles.toggleResults}>
                  {showResults ? 'Hide' : 'Show'} Results
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={members}
            renderItem={renderMember}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.memberList}
          />

          {currentVote?.isComplete && currentVote.winner && (
            <View style={styles.winnerBanner}>
              <Text style={styles.winnerText}>
                {members.find((m) => m.userId === currentVote.winner)?.displayName} won!
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  voteStatus: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voteStatusText: {
    fontSize: 14,
    color: '#666',
  },
  toggleResults: {
    color: '#007AFF',
    fontSize: 14,
  },
  memberList: {
    padding: 20,
  },
  memberItem: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberItemHighlight: {
    backgroundColor: '#e3f2fd',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberUsername: {
    fontSize: 14,
    color: '#666',
  },
  voteCount: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  voteCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  winnerBanner: {
    backgroundColor: '#4CAF50',
    padding: 16,
    alignItems: 'center',
  },
  winnerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
```

### Step 2: Update RoomScreen to integrate DJ election

Modify `mobile/src/screens/RoomScreen.tsx`:

Add imports:
```typescript
import { VoteProvider, useVote } from '../contexts/VoteContext';
import { DjElectionModal } from '../components/DjElectionModal';
import { RoomMember } from '../types/vote.types';
```

Add state and modal:
```typescript
const [showDjElection, setShowDjElection] = useState(false);
const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
const [currentDjId, setCurrentDjId] = useState<string | null>(null);

// Listen for DJ changes
useEffect(() => {
  if (!socket) return;

  socket.on('dj:changed', (data) => {
    console.log('[Room] DJ changed:', data);
    setCurrentDjId(data.newDjId);
  });

  socket.on('room:members-changed', (data) => {
    console.log('[Room] Members changed:', data);
    setRoomMembers(data.members || []);
  });

  return () => {
    socket.off('dj:changed');
    socket.off('room:members-changed');
  };
}, [socket]);
```

Add button to trigger election:
```typescript
<TouchableOpacity
  style={styles.controlButton}
  onPress={() => setShowDjElection(true)}
>
  <Text style={styles.controlButtonText}>Vote for DJ</Text>
</TouchableOpacity>
```

Wrap with VoteProvider and add modal:
```typescript
return (
  <VoteProvider socket={socket} userId={user?.id || null}>
    <View style={styles.container}>
      {/* ... existing content ... */}

      <DjElectionModal
        visible={showDjElection}
        onClose={() => setShowDjElection(false)}
        members={roomMembers}
        roomCode={roomCode}
      />
    </View>
  </VoteProvider>
);
```

### Step 3: Commit

```bash
git add src/components/DjElectionModal.tsx src/screens/RoomScreen.tsx
git commit -m "feat: add DJ election UI modal"
```

Expected: Changes committed successfully

---

## Task 7: Frontend - Mutiny UI

**Goal:** Create UI for initiating and voting on mutiny.

**Files:**
- Create: `mobile/src/components/MutinyModal.tsx`
- Modify: `mobile/src/screens/RoomScreen.tsx`

### Step 1: Create Mutiny Modal

Create `mobile/src/components/MutinyModal.tsx`:
```typescript
import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useVote } from '../contexts/VoteContext';
import { VoteType } from '../types/vote.types';

interface MutinyModalProps {
  visible: boolean;
  onClose: () => void;
  roomCode: string;
  currentDjName: string | null;
}

export const MutinyModal: React.FC<MutinyModalProps> = ({
  visible,
  onClose,
  roomCode,
  currentDjName,
}) => {
  const { currentVote, hasVoted, startMutiny, voteOnMutiny } = useVote();

  const isMutinyActive = currentVote?.voteType === VoteType.MUTINY;

  const handleStartMutiny = () => {
    Alert.alert(
      'Call Mutiny?',
      `Are you sure you want to start a vote to remove ${currentDjName || 'the current DJ'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Start Mutiny',
          style: 'destructive',
          onPress: () => startMutiny(roomCode),
        },
      ],
    );
  };

  const handleVote = (voteValue: boolean) => {
    if (!currentVote) return;
    voteOnMutiny(currentVote.voteSessionId, voteValue);
  };

  const getProgressPercentage = (): number => {
    if (!currentVote?.mutinyVotes) return 0;
    const total = currentVote.mutinyVotes.yes + currentVote.mutinyVotes.no;
    if (total === 0) return 0;
    return (currentVote.mutinyVotes.yes / total) * 100;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Mutiny</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>Close</Text>
            </TouchableOpacity>
          </View>

          {!isMutinyActive ? (
            <View style={styles.startMutinyContainer}>
              <Text style={styles.description}>
                Start a vote to remove {currentDjName || 'the current DJ'}.
              </Text>
              <Text style={styles.warning}>
                Requires {((currentVote?.threshold || 0.51) * 100).toFixed(0)}% approval
              </Text>
              <TouchableOpacity style={styles.startButton} onPress={handleStartMutiny}>
                <Text style={styles.startButtonText}>Call Mutiny</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.activeVoteContainer}>
              <Text style={styles.voteQuestion}>
                Remove {currentDjName || 'the current DJ'}?
              </Text>

              {/* Vote Progress */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[styles.progressFill, { width: `${getProgressPercentage()}%` }]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {currentVote.mutinyVotes?.yes || 0} Yes / {currentVote.mutinyVotes?.no || 0} No
                </Text>
                <Text style={styles.thresholdText}>
                  Need {((currentVote.threshold || 0.51) * 100).toFixed(0)}% to pass
                </Text>
              </View>

              {/* Vote Buttons */}
              {!hasVoted ? (
                <View style={styles.voteButtons}>
                  <TouchableOpacity
                    style={[styles.voteButton, styles.yesButton]}
                    onPress={() => handleVote(true)}
                  >
                    <Text style={styles.voteButtonText}>Yes - Remove DJ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voteButton, styles.noButton]}
                    onPress={() => handleVote(false)}
                  >
                    <Text style={styles.voteButtonText}>No - Keep DJ</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.votedContainer}>
                  <Text style={styles.votedText}>You have voted!</Text>
                  <Text style={styles.votedSubtext}>Waiting for others...</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  startMutinyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
    color: '#333',
  },
  warning: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  activeVoteContainer: {
    paddingVertical: 20,
  },
  voteQuestion: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF3B30',
  },
  progressText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '600',
  },
  thresholdText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#666',
  },
  voteButtons: {
    gap: 12,
  },
  voteButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  yesButton: {
    backgroundColor: '#FF3B30',
  },
  noButton: {
    backgroundColor: '#4CAF50',
  },
  voteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  votedContainer: {
    alignItems: 'center',
    padding: 20,
  },
  votedText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#4CAF50',
  },
  votedSubtext: {
    fontSize: 14,
    color: '#666',
  },
});
```

### Step 2: Update RoomScreen to add mutiny button

Modify `mobile/src/screens/RoomScreen.tsx`:

Add import:
```typescript
import { MutinyModal } from '../components/MutinyModal';
```

Add state:
```typescript
const [showMutiny, setShowMutiny] = useState(false);
```

Add button:
```typescript
<TouchableOpacity
  style={[styles.controlButton, styles.mutinyButton]}
  onPress={() => setShowMutiny(true)}
>
  <Text style={styles.controlButtonText}>Call Mutiny</Text>
</TouchableOpacity>
```

Add modal:
```typescript
<MutinyModal
  visible={showMutiny}
  onClose={() => setShowMutiny(false)}
  roomCode={roomCode}
  currentDjName={
    roomMembers.find((m) => m.userId === currentDjId)?.displayName || null
  }
/>
```

Add style:
```typescript
mutinyButton: {
  backgroundColor: '#FF3B30',
},
```

### Step 3: Commit

```bash
git add src/components/MutinyModal.tsx src/screens/RoomScreen.tsx
git commit -m "feat: add mutiny UI with voting modal"
```

Expected: Changes committed successfully

---

## Task 8: Frontend - Notifications and Toast Messages

**Goal:** Add toast notifications for vote events and DJ changes.

**Files:**
- Create: `mobile/src/components/Toast.tsx`
- Create: `mobile/src/hooks/useToast.ts`
- Modify: `mobile/src/screens/RoomScreen.tsx`

### Step 1: Create Toast component

Create `mobile/src/components/Toast.tsx`:
```typescript
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  visible: boolean;
  onHide: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  visible,
  onHide,
  duration = 3000,
}) => {
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(duration),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onHide();
      });
    }
  }, [visible, duration, opacity, onHide]);

  if (!visible) return null;

  const backgroundColor = {
    info: '#007AFF',
    success: '#4CAF50',
    warning: '#FF9500',
    error: '#FF3B30',
  }[type];

  return (
    <Animated.View style={[styles.container, { opacity, backgroundColor }]}>
      <Text style={styles.message}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 8,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  message: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
```

### Step 2: Create useToast hook

Create `mobile/src/hooks/useToast.ts`:
```typescript
import { useState, useCallback } from 'react';

interface ToastOptions {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
}

export const useToast = () => {
  const [toast, setToast] = useState<ToastOptions & { visible: boolean }>({
    message: '',
    type: 'info',
    duration: 3000,
    visible: false,
  });

  const showToast = useCallback((options: ToastOptions) => {
    setToast({
      ...options,
      type: options.type || 'info',
      duration: options.duration || 3000,
      visible: true,
    });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  return { toast, showToast, hideToast };
};
```

### Step 3: Update RoomScreen with toast notifications

Modify `mobile/src/screens/RoomScreen.tsx`:

Add imports:
```typescript
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
```

Add hook:
```typescript
const { toast, showToast, hideToast } = useToast();
```

Add toast listeners:
```typescript
useEffect(() => {
  if (!socket) return;

  socket.on('vote:election-started', (data) => {
    showToast({
      message: 'DJ election started! Vote for your favorite.',
      type: 'info',
    });
  });

  socket.on('vote:mutiny-started', (data) => {
    showToast({
      message: 'Mutiny vote started!',
      type: 'warning',
    });
  });

  socket.on('vote:complete', (data) => {
    if (data.winner) {
      const winner = roomMembers.find((m) => m.userId === data.winner);
      showToast({
        message: `${winner?.displayName || 'Someone'} is the new DJ!`,
        type: 'success',
      });
    }
  });

  socket.on('mutiny:success', (data) => {
    showToast({
      message: 'Mutiny succeeded! DJ has been removed.',
      type: 'success',
    });
  });

  socket.on('mutiny:failed', (data) => {
    showToast({
      message: 'Mutiny failed. DJ remains.',
      type: 'info',
    });
  });

  socket.on('dj:changed', (data) => {
    const newDj = roomMembers.find((m) => m.userId === data.newDjId);
    showToast({
      message: `${newDj?.displayName || 'Someone'} is now the DJ!`,
      type: 'success',
    });
  });

  return () => {
    socket.off('vote:election-started');
    socket.off('vote:mutiny-started');
    socket.off('vote:complete');
    socket.off('mutiny:success');
    socket.off('mutiny:failed');
    socket.off('dj:changed');
  };
}, [socket, showToast, roomMembers]);
```

Add Toast component to render:
```typescript
<View style={styles.container}>
  {/* ... existing content ... */}

  <Toast
    message={toast.message}
    type={toast.type}
    visible={toast.visible}
    onHide={hideToast}
    duration={toast.duration}
  />
</View>
```

### Step 4: Commit

```bash
git add src/components/Toast.tsx src/hooks/useToast.ts src/screens/RoomScreen.tsx
git commit -m "feat: add toast notifications for vote events"
```

Expected: Changes committed successfully

---

## Task 9: Frontend - Randomize DJ Button

**Goal:** Add UI button to trigger random DJ selection.

**Files:**
- Modify: `mobile/src/screens/RoomScreen.tsx`

### Step 1: Add randomize DJ button

Modify `mobile/src/screens/RoomScreen.tsx`:

Add button in controls section:
```typescript
<TouchableOpacity
  style={[styles.controlButton, styles.randomizeButton]}
  onPress={() => {
    if (socket) {
      socket.emit('dj:randomize', roomCode);
    }
  }}
>
  <Text style={styles.controlButtonText}>Random DJ</Text>
</TouchableOpacity>
```

Add style:
```typescript
randomizeButton: {
  backgroundColor: '#FF9500',
},
```

### Step 2: Commit

```bash
git add src/screens/RoomScreen.tsx
git commit -m "feat: add randomize DJ button to room controls"
```

Expected: Changes committed successfully

---

## Task 10: Integration Testing & Documentation

**Goal:** Test all voting features end-to-end and document usage.

**Files:**
- Create: `docs/phase3-testing-guide.md`
- Modify: `README.md`

### Step 1: Create testing guide

Create `docs/phase3-testing-guide.md`:
```markdown
# Phase 3: Governance Testing Guide

## Prerequisites
- Backend running
- 3+ devices with mobile app installed
- Users registered and in same room

## Test 1: DJ Election

**Steps:**
1. Device 1: Tap "Vote for DJ" button
2. All devices: Verify election modal appears
3. Each device: Vote for different candidates
4. All devices: Verify vote counts update in real-time
5. Once all votes cast: Verify winner announced
6. All devices: Verify new DJ indicator updates

**Expected:**
- Real-time vote count updates
- Winner selected based on most votes
- DJ indicator updates immediately
- Toast notification shows winner

## Test 2: Mutiny Vote

**Prerequisites:**
- Room has active DJ

**Steps:**
1. Device 2 (non-DJ): Tap "Call Mutiny"
2. Device 2: Confirm mutiny start
3. All devices: Verify mutiny modal appears
4. Devices: Vote Yes (>51% threshold)
5. All devices: Verify mutiny success message
6. Verify DJ removed

**Expected:**
- Mutiny vote initiates
- Real-time vote progress bar updates
- Mutiny succeeds when threshold reached
- DJ cooldown applied (can't be DJ for 5 minutes)

## Test 3: Failed Mutiny

**Steps:**
1. Start mutiny
2. Devices: Vote No (majority)
3. Verify mutiny fails
4. Verify DJ remains unchanged

**Expected:**
- Mutiny fails if <51% yes votes
- Toast shows "Mutiny failed"
- DJ unchanged

## Test 4: Randomize DJ

**Steps:**
1. Current DJ: Tap "Random DJ"
2. All devices: Verify random member selected
3. Verify previous DJ cannot be selected again immediately (cooldown)

**Expected:**
- Random member selected
- DJ indicator updates
- Toast notification

## Test 5: DJ Cooldown

**Steps:**
1. Remove DJ via mutiny
2. Start DJ election immediately
3. Verify removed DJ not in candidate list
4. Wait 5 minutes
5. Start new election
6. Verify removed DJ now appears

**Expected:**
- DJ on cooldown cannot be elected
- Cooldown expires after configured time

## Test 6: Concurrent Votes

**Steps:**
1. Start DJ election
2. Before completion, attempt to start mutiny
3. Verify error: "Vote already in progress"

**Expected:**
- Only one vote session at a time
- Clear error message

## Test 7: Vote Expiry

**Steps:**
1. Start DJ election
2. Don't cast any votes
3. Wait 5 minutes
4. Verify vote session expires

**Expected:**
- Vote expires after 5 minutes
- Modal closes automatically

## Metrics to Track

- Vote initiation latency: <500ms
- Vote update latency: <1000ms
- Vote completion latency: <2000ms
- No crashes during concurrent operations
- All users see consistent results

## Known Issues

Document any issues found during testing.
```

### Step 2: Update main README

Modify `README.md`:

Add section:
```markdown
## Phase 3: Democratic Governance

GrooveBox features a democratic system for DJ selection and removal:

### DJ Election
- Any member can initiate a DJ election
- All members vote for their preferred candidate
- Winner becomes the new DJ
- Real-time vote tracking

### Mutiny System
- Members can vote to remove current DJ
- Requires >51% approval (configurable)
- 10-minute cooldown between mutinies
- Removed DJ has 5-minute cooldown before re-election

### Randomize DJ
- Random selection from eligible members
- Excludes members on cooldown
- Available to room owner or current DJ

See `docs/phase3-testing-guide.md` for testing procedures.
```

### Step 3: Manual testing

Run through all test scenarios in the testing guide with physical devices.

### Step 4: Commit

```bash
git add docs/phase3-testing-guide.md README.md
git commit -m "docs: add Phase 3 testing guide and update README"
```

Expected: Changes committed successfully

---

## Final Verification

### Step 1: Run all backend tests

```bash
cd /home/user/groovebox/backend
npm test
```

Expected: All tests pass

### Step 2: Run TypeScript check

```bash
cd /home/user/groovebox/backend
npm run build
```

Expected: No TypeScript errors

### Step 3: Run frontend TypeScript check

```bash
cd /home/user/groovebox/mobile
npx tsc --noEmit
```

Expected: No TypeScript errors

### Step 4: Push to branch

```bash
git push -u origin claude/phase-3-governance-planning-01NpGzwFg7sVzwAK3UokMbrd
```

Expected: Changes pushed successfully

---

## Success Criteria

- [x] VotesModule created with service, controller, and DTOs
- [x] DJ election WebSocket events implemented
- [x] Mutiny WebSocket events implemented
- [x] Randomize DJ endpoint and event added
- [x] DJ cooldown system working via Redis
- [x] Frontend vote types and context created
- [x] DJ election UI modal functional
- [x] Mutiny UI modal functional
- [x] Toast notifications working
- [x] All tests passing
- [x] Documentation complete
- [x] Changes pushed to branch

**Next Steps:**
1. Deploy backend updates to test server
2. Build mobile app on test devices
3. Run comprehensive testing with 5+ users
4. Measure vote latency and consistency
5. Iterate on UX based on feedback
6. Proceed to Phase 4: Music Source Integration

---

**Document Version**: 1.0
**Created**: 2025-11-22
**For**: Phase 3 - Mutiny & Democratic Governance
