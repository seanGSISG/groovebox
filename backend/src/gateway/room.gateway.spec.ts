import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoomGateway } from './room.gateway';
import { RedisService } from '../redis/redis.service';
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

      const result = await gateway.handleChatMessage(mockClient, {
        roomCode: 'ABC123',
        content: '   ',
      });

      expect(result).toEqual({ error: 'Message content is required' });
    });
  });

  describe('handlePlaybackStart', () => {
    it('should allow DJ to start playback', async () => {
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

      const result = await gateway.handlePlaybackStart(mockClient, {
        roomCode: 'ABC123',
        trackId: 'track-456',
        position: 0,
      });

      expect(mockRedisService.getCurrentDj).toHaveBeenCalledWith('room-123');
      expect(mockRedisService.setPlaybackState).toHaveBeenCalledWith(
        'room-123',
        'playing',
        'track-456',
        0,
      );
      expect(gateway.server.to).toHaveBeenCalledWith('room:room-123');
      expect(result.success).toBe(true);
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
});
