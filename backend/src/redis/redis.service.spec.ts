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
      set: jest.fn(),
      get: jest.fn(),
      keys: jest.fn(),
      expire: jest.fn(),
      multi: jest.fn(),
      smembers: jest.fn(),
      mget: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
    } as any;

    // Mock multi() to return a chainable object
    const mockMulti = {
      set: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    mockRedisClient.multi.mockReturnValue(mockMulti as any);

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
        startAtServerTime: null,
        trackDuration: null,
        syncBuffer: null,
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
        startAtServerTime: null,
        trackDuration: null,
        syncBuffer: null,
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

  describe('setSocketSyncState', () => {
    it('should set clock offset and RTT in Redis', async () => {
      const mockMulti = {
        set: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedisClient.multi.mockReturnValue(mockMulti as any);

      await service.setSocketSyncState('socket-123', 50, 100);

      expect(mockRedisClient.multi).toHaveBeenCalled();
      expect(mockMulti.set).toHaveBeenCalledWith('socket:socket-123:sync.clockOffset', '50');
      expect(mockMulti.set).toHaveBeenCalledWith('socket:socket-123:sync.lastRtt', '100');
      expect(mockMulti.expire).toHaveBeenCalledWith('socket:socket-123:sync.clockOffset', 300);
      expect(mockMulti.expire).toHaveBeenCalledWith('socket:socket-123:sync.lastRtt', 300);
      expect(mockMulti.exec).toHaveBeenCalled();
    });

    it('should handle negative offset', async () => {
      const mockMulti = {
        set: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedisClient.multi.mockReturnValue(mockMulti as any);

      await service.setSocketSyncState('socket-123', -75, 50);

      expect(mockMulti.set).toHaveBeenCalledWith('socket:socket-123:sync.clockOffset', '-75');
      expect(mockMulti.set).toHaveBeenCalledWith('socket:socket-123:sync.lastRtt', '50');
    });

    it('should handle floating point values', async () => {
      const mockMulti = {
        set: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedisClient.multi.mockReturnValue(mockMulti as any);

      await service.setSocketSyncState('socket-123', 50.5, 100.25);

      expect(mockMulti.set).toHaveBeenCalledWith('socket:socket-123:sync.clockOffset', '50.5');
      expect(mockMulti.set).toHaveBeenCalledWith('socket:socket-123:sync.lastRtt', '100.25');
    });
  });

  describe('getSocketSyncState', () => {
    it('should get clock offset and RTT from Redis', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce('50')
        .mockResolvedValueOnce('100');

      const result = await service.getSocketSyncState('socket-123');

      expect(mockRedisClient.get).toHaveBeenCalledWith('socket:socket-123:sync.clockOffset');
      expect(mockRedisClient.get).toHaveBeenCalledWith('socket:socket-123:sync.lastRtt');
      expect(result).toEqual({
        clockOffset: 50,
        lastRtt: 100,
      });
    });

    it('should return null for non-existent sync state', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.getSocketSyncState('socket-123');

      expect(result).toEqual({
        clockOffset: null,
        lastRtt: null,
      });
    });

    it('should handle negative offset', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce('-75')
        .mockResolvedValueOnce('50');

      const result = await service.getSocketSyncState('socket-123');

      expect(result).toEqual({
        clockOffset: -75,
        lastRtt: 50,
      });
    });

    it('should handle floating point values', async () => {
      mockRedisClient.get
        .mockResolvedValueOnce('50.5')
        .mockResolvedValueOnce('100.25');

      const result = await service.getSocketSyncState('socket-123');

      expect(result).toEqual({
        clockOffset: 50.5,
        lastRtt: 100.25,
      });
    });
  });

  describe('addSocketToRoom', () => {
    it('should add socket to room membership set', async () => {
      mockRedisClient.sadd.mockResolvedValue(1);

      await service.addSocketToRoom('room-123', 'socket-456');

      expect(mockRedisClient.sadd).toHaveBeenCalledWith('room:room-123:sockets', 'socket-456');
    });
  });

  describe('removeSocketFromRoom', () => {
    it('should remove socket from room membership set', async () => {
      mockRedisClient.srem.mockResolvedValue(1);

      await service.removeSocketFromRoom('room-123', 'socket-456');

      expect(mockRedisClient.srem).toHaveBeenCalledWith('room:room-123:sockets', 'socket-456');
    });
  });

  describe('getMaxRttForRoom', () => {
    it('should return max RTT from all sockets in room', async () => {
      mockRedisClient.smembers.mockResolvedValue([
        'socket-1',
        'socket-2',
        'socket-3',
      ]);

      mockRedisClient.mget.mockResolvedValue(['50', '150', '100']);

      const result = await service.getMaxRttForRoom('room-123');

      expect(mockRedisClient.smembers).toHaveBeenCalledWith('room:room-123:sockets');
      expect(mockRedisClient.mget).toHaveBeenCalledWith(
        'socket:socket-1:sync.lastRtt',
        'socket:socket-2:sync.lastRtt',
        'socket:socket-3:sync.lastRtt',
      );
      expect(result).toBe(150);
    });

    it('should return null if no sockets in room', async () => {
      mockRedisClient.smembers.mockResolvedValue([]);

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBeNull();
    });

    it('should return null if all RTTs are zero', async () => {
      mockRedisClient.smembers.mockResolvedValue(['socket-1', 'socket-2']);
      mockRedisClient.mget.mockResolvedValue(['0', '0']);

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBeNull();
    });

    it('should handle null values from Redis', async () => {
      mockRedisClient.smembers.mockResolvedValue(['socket-1', 'socket-2']);
      mockRedisClient.mget.mockResolvedValue(['100', null]);

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBe(100);
    });

    it('should handle floating point RTT values', async () => {
      mockRedisClient.smembers.mockResolvedValue(['socket-1', 'socket-2']);
      mockRedisClient.mget.mockResolvedValue(['50.5', '100.75']);

      const result = await service.getMaxRttForRoom('room-123');

      expect(result).toBe(100.75);
    });
  });
});
