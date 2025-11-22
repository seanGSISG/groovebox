import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('RedisService', () => {
  let service: RedisService;
  let mockRedisClient: jest.Mocked<Redis>;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      return undefined;
    }),
  };

  beforeEach(async () => {
    mockRedisClient = {
      on: jest.fn(),
      hset: jest.fn(),
      hget: jest.fn(),
      hgetall: jest.fn(),
      hdel: jest.fn(),
      del: jest.fn(),
      hmset: jest.fn(),
      quit: jest.fn(),
      keys: jest.fn(),
      get: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
    } as any;

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedisClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setRoomState', () => {
    it('should set room state in Redis', async () => {
      mockRedisClient.hset.mockResolvedValue(1);

      await service.setRoomState('room-123', 'currentDjId', 'user-456');

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'room:room-123:state',
        'currentDjId',
        'user-456',
      );
    });
  });

  describe('getRoomState', () => {
    it('should get room state from Redis', async () => {
      mockRedisClient.hget.mockResolvedValue('user-456');

      const result = await service.getRoomState('room-123', 'currentDjId');

      expect(mockRedisClient.hget).toHaveBeenCalledWith('room:room-123:state', 'currentDjId');
      expect(result).toBe('user-456');
    });

    it('should return null for non-existent key', async () => {
      mockRedisClient.hget.mockResolvedValue(null);

      const result = await service.getRoomState('room-123', 'nonExistent');

      expect(result).toBeNull();
    });
  });

  describe('getAllRoomState', () => {
    it('should get all room state from Redis', async () => {
      const mockState = {
        currentDjId: 'user-456',
        playbackState: 'playing',
      };

      mockRedisClient.hgetall.mockResolvedValue(mockState);

      const result = await service.getAllRoomState('room-123');

      expect(mockRedisClient.hgetall).toHaveBeenCalledWith('room:room-123:state');
      expect(result).toEqual(mockState);
    });
  });

  describe('deleteRoomState', () => {
    it('should delete specific key from room state', async () => {
      mockRedisClient.hdel.mockResolvedValue(1);

      await service.deleteRoomState('room-123', 'currentDjId');

      expect(mockRedisClient.hdel).toHaveBeenCalledWith('room:room-123:state', 'currentDjId');
    });

    it('should delete entire room state if no key specified', async () => {
      mockRedisClient.del.mockResolvedValue(1);

      await service.deleteRoomState('room-123');

      expect(mockRedisClient.del).toHaveBeenCalledWith('room:room-123:state');
    });
  });

  describe('setCurrentDj', () => {
    it('should set current DJ in Redis', async () => {
      mockRedisClient.hset.mockResolvedValue(1);

      await service.setCurrentDj('room-123', 'user-456');

      expect(mockRedisClient.hset).toHaveBeenCalledWith(
        'room:room-123:state',
        'currentDjId',
        'user-456',
      );
    });

    it('should delete current DJ if userId is null', async () => {
      mockRedisClient.hdel.mockResolvedValue(1);

      await service.setCurrentDj('room-123', null);

      expect(mockRedisClient.hdel).toHaveBeenCalledWith('room:room-123:state', 'currentDjId');
    });
  });

  describe('getCurrentDj', () => {
    it('should get current DJ from Redis', async () => {
      mockRedisClient.hget.mockResolvedValue('user-456');

      const result = await service.getCurrentDj('room-123');

      expect(mockRedisClient.hget).toHaveBeenCalledWith('room:room-123:state', 'currentDjId');
      expect(result).toBe('user-456');
    });
  });

  describe('setPlaybackState', () => {
    it('should set playback state in Redis', async () => {
      mockRedisClient.hmset.mockResolvedValue('OK');

      await service.setPlaybackState('room-123', 'playing', 'track-456', 100);

      expect(mockRedisClient.hmset).toHaveBeenCalledWith(
        'room:room-123:state',
        expect.objectContaining({
          playbackState: 'playing',
          trackId: 'track-456',
          position: '100',
        }),
      );
    });

    it('should set playback state without optional parameters', async () => {
      mockRedisClient.hmset.mockResolvedValue('OK');

      await service.setPlaybackState('room-123', 'stopped');

      expect(mockRedisClient.hmset).toHaveBeenCalledWith(
        'room:room-123:state',
        expect.objectContaining({
          playbackState: 'stopped',
        }),
      );
    });
  });

  describe('getPlaybackState', () => {
    it('should get playback state from Redis', async () => {
      const mockState = {
        playbackState: 'playing',
        trackId: 'track-456',
        position: '100',
        lastUpdate: '1234567890',
      };

      mockRedisClient.hgetall.mockResolvedValue(mockState);

      const result = await service.getPlaybackState('room-123');

      expect(result).toEqual({
        playbackState: 'playing',
        trackId: 'track-456',
        position: 100,
        lastUpdate: 1234567890,
      });
    });

    it('should return null values for missing state', async () => {
      mockRedisClient.hgetall.mockResolvedValue({});

      const result = await service.getPlaybackState('room-123');

      expect(result).toEqual({
        playbackState: null,
        trackId: null,
        position: null,
        lastUpdate: null,
      });
    });
  });

  describe('room-socket membership tracking', () => {
    describe('addSocketToRoom', () => {
      it('should add socket to room set in Redis', async () => {
        mockRedisClient.sadd.mockResolvedValue(1);

        await service.addSocketToRoom('room-123', 'socket-abc');

        expect(mockRedisClient.sadd).toHaveBeenCalledWith(
          'room:room-123:sockets',
          'socket-abc',
        );
      });
    });

    describe('removeSocketFromRoom', () => {
      it('should remove socket from room set in Redis', async () => {
        mockRedisClient.srem.mockResolvedValue(1);

        await service.removeSocketFromRoom('room-123', 'socket-abc');

        expect(mockRedisClient.srem).toHaveBeenCalledWith(
          'room:room-123:sockets',
          'socket-abc',
        );
      });
    });

    describe('getSocketsInRoom', () => {
      it('should get all sockets in a room', async () => {
        const mockSockets = ['socket-abc', 'socket-def', 'socket-ghi'];
        mockRedisClient.smembers.mockResolvedValue(mockSockets);

        const result = await service.getSocketsInRoom('room-123');

        expect(mockRedisClient.smembers).toHaveBeenCalledWith('room:room-123:sockets');
        expect(result).toEqual(mockSockets);
      });

      it('should return empty array when room has no sockets', async () => {
        mockRedisClient.smembers.mockResolvedValue([]);

        const result = await service.getSocketsInRoom('room-123');

        expect(result).toEqual([]);
      });
    });
  });

  describe('getMaxRttForRoom', () => {
    it('should return default RTT (50ms) when room has no sockets', async () => {
      mockRedisClient.smembers.mockResolvedValue([]);

      const result = await service.getMaxRttForRoom('room-123');

      expect(mockRedisClient.smembers).toHaveBeenCalledWith('room:room-123:sockets');
      expect(result).toBe(50);
    });

    it('should return maximum RTT value from sockets in specific room', async () => {
      const mockSockets = ['socket-abc', 'socket-def', 'socket-ghi'];
      mockRedisClient.smembers.mockResolvedValue(mockSockets);
      mockRedisClient.get
        .mockResolvedValueOnce('45')
        .mockResolvedValueOnce('120')
        .mockResolvedValueOnce('80');

      const result = await service.getMaxRttForRoom('room-123');

      expect(mockRedisClient.smembers).toHaveBeenCalledWith('room:room-123:sockets');
      expect(mockRedisClient.get).toHaveBeenCalledWith('socket:socket-abc:user.lastRtt');
      expect(mockRedisClient.get).toHaveBeenCalledWith('socket:socket-def:user.lastRtt');
      expect(mockRedisClient.get).toHaveBeenCalledWith('socket:socket-ghi:user.lastRtt');
      expect(result).toBe(120);
    });

    it('should handle null RTT values by using default (50ms)', async () => {
      const mockSockets = ['socket-abc', 'socket-def'];
      mockRedisClient.smembers.mockResolvedValue(mockSockets);
      mockRedisClient.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('75');

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBe(75);
    });

    it('should return default RTT (50ms) when all values are null', async () => {
      const mockSockets = ['socket-abc', 'socket-def'];
      mockRedisClient.smembers.mockResolvedValue(mockSockets);
      mockRedisClient.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBe(50);
    });

    it('should return maximum RTT even when some values are below default', async () => {
      const mockSockets = ['socket-abc', 'socket-def', 'socket-ghi'];
      mockRedisClient.smembers.mockResolvedValue(mockSockets);
      mockRedisClient.get
        .mockResolvedValueOnce('20')
        .mockResolvedValueOnce('30')
        .mockResolvedValueOnce('25');

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBe(30);
    });

    it('should handle single socket RTT', async () => {
      const mockSockets = ['socket-abc'];
      mockRedisClient.smembers.mockResolvedValue(mockSockets);
      mockRedisClient.get.mockResolvedValueOnce('95');

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBe(95);
    });

    it('should isolate RTT calculations per room (not query all sockets)', async () => {
      // Room 1 has sockets with high RTT
      const room1Sockets = ['socket-abc', 'socket-def'];
      mockRedisClient.smembers.mockResolvedValueOnce(room1Sockets);
      mockRedisClient.get
        .mockResolvedValueOnce('200')
        .mockResolvedValueOnce('250');

      const room1Result = await service.getMaxRttForRoom('room-123');
      expect(room1Result).toBe(250);

      // Room 2 has sockets with low RTT
      const room2Sockets = ['socket-xyz', 'socket-uvw'];
      mockRedisClient.smembers.mockResolvedValueOnce(room2Sockets);
      mockRedisClient.get
        .mockResolvedValueOnce('30')
        .mockResolvedValueOnce('40');

      const room2Result = await service.getMaxRttForRoom('room-456');
      expect(room2Result).toBe(40);

      // Verify correct room keys were queried
      expect(mockRedisClient.smembers).toHaveBeenCalledWith('room:room-123:sockets');
      expect(mockRedisClient.smembers).toHaveBeenCalledWith('room:room-456:sockets');
      expect(mockRedisClient.smembers).toHaveBeenCalledTimes(2);
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit Redis connection on module destroy', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
