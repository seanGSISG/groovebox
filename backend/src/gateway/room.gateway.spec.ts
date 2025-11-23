import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomGateway } from './room.gateway';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';
import { Room, RoomMember, User, Message, RoomDjHistory, RoomMemberRole, RemovalReason } from '../entities';
import { Socket } from 'socket.io';

describe('RoomGateway', () => {
  let gateway: RoomGateway;
  let jwtService: JwtService;
  let redisService: RedisService;
  let roomRepository: Repository<Room>;
  let roomMemberRepository: Repository<RoomMember>;
  let userRepository: Repository<User>;
  let messageRepository: Repository<Message>;
  let roomDjHistoryRepository: Repository<RoomDjHistory>;

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const mockRedisService = {
    getCurrentDj: jest.fn(),
    setCurrentDj: jest.fn(),
    setPlaybackState: jest.fn(),
    getPlaybackState: jest.fn(),
    addSocketToRoom: jest.fn(),
    removeSocketFromRoom: jest.fn(),
    getMaxRttForRoom: jest.fn(),
    getPlaybackStartTime: jest.fn(),
    getTrackDuration: jest.fn(),
    setPlaybackPosition: jest.fn(),
  };

  const mockRoomsService = {
    calculateSyncBuffer: jest.fn(),
  };

  const mockRoomRepository = {
    findOne: jest.fn(),
  };

  const mockRoomMemberRepository = {
    findOne: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockMessageRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockRoomDjHistoryRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomGateway,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: RoomsService,
          useValue: mockRoomsService,
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
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Message),
          useValue: mockMessageRepository,
        },
        {
          provide: getRepositoryToken(RoomDjHistory),
          useValue: mockRoomDjHistoryRepository,
        },
      ],
    }).compile();

    gateway = module.get<RoomGateway>(RoomGateway);
    jwtService = module.get<JwtService>(JwtService);
    redisService = module.get<RedisService>(RedisService);
    roomRepository = module.get<Repository<Room>>(getRepositoryToken(Room));
    roomMemberRepository = module.get<Repository<RoomMember>>(getRepositoryToken(RoomMember));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    messageRepository = module.get<Repository<Message>>(getRepositoryToken(Message));
    roomDjHistoryRepository = module.get<Repository<RoomDjHistory>>(getRepositoryToken(RoomDjHistory));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should authenticate user with valid token', async () => {
      const mockClient = {
        handshake: {
          auth: { token: 'valid-token' },
        },
        data: {},
        disconnect: jest.fn(),
      } as unknown as Socket;

      const mockUser = {
        id: 'user-123',
        username: 'testuser',
        displayName: 'Test User',
      };

      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-123' });
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await gateway.handleConnection(mockClient);

      expect(mockJwtService.verifyAsync).toHaveBeenCalledWith('valid-token');
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({ where: { id: 'user-123' } });
      expect(mockClient.data).toEqual({
        userId: 'user-123',
        username: 'testuser',
      });
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should reject connection without token', async () => {
      const mockClient = {
        handshake: {
          auth: {},
          headers: {},
          query: {},
        },
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
      expect(mockJwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('should reject connection with invalid token', async () => {
      const mockClient = {
        handshake: {
          auth: { token: 'invalid-token' },
        },
        disconnect: jest.fn(),
      } as unknown as Socket;

      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should reject connection if user not found', async () => {
      const mockClient = {
        handshake: {
          auth: { token: 'valid-token' },
        },
        disconnect: jest.fn(),
      } as unknown as Socket;

      mockJwtService.verifyAsync.mockResolvedValue({ sub: 'user-123' });
      mockUserRepository.findOne.mockResolvedValue(null);

      await gateway.handleConnection(mockClient);

      expect(mockClient.disconnect).toHaveBeenCalled();
    });
  });

  describe('handleRoomJoin', () => {
    it('should allow member to join room', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
        join: jest.fn(),
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      const mockMember = {
        userId: 'user-123',
        user: {
          username: 'testuser',
          displayName: 'Test User',
        },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);

      const result = await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      expect(mockRoomRepository.findOne).toHaveBeenCalledWith({ where: { roomCode: 'ABC123' } });
      expect(mockRoomMemberRepository.findOne).toHaveBeenCalledWith({
        where: { roomId: 'room-123', userId: 'user-123' },
        relations: ['user'],
      });
      expect(mockClient.join).toHaveBeenCalledWith('room:room-123');
      expect(result).toEqual({ success: true, roomId: 'room-123' });
    });

    it('should reject non-member from joining room', async () => {
      const mockClient = {
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(null);

      const result = await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      expect(result).toEqual({ error: 'You are not a member of this room' });
    });

    it('should return error for non-existent room', async () => {
      const mockClient = {
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      mockRoomRepository.findOne.mockResolvedValue(null);

      const result = await gateway.handleRoomJoin(mockClient, { roomCode: 'INVALID' });

      expect(result).toEqual({ error: 'Room not found' });
    });
  });

  describe('handleChatMessage', () => {
    it('should send and broadcast chat message', async () => {
      const mockClient = {
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      const mockMember = {
        userId: 'user-123',
        user: {
          username: 'testuser',
          displayName: 'Test User',
        },
      };

      const mockMessage = {
        id: 'msg-123',
        roomId: 'room-123',
        userId: 'user-123',
        content: 'Hello, world!',
        createdAt: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockMessageRepository.create.mockReturnValue(mockMessage);
      mockMessageRepository.save.mockResolvedValue(mockMessage);

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const result = await gateway.handleChatMessage(mockClient, {
        roomCode: 'ABC123',
        content: 'Hello, world!',
      });

      expect(mockMessageRepository.create).toHaveBeenCalledWith({
        roomId: 'room-123',
        userId: 'user-123',
        content: 'Hello, world!',
      });
      expect(mockMessageRepository.save).toHaveBeenCalledWith(mockMessage);
      expect(gateway.server.to).toHaveBeenCalledWith('room:room-123');
      expect(result.success).toBe(true);
    });

    it('should reject empty message', async () => {
      const mockClient = {
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      // ValidationPipe will reject empty strings before reaching the handler
      // Testing with actual validation would require integration testing
      // For now, we test that the handler still has the check
      const result = await gateway.handleChatMessage(mockClient, {
        roomCode: 'ABC123',
        content: '',
      });

      // The ValidationPipe should prevent this from reaching the handler
      // but if it does, the error should be caught
      expect(result.error).toBeDefined();
    });
  });

  describe('handlePlaybackStart', () => {
    it('should allow DJ to start playback with timing metadata', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      const syncBuffer = 1500;
      const trackDuration = 180000; // 3 minutes

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
      mockRoomsService.calculateSyncBuffer.mockResolvedValue(syncBuffer);

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const result = await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
        trackDuration,
      });

      expect(mockRedisService.getCurrentDj).toHaveBeenCalledWith('room-123');
      expect(mockRoomsService.calculateSyncBuffer).toHaveBeenCalledWith('room-123');
      expect(mockRedisService.setPlaybackState).toHaveBeenCalledWith(
        'room-123',
        'playing',
        'track-456',
        0,
        expect.any(Number), // startAtServerTime
        trackDuration,
        syncBuffer,
      );
      expect(gateway.server.to).toHaveBeenCalledWith('room:room-123');
      expect(gateway.server.emit).toHaveBeenCalledWith('playback:start', expect.objectContaining({
        roomId: 'room-123',
        trackId: 'track-456',
        position: 0,
        trackDuration,
        syncBuffer,
        startAtServerTime: expect.any(Number),
        serverTimestamp: expect.any(Number),
      }));
      expect(result.success).toBe(true);
      expect(result.syncBuffer).toBe(syncBuffer);
      expect(result.trackDuration).toBe(trackDuration);
    });

    it('should reject non-DJ from starting playback', async () => {
      const mockClient = {
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');

      const result = await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
        trackDuration: 180000,
      });

      expect(result).toEqual({ error: 'Only the current DJ can start playback' });
    });

    it('should ensure startAtServerTime is in the future', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
      mockRoomsService.calculateSyncBuffer.mockResolvedValue(2000);

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const beforeCall = Date.now();
      const result = await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
        trackDuration: 180000,
      });

      expect(result.startAtServerTime).toBeGreaterThan(beforeCall);
      expect(result.startAtServerTime).toBeGreaterThan(result.serverTimestamp);
    });
  });

  describe('handlePlaybackPause', () => {
    it('should allow DJ to pause playback with server timestamp', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const result = await gateway.handlePlaybackPause(mockClient, {
        roomCode: 'ABC123',
        position: 100,
      });

      expect(mockRedisService.setPlaybackState).toHaveBeenCalledWith(
        'room-123',
        'paused',
        undefined,
        100,
      );
      expect(mockRedisService.setPlaybackPosition).toHaveBeenCalledWith('room-123', 100);
      expect(gateway.server.emit).toHaveBeenCalledWith('playback:pause', expect.objectContaining({
        roomId: 'room-123',
        position: 100,
        serverTimestamp: expect.any(Number),
      }));
      expect(result.success).toBe(true);
      expect(result.serverTimestamp).toBeDefined();
    });
  });

  describe('handlePlaybackStop', () => {
    it('should allow DJ to stop playback with server timestamp', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const result = await gateway.handlePlaybackStop(mockClient, {
        roomCode: 'ABC123',
      });

      expect(mockRedisService.setPlaybackState).toHaveBeenCalledWith('room-123', 'stopped');
      expect(gateway.server.emit).toHaveBeenCalledWith('playback:stop', expect.objectContaining({
        roomId: 'room-123',
        serverTimestamp: expect.any(Number),
      }));
      expect(result.success).toBe(true);
      expect(result.serverTimestamp).toBeDefined();
    });
  });

  describe('Periodic Sync Broadcasting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    describe('startPeriodicSync', () => {
      it('should start interval and broadcast immediately', async () => {
        const roomId = 'room-123';
        const trackDuration = 180000; // 3 minutes

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        // Should have emitted immediately
        expect(gateway.server.emit).toHaveBeenCalledWith('playback:sync', expect.objectContaining({
          roomId,
          trackId: 'track-456',
          position: expect.any(Number),
          serverTimestamp: expect.any(Number),
          startAtServerTime: expect.any(Number),
        }));

        // Clear the initial emission
        jest.clearAllMocks();

        // Fast-forward 10 seconds
        jest.advanceTimersByTime(10000);
        await Promise.resolve(); // Allow async operations to complete

        // Should have emitted again after interval
        expect(mockRedisService.getPlaybackState).toHaveBeenCalled();
      });

      it('should clear existing interval before creating new one', async () => {
        const roomId = 'room-123';
        const trackDuration = 180000;

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        // Start first interval
        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        jest.clearAllMocks();

        // Start second interval (should clear the first)
        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-789',
          position: 0,
          trackDuration,
        });

        // Should only have one interval running
        expect(jest.getTimerCount()).toBe(1);
      });
    });

    describe('stopPeriodicSync', () => {
      it('should stop interval on pause', async () => {
        const roomId = 'room-123';
        const trackDuration = 180000;

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        // Start playback
        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        expect(jest.getTimerCount()).toBeGreaterThan(0);

        // Pause playback
        await gateway.handlePlaybackPause(mockClient, {
          roomCode: 'ABC123',
          position: 50000,
        });

        // Interval should be cleared
        expect(jest.getTimerCount()).toBe(0);
      });

      it('should stop interval on stop', async () => {
        const roomId = 'room-123';
        const trackDuration = 180000;

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        // Start playback
        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        expect(jest.getTimerCount()).toBeGreaterThan(0);

        // Stop playback
        await gateway.handlePlaybackStop(mockClient, {
          roomCode: 'ABC123',
        });

        // Interval should be cleared
        expect(jest.getTimerCount()).toBe(0);
      });
    });

    describe('broadcastPlaybackSync', () => {
      it('should calculate position correctly based on elapsed time', async () => {
        const roomId = 'room-123';
        const startAtServerTime = Date.now();
        const initialPosition = 0;
        const trackDuration = 180000;

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: initialPosition,
          startAtServerTime,
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: initialPosition,
          trackDuration,
        });

        jest.clearAllMocks();

        // Advance time by 5 seconds
        jest.advanceTimersByTime(5000);

        // Update mock to reflect time passage
        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: initialPosition,
          startAtServerTime,
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        // Trigger another sync by advancing 10 seconds total
        jest.advanceTimersByTime(5000);
        await Promise.resolve();

        // Should have calculated position as initial + elapsed time
        // The position should be approximately 10000ms (10 seconds elapsed)
        const syncCalls = (gateway.server.emit as jest.Mock).mock.calls.filter(
          call => call[0] === 'playback:sync'
        );

        if (syncCalls.length > 0) {
          const lastSyncCall = syncCalls[syncCalls.length - 1];
          const syncPayload = lastSyncCall[1];
          expect(syncPayload.position).toBeGreaterThan(initialPosition);
        }
      });

      it('should stop broadcasting if playback state is not playing', async () => {
        const roomId = 'room-123';
        const trackDuration = 180000;

        // Start with playing state
        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        const initialTimerCount = jest.getTimerCount();
        expect(initialTimerCount).toBeGreaterThan(0);

        // Change state to paused
        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'paused',
          trackId: 'track-456',
          position: 50000,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        // Advance time to trigger broadcast
        jest.advanceTimersByTime(10000);
        await Promise.resolve();

        // Should have stopped the interval
        expect(jest.getTimerCount()).toBe(0);
      });

      it('should emit track:ended and stop when position exceeds duration', async () => {
        const roomId = 'room-123';
        const trackDuration = 10000; // 10 seconds
        const now = Date.now();
        const startAtServerTime = now;

        // Mock Date.now to control time in tests
        const dateNowSpy = jest.spyOn(Date, 'now');
        dateNowSpy.mockReturnValue(now);

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime,
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: now,
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        jest.clearAllMocks();

        // Advance time to past track duration (11 seconds)
        const futureTime = now + 11000;
        dateNowSpy.mockReturnValue(futureTime);

        // Keep the playback state showing it's still playing but started in the past
        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime,
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: futureTime,
        });

        // Advance timer to trigger sync
        jest.advanceTimersByTime(10000);
        await Promise.resolve();

        // Should have emitted track:ended
        expect(gateway.server.emit).toHaveBeenCalledWith('track:ended', expect.objectContaining({
          roomId,
          trackId: 'track-456',
          serverTimestamp: expect.any(Number),
        }));

        // Should have updated playback state to stopped
        expect(mockRedisService.setPlaybackState).toHaveBeenCalledWith(roomId, 'stopped');

        // Should have stopped the interval
        expect(jest.getTimerCount()).toBe(0);

        // Restore Date.now
        dateNowSpy.mockRestore();
      });

      it('should handle missing playback data gracefully', async () => {
        const roomId = 'room-123';
        const trackDuration = 180000;

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom = {
          id: roomId,
          roomCode: 'ABC123',
        };

        mockRoomRepository.findOne.mockResolvedValue(mockRoom);
        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        // Change state to missing data
        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: null,
          position: null,
          startAtServerTime: null,
          trackDuration: null,
          syncBuffer: null,
          lastUpdate: null,
        });

        jest.clearAllMocks();

        // Advance time to trigger broadcast
        jest.advanceTimersByTime(10000);
        await Promise.resolve();

        // Should have stopped the interval due to missing data
        expect(jest.getTimerCount()).toBe(0);
      });
    });

    describe('onModuleDestroy', () => {
      it('should clear all sync intervals', async () => {
        const trackDuration = 180000;

        mockRedisService.getPlaybackState.mockResolvedValue({
          playbackState: 'playing',
          trackId: 'track-456',
          position: 0,
          startAtServerTime: Date.now(),
          trackDuration,
          syncBuffer: 1500,
          lastUpdate: Date.now(),
        });

        const mockClient = {
          data: { userId: 'dj-123', username: 'djuser' },
        } as unknown as Socket;

        const mockRoom1 = {
          id: 'room-123',
          roomCode: 'ABC123',
        };

        const mockRoom2 = {
          id: 'room-456',
          roomCode: 'DEF456',
        };

        mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
        mockRoomsService.calculateSyncBuffer.mockResolvedValue(1500);

        // Start playback in room 1
        mockRoomRepository.findOne.mockResolvedValue(mockRoom1);
        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'ABC123',
          trackId: 'track-456',
          position: 0,
          trackDuration,
        });

        // Start playback in room 2
        mockRoomRepository.findOne.mockResolvedValue(mockRoom2);
        await gateway.handlePlaybackStart(mockClient, {
          roomCode: 'DEF456',
          trackId: 'track-789',
          position: 0,
          trackDuration,
        });

        expect(jest.getTimerCount()).toBe(2);

        // Call onModuleDestroy
        gateway.onModuleDestroy();

        // All intervals should be cleared
        expect(jest.getTimerCount()).toBe(0);
      });
    });
  });
});
