# DJ Election and Mutiny System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement democratic DJ governance with elections to choose new DJs and mutiny votes to remove the current DJ when the majority disagrees.

**Architecture:** Extend existing Vote and RoomDjHistory entities to track election/mutiny votes. Use Redis for real-time vote counting and PostgreSQL for persistence. WebSocket events broadcast vote progress in real-time. When vote threshold is reached, DJ is changed/removed automatically with history tracking and cooldown enforcement.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Redis, Socket.io (backend); React Native, Socket.io-client (frontend)

---

## Task 1: Create DTOs for Voting Operations

**Files:**
- Create: `backend/src/voting/dto/start-vote.dto.ts`
- Create: `backend/src/voting/dto/cast-vote.dto.ts`
- Create: `backend/src/voting/dto/vote-state.dto.ts`
- Create: `backend/src/voting/dto/index.ts`

**Step 1: Create start-vote DTO**

Create `backend/src/voting/dto/start-vote.dto.ts`:

```typescript
import { IsEnum, IsUUID, IsOptional, ValidateIf } from 'class-validator';
import { VoteType } from '../../entities/vote.entity';

export class StartVoteDto {
  @IsEnum(VoteType)
  readonly voteType: VoteType;

  @ValidateIf(o => o.voteType === VoteType.DJ_ELECTION)
  @IsUUID()
  readonly targetUserId?: string;
}
```

**Step 2: Create cast-vote DTO**

Create `backend/src/voting/dto/cast-vote.dto.ts`:

```typescript
import { IsUUID, IsBoolean } from 'class-validator';

export class CastVoteDto {
  @IsUUID()
  readonly voteSessionId: string;

  @IsBoolean()
  readonly voteFor: boolean; // true = for, false = against
}
```

**Step 3: Create vote-state DTO**

Create `backend/src/voting/dto/vote-state.dto.ts`:

```typescript
import { VoteType } from '../../entities/vote.entity';

export class VoteStateDto {
  readonly voteSessionId: string;
  readonly voteType: VoteType;
  readonly targetUserId: string | null;
  readonly targetUsername: string | null;
  readonly votesFor: number;
  readonly votesAgainst: number;
  readonly totalEligibleVoters: number;
  readonly requiredVotes: number;
  readonly threshold: number;
  readonly isActive: boolean;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly passed: boolean | null;
}
```

**Step 4: Create index for exports**

Create `backend/src/voting/dto/index.ts`:

```typescript
export * from './start-vote.dto';
export * from './cast-vote.dto';
export * from './vote-state.dto';
```

**Step 5: Commit**

```bash
git add backend/src/voting/dto/
git commit -m "feat: add DTOs for voting operations"
```

---

## Task 2: Create Voting Service with Core Logic

**Files:**
- Create: `backend/src/voting/voting.service.ts`
- Create: `backend/src/voting/voting.module.ts`

**Step 1: Create voting service**

Create `backend/src/voting/voting.service.ts`:

```typescript
import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Vote, VoteType } from '../entities/vote.entity';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RoomDjHistory, RemovalReason } from '../entities/room-dj-history.entity';
import { User } from '../entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { StartVoteDto, CastVoteDto, VoteStateDto } from './dto';
import { v4 as uuidv4 } from 'uuid';

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

      // Check if there's an active vote session
      const activeVote = await this.voteRepository.findOne({
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
        isActive: true,
      });

      await queryRunner.manager.save(vote);

      // Update vote counts in Redis
      if (castVoteDto.voteFor) {
        voteSession.votesFor += 1;
      } else {
        voteSession.votesAgainst += 1;
      }

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

  private async executeVoteOutcome(queryRunner: any, voteSession: any): Promise<void> {
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
        userId: voteSession.targetUserId,
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
```

**Step 2: Create voting module**

Create `backend/src/voting/voting.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VotingService } from './voting.service';
import { Vote, Room, RoomMember, RoomDjHistory, User } from '../entities';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vote, Room, RoomMember, RoomDjHistory, User]),
    RedisModule,
  ],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
```

**Step 3: Commit**

```bash
git add backend/src/voting/voting.service.ts backend/src/voting/voting.module.ts
git commit -m "feat: add VotingService with election and mutiny logic"
```

---

## Task 3: Add Redis Helper Methods for DJ Management

**Files:**
- Modify: `backend/src/redis/redis.service.ts`

**Step 1: Add getCurrentDj, setCurrentDj, and removeCurrentDj methods**

Add these methods to `backend/src/redis/redis.service.ts`:

```typescript
  async getCurrentDj(roomId: string): Promise<string | null> {
    return await this.get(`room:${roomId}:state.currentDjId`);
  }

  async setCurrentDj(roomId: string, userId: string): Promise<void> {
    await this.set(`room:${roomId}:state.currentDjId`, userId);
  }

  async removeCurrentDj(roomId: string): Promise<void> {
    await this.del(`room:${roomId}:state.currentDjId`);
  }
```

**Step 2: Commit**

```bash
git add backend/src/redis/redis.service.ts
git commit -m "feat: add DJ management methods to RedisService"
```

---

## Task 4: Add Voting WebSocket Events to Room Gateway

**Files:**
- Modify: `backend/src/gateway/room.gateway.ts`
- Modify: `backend/src/gateway/gateway.module.ts`

**Step 1: Import VotingModule in gateway module**

Modify `backend/src/gateway/gateway.module.ts`:

```typescript
import { VotingModule } from '../voting/voting.module';

@Module({
  imports: [RoomsModule, RedisModule, QueueModule, VotingModule],
  providers: [RoomGateway, SyncGateway, PlaybackSyncService],
})
export class GatewayModule {}
```

**Step 2: Add VotingService injection to RoomGateway**

In `backend/src/gateway/room.gateway.ts`, add to constructor:

```typescript
import { VotingService } from '../voting/voting.service';

constructor(
  private roomsService: RoomsService,
  private redisService: RedisService,
  private playbackSyncService: PlaybackSyncService,
  private queueService: QueueService,
  private votingService: VotingService,
) {}
```

**Step 3: Add vote event handlers**

Add these handlers before the closing brace of the RoomGateway class:

```typescript
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('vote:start')
  async handleVoteStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string; voteType: string; targetUserId?: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is a room member
      const member = await this.roomMemberRepository.findOne({
        where: { roomId: room.id, userId: client.data.userId },
      });

      if (!member) {
        return { error: 'You must be a room member to start a vote' };
      }

      const { voteSessionId, voteState } = await this.votingService.startVote(
        room.id,
        client.data.userId,
        {
          voteType: payload.voteType as any,
          targetUserId: payload.targetUserId,
        },
      );

      // Broadcast vote started to all room members
      this.server.to(`room:${room.id}`).emit('vote:started', voteState);

      return { success: true, voteSessionId, voteState };
    } catch (error) {
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('vote:cast')
  async handleVoteCast(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string; voteSessionId: string; voteFor: boolean },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      const voteState = await this.votingService.castVote(
        payload.voteSessionId,
        client.data.userId,
        { voteSessionId: payload.voteSessionId, voteFor: payload.voteFor },
      );

      // Broadcast vote update to all room members
      this.server.to(`room:${room.id}`).emit('vote:updated', voteState);

      // If vote completed, broadcast result
      if (!voteState.isActive) {
        if (voteState.passed) {
          this.server.to(`room:${room.id}`).emit('vote:passed', voteState);

          // If DJ election passed, broadcast new DJ
          if (voteState.voteType === 'dj_election' && voteState.targetUserId) {
            const newDjId = await this.redisService.getCurrentDj(room.id);
            this.server.to(`room:${room.id}`).emit('dj:changed', { djId: newDjId });
          } else if (voteState.voteType === 'mutiny') {
            // Mutiny passed, DJ removed
            this.server.to(`room:${room.id}`).emit('dj:changed', { djId: null });
          }
        } else {
          this.server.to(`room:${room.id}`).emit('vote:failed', voteState);
        }
      }

      return { success: true, voteState };
    } catch (error) {
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('vote:get')
  async handleVoteGet(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() payload: { roomCode: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      const voteState = await this.votingService.getActiveVote(room.id);
      return voteState;
    } catch (error) {
      return { error: error.message };
    }
  }
```

**Step 4: Add vote state to room:state event**

Find the `handleRoomJoin` method and add vote state to the room:state emission:

```typescript
// Get active vote if exists
const activeVote = await this.votingService.getActiveVote(room.id);

// Send current room state to the joining user
client.emit('room:state', {
  room: roomDto,
  members: membersDto,
  currentDjId,
  playbackState,
  queueState,
  activeVote,
});
```

**Step 5: Commit**

```bash
git add backend/src/gateway/room.gateway.ts backend/src/gateway/gateway.module.ts
git commit -m "feat: add voting WebSocket events to room gateway"
```

---

## Task 5: Add TypeScript Types for Frontend

**Files:**
- Create: `mobile/src/types/voting.types.ts`
- Modify: `mobile/src/types/socket.types.ts`

**Step 1: Create voting types**

Create `mobile/src/types/voting.types.ts`:

```typescript
export enum VoteType {
  DJ_ELECTION = 'dj_election',
  MUTINY = 'mutiny',
}

export interface VoteState {
  voteSessionId: string;
  voteType: VoteType;
  targetUserId: string | null;
  targetUsername: string | null;
  votesFor: number;
  votesAgainst: number;
  totalEligibleVoters: number;
  requiredVotes: number;
  threshold: number;
  isActive: boolean;
  startedAt: Date;
  endedAt: Date | null;
  passed: boolean | null;
}

export interface StartVotePayload {
  roomCode: string;
  voteType: VoteType;
  targetUserId?: string;
}

export interface CastVotePayload {
  roomCode: string;
  voteSessionId: string;
  voteFor: boolean;
}
```

**Step 2: Update socket types**

Modify `mobile/src/types/socket.types.ts` to add voting events:

```typescript
import { VoteState, StartVotePayload, CastVotePayload } from './voting.types';

// Add to ServerToClientEvents interface:
'vote:started': (voteState: VoteState) => void;
'vote:updated': (voteState: VoteState) => void;
'vote:passed': (voteState: VoteState) => void;
'vote:failed': (voteState: VoteState) => void;
'dj:changed': (payload: { djId: string | null }) => void;

// Add to ClientToServerEvents interface:
'vote:start': (payload: StartVotePayload, callback: (response: any) => void) => void;
'vote:cast': (payload: CastVotePayload, callback: (response: any) => void) => void;
'vote:get': (payload: { roomCode: string }, callback: (response: VoteState | null) => void) => void;
```

**Step 3: Commit**

```bash
git add mobile/src/types/voting.types.ts mobile/src/types/socket.types.ts
git commit -m "feat: add TypeScript types for voting system"
```

---

## Task 6: Create Voting Hook

**Files:**
- Create: `mobile/src/hooks/useVoting.ts`

**Step 1: Create useVoting hook**

Create `mobile/src/hooks/useVoting.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import { VoteState, VoteType } from '../types/voting.types';

export const useVoting = (roomCode: string | null) => {
  const { socket } = useSocket();
  const [activeVote, setActiveVote] = useState<VoteState | null>(null);

  // Fetch active vote
  const fetchActiveVote = useCallback(() => {
    if (!socket || !roomCode) return;

    socket.emit('vote:get', { roomCode }, (response: VoteState | null) => {
      setActiveVote(response);
    });
  }, [socket, roomCode]);

  // Start a vote
  const startVote = useCallback(
    (voteType: VoteType, targetUserId?: string) => {
      return new Promise<{ voteSessionId: string; voteState: VoteState }>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit(
          'vote:start',
          { roomCode, voteType, targetUserId },
          (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve({ voteSessionId: response.voteSessionId, voteState: response.voteState });
            }
          },
        );
      });
    },
    [socket, roomCode],
  );

  // Cast a vote
  const castVote = useCallback(
    (voteSessionId: string, voteFor: boolean) => {
      return new Promise<VoteState>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit(
          'vote:cast',
          { roomCode, voteSessionId, voteFor },
          (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.voteState);
            }
          },
        );
      });
    },
    [socket, roomCode],
  );

  // Listen for vote events
  useEffect(() => {
    if (!socket) return;

    const handleVoteStarted = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    const handleVoteUpdated = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    const handleVotePassed = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    const handleVoteFailed = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    socket.on('vote:started', handleVoteStarted);
    socket.on('vote:updated', handleVoteUpdated);
    socket.on('vote:passed', handleVotePassed);
    socket.on('vote:failed', handleVoteFailed);

    return () => {
      socket.off('vote:started', handleVoteStarted);
      socket.off('vote:updated', handleVoteUpdated);
      socket.off('vote:passed', handleVotePassed);
      socket.off('vote:failed', handleVoteFailed);
    };
  }, [socket]);

  // Fetch on mount
  useEffect(() => {
    fetchActiveVote();
  }, [fetchActiveVote]);

  return {
    activeVote,
    startVote,
    castVote,
    refetchVote: fetchActiveVote,
  };
};
```

**Step 2: Commit**

```bash
git add mobile/src/hooks/useVoting.ts
git commit -m "feat: add useVoting hook for voting management"
```

---

## Task 7: Create Voting UI Components

**Files:**
- Create: `mobile/src/components/VoteCard.tsx`
- Create: `mobile/src/components/StartVoteModal.tsx`

**Step 1: Create VoteCard component**

Create `mobile/src/components/VoteCard.tsx`:

```typescript
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { VoteState, VoteType } from '../types/voting.types';

interface VoteCardProps {
  voteState: VoteState;
  onVote: (voteFor: boolean) => void;
  hasVoted: boolean;
  currentUserId: string | null;
}

export const VoteCard: React.FC<VoteCardProps> = ({
  voteState,
  onVote,
  hasVoted,
  currentUserId,
}) => {
  const handleVote = (voteFor: boolean) => {
    if (hasVoted) {
      Alert.alert('Already Voted', 'You have already cast your vote.');
      return;
    }

    const voteText = voteFor ? 'FOR' : 'AGAINST';
    const message =
      voteState.voteType === VoteType.DJ_ELECTION
        ? `Vote ${voteText} electing ${voteState.targetUsername} as DJ?`
        : `Vote ${voteText} removing the current DJ?`;

    Alert.alert('Confirm Vote', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Vote',
        onPress: () => onVote(voteFor),
      },
    ]);
  };

  const getVoteTitle = () => {
    if (voteState.voteType === VoteType.DJ_ELECTION) {
      return `DJ Election: ${voteState.targetUsername || 'Unknown'}`;
    }
    return 'Mutiny: Remove Current DJ';
  };

  const getVoteDescription = () => {
    if (voteState.voteType === VoteType.DJ_ELECTION) {
      return `Vote to elect ${voteState.targetUsername} as the new DJ`;
    }
    return 'Vote to remove the current DJ';
  };

  const progress = (voteState.votesFor / voteState.requiredVotes) * 100;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{getVoteTitle()}</Text>
      <Text style={styles.description}>{getVoteDescription()}</Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {voteState.votesFor} / {voteState.requiredVotes} votes
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>For</Text>
          <Text style={styles.statValue}>{voteState.votesFor}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Against</Text>
          <Text style={styles.statValue}>{voteState.votesAgainst}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Needed</Text>
          <Text style={styles.statValue}>{voteState.requiredVotes}</Text>
        </View>
      </View>

      {voteState.isActive && !hasVoted && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.againstButton]}
            onPress={() => handleVote(false)}
          >
            <Text style={styles.buttonText}>Vote Against</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.forButton]}
            onPress={() => handleVote(true)}
          >
            <Text style={styles.buttonText}>Vote For</Text>
          </TouchableOpacity>
        </View>
      )}

      {hasVoted && voteState.isActive && (
        <Text style={styles.votedText}>You have voted</Text>
      )}

      {!voteState.isActive && (
        <View style={styles.resultContainer}>
          <Text style={[styles.resultText, voteState.passed ? styles.passed : styles.failed]}>
            {voteState.passed ? 'VOTE PASSED' : 'VOTE FAILED'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#2a2a3e',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#5865F2',
  },
  progressText: {
    fontSize: 12,
    color: '#808080',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#808080',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  forButton: {
    backgroundColor: '#43b581',
  },
  againstButton: {
    backgroundColor: '#f04747',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  votedText: {
    fontSize: 14,
    color: '#5865F2',
    textAlign: 'center',
    fontWeight: '600',
    padding: 12,
  },
  resultContainer: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  passed: {
    color: '#43b581',
  },
  failed: {
    color: '#f04747',
  },
});
```

**Step 2: Create StartVoteModal component**

Create `mobile/src/components/StartVoteModal.tsx`:

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { VoteType } from '../types/voting.types';

interface Member {
  userId: string;
  username: string;
  displayName: string;
}

interface StartVoteModalProps {
  visible: boolean;
  onClose: () => void;
  onStartVote: (voteType: VoteType, targetUserId?: string) => Promise<void>;
  members: Member[];
  currentDjId: string | null;
}

export const StartVoteModal: React.FC<StartVoteModalProps> = ({
  visible,
  onClose,
  onStartVote,
  members,
  currentDjId,
}) => {
  const [voteType, setVoteType] = useState<VoteType | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const handleStartVote = async () => {
    if (!voteType) {
      Alert.alert('Error', 'Please select a vote type');
      return;
    }

    if (voteType === VoteType.DJ_ELECTION && !selectedMember) {
      Alert.alert('Error', 'Please select a member to elect as DJ');
      return;
    }

    try {
      await onStartVote(voteType, selectedMember?.userId);
      setVoteType(null);
      setSelectedMember(null);
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start vote');
    }
  };

  const eligibleMembers = members.filter(m => m.userId !== currentDjId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Start a Vote</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Vote Type</Text>
            <View style={styles.voteTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.voteTypeButton,
                  voteType === VoteType.DJ_ELECTION && styles.selectedVoteType,
                ]}
                onPress={() => setVoteType(VoteType.DJ_ELECTION)}
              >
                <Text style={styles.voteTypeText}>Elect DJ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.voteTypeButton,
                  voteType === VoteType.MUTINY && styles.selectedVoteType,
                ]}
                onPress={() => {
                  setVoteType(VoteType.MUTINY);
                  setSelectedMember(null);
                }}
              >
                <Text style={styles.voteTypeText}>Mutiny</Text>
              </TouchableOpacity>
            </View>

            {voteType === VoteType.DJ_ELECTION && (
              <>
                <Text style={styles.sectionTitle}>Select Member</Text>
                <FlatList
                  data={eligibleMembers}
                  keyExtractor={(item) => item.userId}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.memberItem,
                        selectedMember?.userId === item.userId && styles.selectedMember,
                      ]}
                      onPress={() => setSelectedMember(item)}
                    >
                      <Text style={styles.memberName}>{item.displayName}</Text>
                      <Text style={styles.memberUsername}>@{item.username}</Text>
                    </TouchableOpacity>
                  )}
                  style={styles.memberList}
                />
              </>
            )}

            {voteType === VoteType.MUTINY && (
              <Text style={styles.mutinyDescription}>
                Vote to remove the current DJ. Requires {Math.ceil(members.length * 0.51)} votes to pass.
              </Text>
            )}

            <TouchableOpacity
              style={[styles.startButton, !voteType && styles.startButtonDisabled]}
              onPress={handleStartVote}
              disabled={!voteType}
            >
              <Text style={styles.startButtonText}>Start Vote</Text>
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
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
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
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#b0b0b0',
    marginBottom: 12,
    marginTop: 8,
  },
  voteTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  voteTypeButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedVoteType: {
    borderColor: '#5865F2',
    backgroundColor: '#3a3a4e',
  },
  voteTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  memberList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  memberItem: {
    padding: 12,
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedMember: {
    borderColor: '#5865F2',
    backgroundColor: '#3a3a4e',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  memberUsername: {
    fontSize: 14,
    color: '#808080',
  },
  mutinyDescription: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 16,
    lineHeight: 20,
  },
  startButton: {
    backgroundColor: '#5865F2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
```

**Step 3: Commit**

```bash
git add mobile/src/components/VoteCard.tsx mobile/src/components/StartVoteModal.tsx
git commit -m "feat: add voting UI components"
```

---

## Task 8: Integrate Voting into RoomScreen

**Files:**
- Modify: `mobile/src/screens/RoomScreen.tsx`

**Step 1: Add voting integration to RoomScreen**

Modify `mobile/src/screens/RoomScreen.tsx`:

1. Add imports:
```typescript
import { useVoting } from '../hooks/useVoting';
import { VoteCard } from '../components/VoteCard';
import { StartVoteModal } from '../components/StartVoteModal';
import { VoteType } from '../types/voting.types';
```

2. Add state and hooks:
```typescript
const { activeVote, startVote, castVote } = useVoting(roomCode);
const [showStartVoteModal, setShowStartVoteModal] = useState(false);
const [hasVoted, setHasVoted] = useState(false);
```

3. Add handlers:
```typescript
const handleStartVote = async (voteType: VoteType, targetUserId?: string) => {
  try {
    await startVote(voteType, targetUserId);
  } catch (error: any) {
    Alert.alert('Error', error.message);
  }
};

const handleCastVote = async (voteFor: boolean) => {
  if (!activeVote) return;

  try {
    await castVote(activeVote.voteSessionId, voteFor);
    setHasVoted(true);
  } catch (error: any) {
    Alert.alert('Error', error.message);
  }
};

// Reset hasVoted when new vote starts
useEffect(() => {
  setHasVoted(false);
}, [activeVote?.voteSessionId]);
```

4. Add UI before the tab container:
```typescript
{activeVote && (
  <VoteCard
    voteState={activeVote}
    onVote={handleCastVote}
    hasVoted={hasVoted}
    currentUserId={user?.id || null}
  />
)}

{/* Start Vote Button - only show if no active vote */}
{!activeVote && (
  <TouchableOpacity
    style={styles.startVoteButton}
    onPress={() => setShowStartVoteModal(true)}
  >
    <Text style={styles.startVoteButtonText}>Start Vote</Text>
  </TouchableOpacity>
)}

<StartVoteModal
  visible={showStartVoteModal}
  onClose={() => setShowStartVoteModal(false)}
  onStartVote={handleStartVote}
  members={members} // Pass members from room state
  currentDjId={currentDjId}
/>
```

5. Add styles:
```typescript
startVoteButton: {
  backgroundColor: '#5865F2',
  padding: 12,
  borderRadius: 8,
  alignItems: 'center',
  margin: 16,
},
startVoteButtonText: {
  fontSize: 16,
  fontWeight: '600',
  color: '#fff',
},
```

**Step 2: Commit**

```bash
git add mobile/src/screens/RoomScreen.tsx
git commit -m "feat: integrate voting UI into RoomScreen"
```

---

## Task 9: Update Documentation

**Files:**
- Create: `docs/VOTING_SYSTEM.md`
- Modify: `README.md`

**Step 1: Create voting system documentation**

Create `docs/VOTING_SYSTEM.md`:

```markdown
# DJ Election and Mutiny System

## Overview

The groovebox democratic governance system allows room members to vote on DJ changes through elections and mutiny votes. This ensures the music control stays democratic and responsive to the room's preferences.

## Features

- **DJ Election**: Vote to elect a new DJ from room members
- **Mutiny Vote**: Vote to remove the current DJ
- **Real-Time Voting**: Live vote count updates via WebSocket
- **Threshold-Based**: Configurable vote threshold (default 51%)
- **DJ Cooldown**: Prevents rapid DJ changes (default 5 minutes)
- **Owner Protection**: Room owner cannot be removed via mutiny

## Vote Types

### DJ Election

- **Purpose**: Elect a new room member as DJ
- **Requirements**:
  - Target must be a room member
  - Target cannot already be DJ
  - Target must not be in cooldown period
- **Outcome**: New DJ gains playback control

### Mutiny

- **Purpose**: Remove the current DJ
- **Requirements**:
  - Must have an active DJ
  - DJ cannot be the room owner
- **Outcome**: DJ removed, no replacement

## Vote Flow

1. **Initiation**: Any room member can start a vote
2. **Voting**: All room members can vote FOR or AGAINST
3. **Threshold**: Vote passes when FOR votes reach required threshold
4. **Auto-Complete**: Vote ends when:
   - Required votes reached (passes)
   - All members voted without reaching threshold (fails)
   - Mathematically impossible to pass (fails)
5. **Execution**: DJ change happens automatically on pass

## Configuration

Room settings control voting behavior:

```typescript
{
  mutinyThreshold: 0.51,    // 51% of members required
  djCooldownMinutes: 5,     // 5 minute cooldown after DJ removal
}
```

## WebSocket Events

**Client → Server:**
- `vote:start` - Initiate a vote (DJ election or mutiny)
- `vote:cast` - Cast a vote (for or against)
- `vote:get` - Get current active vote state

**Server → Client:**
- `vote:started` - Vote initiated, broadcast to all
- `vote:updated` - Vote count changed
- `vote:passed` - Vote succeeded
- `vote:failed` - Vote failed
- `dj:changed` - DJ changed (with new DJ ID)

## Usage

### Starting a DJ Election

1. Tap "Start Vote" in room
2. Select "Elect DJ"
3. Choose target member
4. Vote begins automatically

### Starting a Mutiny

1. Tap "Start Vote" in room
2. Select "Mutiny"
3. Vote begins automatically

### Casting a Vote

1. View active vote card
2. Tap "Vote For" or "Vote Against"
3. Confirm your choice
4. Vote recorded and broadcast

## Rate Limits

- **One vote at a time**: Only one active vote per room
- **One vote per member**: Each member can vote once per session
- **DJ cooldown**: 5 minutes before same user can be DJ again (configurable)

## Future Enhancements

- **Vote duration limits**: Auto-fail votes after timeout
- **Veto power**: Owner can cancel votes
- **Vote history**: Track past votes and outcomes
- **Anonymous voting**: Hide individual vote choices
- **Multi-candidate elections**: Vote among multiple candidates
```

**Step 2: Update README**

Add to `README.md`:

```markdown
## Democratic Governance

Groovebox features a democratic voting system for DJ control:

- **DJ Elections**: Vote to elect new DJs from room members
- **Mutiny System**: Vote to remove the current DJ
- **Real-Time Voting**: Live vote counts with WebSocket updates

See [Voting System Documentation](docs/VOTING_SYSTEM.md) for details.
```

**Step 3: Commit**

```bash
git add README.md docs/VOTING_SYSTEM.md
git commit -m "docs: add voting system documentation"
```

---

## Task 10: Final Push

**Files:**
- None (git operations)

**Step 1: Review all commits**

Run:
```bash
git log --oneline --since="1 hour ago"
```

Expected: Clean commit history for voting system

**Step 2: Push to remote**

```bash
git push -u origin claude/mutiny-chat-submissions-0172JWPuWJPsspp8XgvMfpFT
```

Expected: Successful push

**Step 3: Verify on GitHub**

Check that all voting system commits are visible.

---

## Summary

This plan implements a complete democratic DJ governance system:

✅ Backend voting service with election and mutiny logic
✅ WebSocket events for real-time vote updates
✅ DJ cooldown and threshold enforcement
✅ React Native voting UI with live updates
✅ Integration with existing room system
✅ Comprehensive documentation

**Total Tasks**: 10
**Estimated Implementation Time**: 4-6 hours
**Key Technologies**: NestJS, TypeORM, PostgreSQL, Redis, Socket.io, React Native

**Next Steps After Implementation**:
1. Test voting with multiple users
2. Verify DJ changes propagate correctly
3. Test cooldown enforcement
4. Consider adding vote duration limits
5. Optional: Add vote history tracking
