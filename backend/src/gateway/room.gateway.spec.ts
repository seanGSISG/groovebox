import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomGateway } from './room.gateway';
import { RedisService } from '../redis/redis.service';
import { PlaybackSyncService } from './services/playback-sync.service';
import { Room, RoomMember, User, Message, RoomDjHistory, RoomMemberRole, RemovalReason } from '../entities';
import { Socket } from 'socket.io';

describe('RoomGateway', () => {
  let gateway: RoomGateway;
  let jwtService: JwtService;
  let redisService: RedisService;
  let playbackSyncService: PlaybackSyncService;
  let roomRepository: Repository<Room>;
  let roomMemberRepository: Repository<RoomMember>;
  let userRepository: Repository<User>;
  let messageRepository: Repository<Message>;
  let roomDjHistoryRepository: Repository<RoomDjHistory>;

  const mockJwtService = {
    verifyAsync: jest.fn(),
  };

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
  };

  const mockRedisService = {
    getCurrentDj: jest.fn(),
    setCurrentDj: jest.fn(),
    setPlaybackState: jest.fn(),
    getPlaybackState: jest.fn(),
    getMaxRttForRoom: jest.fn(),
    getClient: jest.fn(() => mockRedisClient),
    addSocketToRoom: jest.fn(),
    removeSocketFromRoom: jest.fn(),
    getSocketsInRoom: jest.fn(),
  };

  const mockPlaybackSyncService = {
    startSyncBroadcast: jest.fn(),
    stopSyncBroadcast: jest.fn(),
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
          provide: PlaybackSyncService,
          useValue: mockPlaybackSyncService,
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
    playbackSyncService = module.get<PlaybackSyncService>(PlaybackSyncService);
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
    it('should allow member to join room and track in Redis', async () => {
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
      mockRedisService.addSocketToRoom.mockResolvedValue(undefined);

      const result = await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      expect(mockRoomRepository.findOne).toHaveBeenCalledWith({ where: { roomCode: 'ABC123' } });
      expect(mockRoomMemberRepository.findOne).toHaveBeenCalledWith({
        where: { roomId: 'room-123', userId: 'user-123' },
        relations: ['user'],
      });
      expect(mockClient.join).toHaveBeenCalledWith('room:room-123');
      expect(mockRedisService.addSocketToRoom).toHaveBeenCalledWith('room-123', 'socket-123');
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

  describe('handleRoomLeave', () => {
    it('should allow member to leave room and remove from Redis', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
        leave: jest.fn(),
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.removeSocketFromRoom.mockResolvedValue(undefined);

      const result = await gateway.handleRoomLeave(mockClient, { roomCode: 'ABC123' });

      expect(mockRoomRepository.findOne).toHaveBeenCalledWith({ where: { roomCode: 'ABC123' } });
      expect(mockClient.leave).toHaveBeenCalledWith('room:room-123');
      expect(mockRedisService.removeSocketFromRoom).toHaveBeenCalledWith('room-123', 'socket-123');
      expect(result).toEqual({ success: true });
    });

    it('should return error for non-existent room', async () => {
      const mockClient = {
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      mockRoomRepository.findOne.mockResolvedValue(null);

      const result = await gateway.handleRoomLeave(mockClient, { roomCode: 'INVALID' });

      expect(result).toEqual({ error: 'Room not found' });
      expect(mockRedisService.removeSocketFromRoom).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('should clean up socket from all rooms on disconnect', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
        rooms: new Set(['socket-123', 'room:room-abc', 'room:room-def']),
      } as unknown as Socket;

      mockRedisService.removeSocketFromRoom.mockResolvedValue(undefined);

      await gateway.handleDisconnect(mockClient);

      // Should clean up both rooms
      expect(mockRedisService.removeSocketFromRoom).toHaveBeenCalledWith('room-abc', 'socket-123');
      expect(mockRedisService.removeSocketFromRoom).toHaveBeenCalledWith('room-def', 'socket-123');
      expect(mockRedisService.removeSocketFromRoom).toHaveBeenCalledTimes(2);
    });

    it('should handle disconnect when socket is not in any rooms', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
        rooms: new Set(['socket-123']), // Only the socket's own room
      } as unknown as Socket;

      mockRedisService.removeSocketFromRoom.mockResolvedValue(undefined);

      await gateway.handleDisconnect(mockClient);

      // Should not call removeSocketFromRoom since no room:* entries
      expect(mockRedisService.removeSocketFromRoom).not.toHaveBeenCalled();
    });

    it('should handle disconnect for unauthenticated client', async () => {
      const mockClient = {
        id: 'socket-123',
        data: {},
        rooms: new Set(['socket-123']),
      } as unknown as Socket;

      await gateway.handleDisconnect(mockClient);

      // Should not call removeSocketFromRoom for unauthenticated client
      expect(mockRedisService.removeSocketFromRoom).not.toHaveBeenCalled();
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
    it('should allow DJ to start playback with sync buffer', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
      mockRedisService.getMaxRttForRoom.mockResolvedValue(50); // Default RTT
      mockRedisClient.set.mockResolvedValue('OK');

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const result = await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
      });

      expect(mockRedisService.getCurrentDj).toHaveBeenCalledWith('room-123');
      expect(mockRedisService.getMaxRttForRoom).toHaveBeenCalledWith('room-123');

      // Should store enhanced playback state
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'room:room-123:state.playback',
        expect.stringContaining('playing')
      );

      // Should also store legacy playback state
      expect(mockRedisService.setPlaybackState).toHaveBeenCalledWith(
        'room-123',
        'playing',
        'track-456',
        0,
      );

      expect(gateway.server.to).toHaveBeenCalledWith('room:room-123');
      expect(result.success).toBe(true);
      expect(result.syncBufferMs).toBe(100); // DEFAULT_BUFFER_MS for 50ms RTT
      expect(result.startAtServerTime).toBeDefined();
      expect(result.serverTimestamp).toBeDefined();
      expect(result.trackId).toBe('track-456');
    });

    it('should calculate adaptive sync buffer for high RTT', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
      mockRedisService.getMaxRttForRoom.mockResolvedValue(150); // High RTT
      mockRedisClient.set.mockResolvedValue('OK');

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const result = await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
      });

      expect(result.success).toBe(true);
      expect(result.syncBufferMs).toBe(300); // 150 * 2 = 300ms
    });

    it('should cap sync buffer at MAX_BUFFER_MS for very high RTT', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
      mockRedisService.getMaxRttForRoom.mockResolvedValue(500); // Very high RTT
      mockRedisClient.set.mockResolvedValue('OK');

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      const result = await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
      });

      expect(result.success).toBe(true);
      expect(result.syncBufferMs).toBe(500); // Capped at MAX_BUFFER_MS (500ms)
    });

    it('should store playback state with correct format', async () => {
      const mockClient = {
        data: { userId: 'dj-123', username: 'djuser' },
      } as unknown as Socket;

      const mockRoom = {
        id: 'room-123',
        roomCode: 'ABC123',
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-123');
      mockRedisService.getMaxRttForRoom.mockResolvedValue(50);
      mockRedisClient.set.mockResolvedValue('OK');

      gateway.server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      } as any;

      await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
      });

      const storeCall = mockRedisClient.set.mock.calls[0];
      expect(storeCall[0]).toBe('room:room-123:state.playback');

      const storedState = JSON.parse(storeCall[1]);
      expect(storedState.playing).toBe(true);
      expect(storedState.trackId).toBe('track-456');
      expect(storedState.startAtServerTime).toBeDefined();
      expect(storedState.startedAt).toBeDefined();
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
      });

      expect(result).toEqual({ error: 'Only the current DJ can start playback' });
    });
  });

  describe('handlePlaybackPause', () => {
    it('should allow DJ to pause playback', async () => {
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
      expect(result.success).toBe(true);
    });
  });

  describe('handlePlaybackStop', () => {
    it('should allow DJ to stop playback', async () => {
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
      expect(result.success).toBe(true);
    });
  });

  describe('handleRoomJoin - room:state emission', () => {
    it('should send room:state with no active playback on join', async () => {
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
      mockRedisService.addSocketToRoom.mockResolvedValue(undefined);
      mockRedisClient.get.mockResolvedValue(null); // No playback state
      mockRedisService.getCurrentDj.mockResolvedValue(null);

      const result = await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      expect(result).toEqual({ success: true, roomId: 'room-123' });
      expect(mockClient.emit).toHaveBeenCalledWith('room:state', expect.objectContaining({
        roomId: 'room-123',
        members: [],
        currentDjId: null,
        playback: expect.objectContaining({
          playing: false,
          trackId: null,
          startAtServerTime: null,
          currentPosition: null,
          serverTimestamp: expect.any(Number),
        }),
      }));
    });

    it('should send room:state with active playback and calculated currentPosition', async () => {
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

      const startedAt = Date.now() - 5000; // Started 5 seconds ago
      const playbackState = {
        playing: true,
        trackId: 'track-456',
        startAtServerTime: startedAt + 100,
        startedAt: startedAt,
        initialPosition: 0,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockRedisService.addSocketToRoom.mockResolvedValue(undefined);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(playbackState));
      mockRedisService.getCurrentDj.mockResolvedValue('dj-456');

      const result = await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      expect(result).toEqual({ success: true, roomId: 'room-123' });

      const emitCall = (mockClient.emit as jest.Mock).mock.calls.find(
        call => call[0] === 'room:state'
      );
      expect(emitCall).toBeDefined();

      const roomState = emitCall[1];
      expect(roomState.roomId).toBe('room-123');
      expect(roomState.currentDjId).toBe('dj-456');
      expect(roomState.playback.playing).toBe(true);
      expect(roomState.playback.trackId).toBe('track-456');
      expect(roomState.playback.startAtServerTime).toBe(startedAt + 100);

      // currentPosition should be approximately 5000ms (elapsed time)
      expect(roomState.playback.currentPosition).toBeGreaterThanOrEqual(4900);
      expect(roomState.playback.currentPosition).toBeLessThanOrEqual(5100);
      expect(roomState.playback.serverTimestamp).toBeGreaterThan(startedAt);
    });

    it('should calculate currentPosition correctly for mid-song join', async () => {
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

      const startedAt = Date.now() - 30000; // Started 30 seconds ago
      const playbackState = {
        playing: true,
        trackId: 'track-789',
        startAtServerTime: startedAt + 200,
        startedAt: startedAt,
        initialPosition: 0,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockRedisService.addSocketToRoom.mockResolvedValue(undefined);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(playbackState));
      mockRedisService.getCurrentDj.mockResolvedValue('dj-789');

      await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      const emitCall = (mockClient.emit as jest.Mock).mock.calls.find(
        call => call[0] === 'room:state'
      );
      const roomState = emitCall[1];

      // currentPosition should be approximately 30000ms (30 seconds elapsed)
      expect(roomState.playback.currentPosition).toBeGreaterThanOrEqual(29900);
      expect(roomState.playback.currentPosition).toBeLessThanOrEqual(30100);
    });

    it('should send room:state with paused playback (playing: false)', async () => {
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

      const playbackState = {
        playing: false, // Paused
        trackId: 'track-456',
        startAtServerTime: null,
        startedAt: null,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockRedisService.addSocketToRoom.mockResolvedValue(undefined);
      mockRedisClient.get.mockResolvedValue(JSON.stringify(playbackState));
      mockRedisService.getCurrentDj.mockResolvedValue('dj-456');

      await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      const emitCall = (mockClient.emit as jest.Mock).mock.calls.find(
        call => call[0] === 'room:state'
      );
      const roomState = emitCall[1];

      expect(roomState.playback.playing).toBe(false);
      expect(roomState.playback.trackId).toBeNull();
      expect(roomState.playback.currentPosition).toBeNull();
      expect(roomState.playback.startAtServerTime).toBeNull();
    });

    it('should include currentDjId in room:state', async () => {
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
      mockRedisService.addSocketToRoom.mockResolvedValue(undefined);
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisService.getCurrentDj.mockResolvedValue('dj-999');

      await gateway.handleRoomJoin(mockClient, { roomCode: 'ABC123' });

      const emitCall = (mockClient.emit as jest.Mock).mock.calls.find(
        call => call[0] === 'room:state'
      );
      const roomState = emitCall[1];

      expect(roomState.currentDjId).toBe('dj-999');
    });
  });
});
