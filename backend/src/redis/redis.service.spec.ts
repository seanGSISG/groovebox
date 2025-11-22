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

  describe('onModuleDestroy', () => {
    it('should quit Redis connection on module destroy', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });
});
