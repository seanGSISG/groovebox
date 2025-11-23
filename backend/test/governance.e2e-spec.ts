import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../src/entities/user.entity';
import { Room } from '../src/entities/room.entity';
import { RoomMember } from '../src/entities/room-member.entity';
import { Vote } from '../src/entities/vote.entity';
import { RoomDjHistory } from '../src/entities/room-dj-history.entity';
import { Repository } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { RedisService } from '../src/redis/redis.service';

describe('Governance (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let roomRepository: Repository<Room>;
  let roomMemberRepository: Repository<RoomMember>;
  let voteRepository: Repository<Vote>;
  let roomDjHistoryRepository: Repository<RoomDjHistory>;
  let redisService: RedisService;

  // Test users
  let owner: { user: User; token: string; socket?: Socket };
  let user1: { user: User; token: string; socket?: Socket };
  let user2: { user: User; token: string; socket?: Socket };
  let user3: { user: User; token: string; socket?: Socket };

  // Test room
  let testRoom: Room;

  const getSocketUrl = () => `http://localhost:${app.getHttpServer().address().port}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Enable validation pipe like in main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    await app.listen(0); // Random available port

    userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    roomRepository = moduleFixture.get<Repository<Room>>(getRepositoryToken(Room));
    roomMemberRepository = moduleFixture.get<Repository<RoomMember>>(getRepositoryToken(RoomMember));
    voteRepository = moduleFixture.get<Repository<Vote>>(getRepositoryToken(Vote));
    roomDjHistoryRepository = moduleFixture.get<Repository<RoomDjHistory>>(getRepositoryToken(RoomDjHistory));
    redisService = moduleFixture.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    // Clean up sockets
    [owner, user1, user2, user3].forEach((u) => {
      if (u?.socket?.connected) {
        u.socket.disconnect();
      }
    });

    await app.close();
  });

  beforeEach(async () => {
    // Clean up database
    await voteRepository.query('DELETE FROM votes');
    await roomDjHistoryRepository.query('DELETE FROM room_dj_history');
    await roomMemberRepository.query('DELETE FROM room_members');
    await roomRepository.query('DELETE FROM rooms');
    await userRepository.query('DELETE FROM users WHERE username LIKE $1', ['govtest%']);

    // Clean up Redis
    const redis = redisService.getClient();
    const keys = await redis.keys('room:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    const voteKeys = await redis.keys('vote:*');
    if (voteKeys.length > 0) {
      await redis.del(...voteKeys);
    }

    // Disconnect any existing sockets
    [owner, user1, user2, user3].forEach((u) => {
      if (u?.socket?.connected) {
        u.socket.disconnect();
      }
    });

    // Create test users
    owner = await createTestUser('govtest_owner', 'Owner User');
    user1 = await createTestUser('govtest_user1', 'User One');
    user2 = await createTestUser('govtest_user2', 'User Two');
    user3 = await createTestUser('govtest_user3', 'User Three');

    // Create test room with owner
    const roomResponse = await request(app.getHttpServer())
      .post('/rooms')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        roomName: 'Governance Test Room',
        settings: {
          maxMembers: 10,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
        },
      });

    testRoom = await roomRepository.findOne({
      where: { roomCode: roomResponse.body.roomCode },
      relations: ['settings'],
    });

    // Add other users to the room
    await request(app.getHttpServer())
      .post('/rooms/join')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({ roomCode: testRoom.roomCode });

    await request(app.getHttpServer())
      .post('/rooms/join')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({ roomCode: testRoom.roomCode });

    await request(app.getHttpServer())
      .post('/rooms/join')
      .set('Authorization', `Bearer ${user3.token}`)
      .send({ roomCode: testRoom.roomCode });
  });

  /**
   * Helper to create a test user and get auth token
   */
  async function createTestUser(username: string, displayName: string) {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        password: 'password123',
        displayName,
      });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        username,
        password: 'password123',
      });

    const user = await userRepository.findOne({ where: { username } });

    return {
      user,
      token: loginResponse.body.accessToken,
    };
  }

  /**
   * Helper to create and connect a WebSocket client
   */
  function createSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(getSocketUrl(), {
        auth: { token },
        transports: ['websocket'],
      });

      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (error) => reject(error));

      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });
  }

  /**
   * Helper to join room via WebSocket
   */
  async function joinRoomSocket(socket: Socket, roomCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      socket.emit('room:join', { roomCode }, (response: any) => {
        if (response.error) {
          reject(new Error(response.error));
        } else {
          resolve();
        }
      });

      setTimeout(() => reject(new Error('Room join timeout')), 3000);
    });
  }

  describe('DJ Election', () => {
    it('should complete full DJ election flow with winner', async () => {
      // Connect sockets
      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);
      user2.socket = await createSocket(user2.token);
      user3.socket = await createSocket(user3.token);

      // Join room
      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);
      await joinRoomSocket(user2.socket, testRoom.roomCode);
      await joinRoomSocket(user3.socket, testRoom.roomCode);

      // Wait for election started event
      const electionStartedPromise = new Promise((resolve) => {
        user1.socket.on('vote:election-started', resolve);
      });

      // Start election
      owner.socket.emit('vote:start-election', testRoom.roomCode);

      const electionStarted: any = await electionStartedPromise;
      expect(electionStarted.voteSessionId).toBeDefined();
      expect(electionStarted.voteType).toBe('dj_election');
      expect(electionStarted.totalVoters).toBe(4);

      // Wait for vote complete event
      const voteCompletePromise = new Promise((resolve) => {
        user1.socket.on('vote:complete', resolve);
      });

      const djChangedPromise = new Promise((resolve) => {
        user1.socket.on('dj:changed', resolve);
      });

      // Cast votes (user1 gets 3 votes, user2 gets 1 vote)
      owner.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      user1.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      user2.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      user3.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user2.user.id,
      });

      const voteComplete: any = await voteCompletePromise;
      const djChanged: any = await djChangedPromise;

      expect(voteComplete.isComplete).toBe(true);
      expect(voteComplete.winner).toBe(user1.user.id);
      expect(djChanged.newDjId).toBe(user1.user.id);
      expect(djChanged.reason).toBe('vote');

      // Verify DJ in database
      const djHistory = await roomDjHistoryRepository.findOne({
        where: { roomId: testRoom.id, removedAt: null as any },
      });
      expect(djHistory.userId).toBe(user1.user.id);
    });

    it('should handle tie-breaking by selecting first voted candidate', async () => {
      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);
      user2.socket = await createSocket(user2.token);
      user3.socket = await createSocket(user3.token);

      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);
      await joinRoomSocket(user2.socket, testRoom.roomCode);
      await joinRoomSocket(user3.socket, testRoom.roomCode);

      const electionStartedPromise = new Promise((resolve) => {
        user1.socket.on('vote:election-started', resolve);
      });

      owner.socket.emit('vote:start-election', testRoom.roomCode);
      const electionStarted: any = await electionStartedPromise;

      const voteCompletePromise = new Promise((resolve) => {
        user1.socket.on('vote:complete', resolve);
      });

      // Create a tie - user1 and user2 each get 2 votes
      // user1 receives first vote first
      owner.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      // Delay to ensure timestamp difference (reliable on CI)
      await new Promise((resolve) => setTimeout(resolve, 50));

      user1.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user2.user.id,
      });

      user2.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      user3.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user2.user.id,
      });

      const voteComplete: any = await voteCompletePromise;

      // user1 should win because they received their first vote earlier
      expect(voteComplete.winner).toBe(user1.user.id);
    });

    it('should prevent concurrent votes', async () => {
      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const electionStartedPromise = new Promise((resolve) => {
        owner.socket.on('vote:election-started', resolve);
      });

      // Start first election
      owner.socket.emit('vote:start-election', testRoom.roomCode);
      await electionStartedPromise;

      // Try to start another election while first is active
      const errorPromise = new Promise((resolve) => {
        owner.socket.on('exception', resolve);
      });

      owner.socket.emit('vote:start-election', testRoom.roomCode);
      const error: any = await errorPromise;

      expect(error.message).toContain('vote is already in progress');
    });

    it('should auto-expire votes after 5 minutes', async () => {
      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const electionStartedPromise = new Promise((resolve) => {
        owner.socket.on('vote:election-started', resolve);
      });

      owner.socket.emit('vote:start-election', testRoom.roomCode);
      const electionStarted: any = await electionStartedPromise;

      // Fast-forward time in Redis by manipulating TTL
      const redis = redisService.getClient();
      const voteKey = `vote:${electionStarted.voteSessionId}`;
      await redis.expire(voteKey, 1); // Set to expire in 1 second

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Try to cast vote after expiry
      const errorPromise = new Promise((resolve) => {
        owner.socket.on('exception', resolve);
      });

      owner.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      const error: any = await errorPromise;
      expect(error.message).toContain('Vote session not found or expired');
    });

    it('should reject duplicate votes from same user', async () => {
      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);

      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);

      const electionStartedPromise = new Promise((resolve) => {
        owner.socket.on('vote:election-started', resolve);
      });

      owner.socket.emit('vote:start-election', testRoom.roomCode);
      const electionStarted: any = await electionStartedPromise;

      // Cast first vote
      owner.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      // Wait a bit for first vote to process
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Try to vote again
      const errorPromise = new Promise((resolve) => {
        owner.socket.on('exception', resolve);
      });

      owner.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user2.user.id,
      });

      const error: any = await errorPromise;
      expect(error.message).toContain('already voted');
    });
  });

  describe('Mutiny', () => {
    beforeEach(async () => {
      // Set user1 as DJ before mutiny tests
      await redisService.setCurrentDj(testRoom.id, user1.user.id);
      await roomDjHistoryRepository.save(
        roomDjHistoryRepository.create({
          roomId: testRoom.id,
          userId: user1.user.id,
          assignedBy: owner.user.id,
        }),
      );
    });

    it('should complete full mutiny flow with successful removal', async () => {
      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);
      user2.socket = await createSocket(user2.token);
      user3.socket = await createSocket(user3.token);

      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);
      await joinRoomSocket(user2.socket, testRoom.roomCode);
      await joinRoomSocket(user3.socket, testRoom.roomCode);

      const mutinyStartedPromise = new Promise((resolve) => {
        user1.socket.on('vote:mutiny-started', resolve);
      });

      owner.socket.emit('vote:start-mutiny', testRoom.roomCode);
      const mutinyStarted: any = await mutinyStartedPromise;

      expect(mutinyStarted.voteSessionId).toBeDefined();
      expect(mutinyStarted.voteType).toBe('mutiny');
      expect(mutinyStarted.targetDjId).toBe(user1.user.id);

      const voteCompletePromise = new Promise((resolve) => {
        user1.socket.on('vote:complete', resolve);
      });

      const mutinySuccessPromise = new Promise((resolve) => {
        user1.socket.on('mutiny:success', resolve);
      });

      // Cast votes - 3 yes, 1 no (75% yes > 51% threshold)
      owner.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user1.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user2.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user3.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: false,
      });

      const voteComplete: any = await voteCompletePromise;
      const mutinySuccess: any = await mutinySuccessPromise;

      expect(voteComplete.mutinyPassed).toBe(true);
      expect(mutinySuccess.removedDjId).toBe(user1.user.id);

      // Verify DJ was removed
      const currentDj = await redisService.getCurrentDj(testRoom.id);
      expect(currentDj).toBeNull();

      // Verify DJ cooldown was set
      const isCooldown = await redisService.getClient().get(
        `room:${testRoom.id}:dj_cooldown:${user1.user.id}`,
      );
      expect(isCooldown).toBeTruthy();
    });

    it('should handle failed mutiny when threshold not met', async () => {
      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);
      user2.socket = await createSocket(user2.token);
      user3.socket = await createSocket(user3.token);

      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);
      await joinRoomSocket(user2.socket, testRoom.roomCode);
      await joinRoomSocket(user3.socket, testRoom.roomCode);

      const mutinyStartedPromise = new Promise((resolve) => {
        user1.socket.on('vote:mutiny-started', resolve);
      });

      owner.socket.emit('vote:start-mutiny', testRoom.roomCode);
      const mutinyStarted: any = await mutinyStartedPromise;

      const mutinyFailedPromise = new Promise((resolve) => {
        user1.socket.on('mutiny:failed', resolve);
      });

      // Cast votes - 1 yes, 3 no (25% yes < 51% threshold)
      owner.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user1.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: false,
      });

      user2.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: false,
      });

      user3.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: false,
      });

      const mutinyFailed: any = await mutinyFailedPromise;
      expect(mutinyFailed.voteSessionId).toBe(mutinyStarted.voteSessionId);

      // Verify DJ was NOT removed
      const currentDj = await redisService.getCurrentDj(testRoom.id);
      expect(currentDj).toBe(user1.user.id);
    });

    it('should enforce mutiny cooldown', async () => {
      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      // Set mutiny cooldown manually
      const redis = redisService.getClient();
      await redis.setex(`room:${testRoom.id}:mutiny_cooldown`, 600, '1');

      const errorPromise = new Promise((resolve) => {
        owner.socket.on('exception', resolve);
      });

      owner.socket.emit('vote:start-mutiny', testRoom.roomCode);
      const error: any = await errorPromise;

      expect(error.message).toContain('Mutiny is on cooldown');
    });

    it('should reject mutiny when no DJ exists', async () => {
      // Remove the DJ we set in beforeEach
      await redisService.setCurrentDj(testRoom.id, null);

      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const errorPromise = new Promise((resolve) => {
        owner.socket.on('exception', resolve);
      });

      owner.socket.emit('vote:start-mutiny', testRoom.roomCode);
      const error: any = await errorPromise;

      expect(error.message).toContain('No DJ to mutiny against');
    });

    it('should complete mutiny early when outcome is mathematically guaranteed', async () => {
      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);
      user2.socket = await createSocket(user2.token);
      user3.socket = await createSocket(user3.token);

      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);
      await joinRoomSocket(user2.socket, testRoom.roomCode);
      await joinRoomSocket(user3.socket, testRoom.roomCode);

      const mutinyStartedPromise = new Promise((resolve) => {
        user1.socket.on('vote:mutiny-started', resolve);
      });

      owner.socket.emit('vote:start-mutiny', testRoom.roomCode);
      const mutinyStarted: any = await mutinyStartedPromise;

      const voteCompletePromise = new Promise((resolve) => {
        user1.socket.on('vote:complete', resolve);
      });

      // Cast 3 yes votes - outcome guaranteed even if 4th person votes no
      // 3/4 = 75% > 51% threshold
      owner.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user1.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user2.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      const voteComplete: any = await voteCompletePromise;

      // Should complete early before 4th vote
      expect(voteComplete.isComplete).toBe(true);
      expect(voteComplete.mutinyPassed).toBe(true);
    });
  });

  describe('Randomize DJ', () => {
    it('should select random DJ when initiated by owner', async () => {
      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const djChangedPromise = new Promise((resolve) => {
        owner.socket.on('dj:changed', resolve);
      });

      owner.socket.emit('dj:randomize', testRoom.roomCode);
      const djChanged: any = await djChangedPromise;

      expect(djChanged.newDjId).toBeDefined();
      expect(djChanged.reason).toBe('randomize');
      expect([owner.user.id, user1.user.id, user2.user.id, user3.user.id]).toContain(
        djChanged.newDjId,
      );

      // Verify in database
      const djHistory = await roomDjHistoryRepository.findOne({
        where: { roomId: testRoom.id, removedAt: null as any },
      });
      expect(djHistory.userId).toBe(djChanged.newDjId);
    });

    it('should reject randomize DJ from non-owner', async () => {
      user1.socket = await createSocket(user1.token);
      await joinRoomSocket(user1.socket, testRoom.roomCode);

      const errorPromise = new Promise((resolve) => {
        user1.socket.on('exception', resolve);
      });

      user1.socket.emit('dj:randomize', testRoom.roomCode);
      const error: any = await errorPromise;

      expect(error.message).toContain('Only room owner can randomize DJ');
    });

    it('should replace existing DJ when randomizing', async () => {
      // Set user1 as current DJ
      await redisService.setCurrentDj(testRoom.id, user1.user.id);
      await roomDjHistoryRepository.save(
        roomDjHistoryRepository.create({
          roomId: testRoom.id,
          userId: user1.user.id,
          assignedBy: owner.user.id,
        }),
      );

      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const djChangedPromise = new Promise((resolve) => {
        owner.socket.on('dj:changed', resolve);
      });

      owner.socket.emit('dj:randomize', testRoom.roomCode);
      const djChanged: any = await djChangedPromise;

      expect(djChanged.newDjId).toBeDefined();
      expect(djChanged.reason).toBe('randomize');

      // Verify old DJ was removed
      const oldDjHistory = await roomDjHistoryRepository.findOne({
        where: { roomId: testRoom.id, userId: user1.user.id },
      });
      expect(oldDjHistory.removedAt).toBeDefined();
      expect(oldDjHistory.removalReason).toBe('voluntary');
    });
  });

  describe('Error Cases', () => {
    it('should reject vote from non-member', async () => {
      // Create a user who is not a member of the room
      const outsider = await createTestUser('govtest_outsider', 'Outsider');
      const outsiderSocket = await createSocket(outsider.token);

      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const electionStartedPromise = new Promise((resolve) => {
        owner.socket.on('vote:election-started', resolve);
      });

      owner.socket.emit('vote:start-election', testRoom.roomCode);
      const electionStarted: any = await electionStartedPromise;

      // Outsider tries to cast vote
      const errorPromise = new Promise((resolve) => {
        outsiderSocket.on('exception', resolve);
      });

      outsiderSocket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      const error: any = await errorPromise;
      expect(error.message).toBeDefined();

      outsiderSocket.disconnect();
    });

    it('should reject invalid vote session ID', async () => {
      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const errorPromise = new Promise((resolve) => {
        owner.socket.on('exception', resolve);
      });

      owner.socket.emit('vote:cast-dj', {
        voteSessionId: '00000000-0000-0000-0000-000000000000',
        targetUserId: user1.user.id,
      });

      const error: any = await errorPromise;
      expect(error.message).toContain('Vote session not found or expired');
    });

    it('should handle WebSocket disconnection during vote', async () => {
      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);
      user2.socket = await createSocket(user2.token);

      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);
      await joinRoomSocket(user2.socket, testRoom.roomCode);

      const electionStartedPromise = new Promise((resolve) => {
        user1.socket.on('vote:election-started', resolve);
      });

      owner.socket.emit('vote:start-election', testRoom.roomCode);
      const electionStarted: any = await electionStartedPromise;

      // Cast one vote
      owner.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      // Disconnect user1
      user1.socket.disconnect();

      // Vote should still be valid for user2
      const resultsUpdatedPromise = new Promise((resolve) => {
        user2.socket.on('vote:results-updated', resolve);
      });

      user2.socket.emit('vote:cast-dj', {
        voteSessionId: electionStarted.voteSessionId,
        targetUserId: user1.user.id,
      });

      const resultsUpdated: any = await resultsUpdatedPromise;
      expect(resultsUpdated.voteSessionId).toBe(electionStarted.voteSessionId);
    });
  });

  describe('Cooldown Enforcement', () => {
    it('should enforce DJ cooldown after mutiny', async () => {
      // Set user1 as DJ
      await redisService.setCurrentDj(testRoom.id, user1.user.id);
      await roomDjHistoryRepository.save(
        roomDjHistoryRepository.create({
          roomId: testRoom.id,
          userId: user1.user.id,
          assignedBy: owner.user.id,
        }),
      );

      owner.socket = await createSocket(owner.token);
      user1.socket = await createSocket(user1.token);
      user2.socket = await createSocket(user2.token);
      user3.socket = await createSocket(user3.token);

      await joinRoomSocket(owner.socket, testRoom.roomCode);
      await joinRoomSocket(user1.socket, testRoom.roomCode);
      await joinRoomSocket(user2.socket, testRoom.roomCode);
      await joinRoomSocket(user3.socket, testRoom.roomCode);

      // Start and complete successful mutiny
      const mutinyStartedPromise = new Promise((resolve) => {
        user1.socket.on('vote:mutiny-started', resolve);
      });

      owner.socket.emit('vote:start-mutiny', testRoom.roomCode);
      const mutinyStarted: any = await mutinyStartedPromise;

      const mutinySuccessPromise = new Promise((resolve) => {
        user1.socket.on('mutiny:success', resolve);
      });

      // All vote yes
      owner.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user1.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user2.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      user3.socket.emit('vote:cast-mutiny', {
        voteSessionId: mutinyStarted.voteSessionId,
        voteValue: true,
      });

      await mutinySuccessPromise;

      // Verify DJ cooldown was set
      const redis = redisService.getClient();
      const cooldownKey = `room:${testRoom.id}:dj_cooldown:${user1.user.id}`;
      const cooldown = await redis.get(cooldownKey);
      expect(cooldown).toBeTruthy();

      // Verify TTL is approximately 5 minutes (300 seconds)
      const ttl = await redis.ttl(cooldownKey);
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);
    });

    it('should verify mutiny cooldown is set after mutiny attempt', async () => {
      // Set user1 as DJ
      await redisService.setCurrentDj(testRoom.id, user1.user.id);
      await roomDjHistoryRepository.save(
        roomDjHistoryRepository.create({
          roomId: testRoom.id,
          userId: user1.user.id,
          assignedBy: owner.user.id,
        }),
      );

      owner.socket = await createSocket(owner.token);
      await joinRoomSocket(owner.socket, testRoom.roomCode);

      const mutinyStartedPromise = new Promise((resolve) => {
        owner.socket.on('vote:mutiny-started', resolve);
      });

      owner.socket.emit('vote:start-mutiny', testRoom.roomCode);
      await mutinyStartedPromise;

      // Verify cooldown was set
      const redis = redisService.getClient();
      const cooldownKey = `room:${testRoom.id}:mutiny_cooldown`;
      const cooldown = await redis.get(cooldownKey);
      expect(cooldown).toBeTruthy();

      // Verify TTL is approximately 10 minutes (600 seconds)
      const ttl = await redis.ttl(cooldownKey);
      expect(ttl).toBeGreaterThan(590);
      expect(ttl).toBeLessThanOrEqual(600);
    });
  });
});
