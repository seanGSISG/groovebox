import { Test, TestingModule } from '@nestjs/testing';
import { PlaybackSyncService } from './playback-sync.service';
import { RedisService } from '../../redis/redis.service';
import { RoomGateway } from '../room.gateway';
import { Server } from 'socket.io';

describe('PlaybackSyncService', () => {
  let service: PlaybackSyncService;
  let redisService: jest.Mocked<RedisService>;
  let roomGateway: jest.Mocked<RoomGateway>;
  let mockServer: jest.Mocked<Server>;

  beforeEach(async () => {
    // Create mock server
    mockServer = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as any;

    // Create mock Redis client
    const mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      sadd: jest.fn(),
      srem: jest.fn(),
      smembers: jest.fn(),
      hset: jest.fn(),
      hget: jest.fn(),
      hgetall: jest.fn(),
      hdel: jest.fn(),
      del: jest.fn(),
      hmset: jest.fn(),
      quit: jest.fn(),
    };

    // Create mock RedisService
    const mockRedisService = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
      addSocketToRoom: jest.fn(),
      removeSocketFromRoom: jest.fn(),
      getSocketsInRoom: jest.fn(),
      getMaxRttForRoom: jest.fn(),
      setRoomState: jest.fn(),
      getRoomState: jest.fn(),
      getAllRoomState: jest.fn(),
      deleteRoomState: jest.fn(),
      setCurrentDj: jest.fn(),
      getCurrentDj: jest.fn(),
      setPlaybackState: jest.fn(),
      getPlaybackState: jest.fn(),
    };

    // Create mock RoomGateway
    const mockRoomGateway = {
      server: mockServer,
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaybackSyncService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: RoomGateway,
          useValue: mockRoomGateway,
        },
      ],
    }).compile();

    service = module.get<PlaybackSyncService>(PlaybackSyncService);
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
    roomGateway = module.get(RoomGateway) as jest.Mocked<RoomGateway>;
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('startSyncBroadcast', () => {
    it('should start interval for room', () => {
      jest.useFakeTimers();
      const roomId = 'room-123';

      service.startSyncBroadcast(roomId);

      // Verify interval was created (check internal state indirectly)
      expect(service['intervals'].has(roomId)).toBe(true);

      jest.useRealTimers();
    });

    it('should not create duplicate intervals for same room', () => {
      jest.useFakeTimers();
      const roomId = 'room-123';

      service.startSyncBroadcast(roomId);
      const firstInterval = service['intervals'].get(roomId);

      service.startSyncBroadcast(roomId);
      const secondInterval = service['intervals'].get(roomId);

      expect(firstInterval).toBe(secondInterval);
      expect(service['intervals'].size).toBe(1);

      jest.useRealTimers();
    });

    it('should broadcast sync message every 10 seconds', async () => {
      jest.useFakeTimers();
      const roomId = 'room-123';
      const mockPlaybackState = {
        playing: true,
        trackId: 'track-456',
        startAtServerTime: 1000,
        startedAt: 1000,
      };

      redisService.getClient().get.mockResolvedValue(JSON.stringify(mockPlaybackState));

      service.startSyncBroadcast(roomId);

      // Fast-forward 10 seconds
      await jest.advanceTimersByTimeAsync(10000);

      // Verify broadcast was called
      expect(redisService.getClient().get).toHaveBeenCalledWith(
        `room:${roomId}:state.playback`,
      );
      expect(mockServer.to).toHaveBeenCalledWith(roomId);
      expect(mockServer.emit).toHaveBeenCalledWith(
        'playback:sync',
        expect.objectContaining({
          roomId,
          trackId: 'track-456',
          serverTimestamp: expect.any(Number),
          theoreticalPosition: expect.any(Number),
        }),
      );

      jest.useRealTimers();
    });

    it('should broadcast sync multiple times over 30 seconds', async () => {
      jest.useFakeTimers();
      const roomId = 'room-123';
      const mockPlaybackState = {
        playing: true,
        trackId: 'track-456',
        startAtServerTime: 1000,
        startedAt: 1000,
      };

      redisService.getClient().get.mockResolvedValue(JSON.stringify(mockPlaybackState));

      service.startSyncBroadcast(roomId);

      // Fast-forward 30 seconds (should trigger 3 broadcasts)
      await jest.advanceTimersByTimeAsync(30000);

      // Verify broadcast was called 3 times
      expect(mockServer.emit).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });
  });

  describe('stopSyncBroadcast', () => {
    it('should stop interval for room', () => {
      jest.useFakeTimers();
      const roomId = 'room-123';

      service.startSyncBroadcast(roomId);
      expect(service['intervals'].has(roomId)).toBe(true);

      service.stopSyncBroadcast(roomId);
      expect(service['intervals'].has(roomId)).toBe(false);

      jest.useRealTimers();
    });

    it('should not throw error when stopping non-existent interval', () => {
      const roomId = 'room-nonexistent';

      expect(() => service.stopSyncBroadcast(roomId)).not.toThrow();
    });

    it('should stop broadcasting after stopSyncBroadcast is called', async () => {
      jest.useFakeTimers();
      const roomId = 'room-123';
      const mockPlaybackState = {
        playing: true,
        trackId: 'track-456',
        startAtServerTime: 1000,
        startedAt: 1000,
      };

      redisService.getClient().get.mockResolvedValue(JSON.stringify(mockPlaybackState));

      service.startSyncBroadcast(roomId);

      // Fast-forward 10 seconds (1 broadcast)
      await jest.advanceTimersByTimeAsync(10000);
      expect(mockServer.emit).toHaveBeenCalledTimes(1);

      // Stop sync
      service.stopSyncBroadcast(roomId);

      // Fast-forward another 20 seconds
      await jest.advanceTimersByTimeAsync(20000);

      // Should still be only 1 broadcast (no new ones)
      expect(mockServer.emit).toHaveBeenCalledTimes(1);

      jest.useRealTimers();
    });
  });

  describe('broadcastSync (private method behavior)', () => {
    it('should calculate correct theoretical position', async () => {
      jest.useFakeTimers();
      const roomId = 'room-123';
      const startedAt = Date.now();
      const mockPlaybackState = {
        playing: true,
        trackId: 'track-456',
        startAtServerTime: startedAt + 100,
        startedAt,
      };

      redisService.getClient().get.mockResolvedValue(JSON.stringify(mockPlaybackState));

      service.startSyncBroadcast(roomId);

      // Fast-forward 10 seconds
      await jest.advanceTimersByTimeAsync(10000);

      // Theoretical position should be approximately 10000ms (elapsed time)
      expect(mockServer.emit).toHaveBeenCalledWith(
        'playback:sync',
        expect.objectContaining({
          theoreticalPosition: 10000,
        }),
      );

      jest.useRealTimers();
    });

    it('should not broadcast if no playback state in Redis', async () => {
      jest.useFakeTimers();
      const roomId = 'room-123';

      redisService.getClient().get.mockResolvedValue(null);

      service.startSyncBroadcast(roomId);

      // Fast-forward 10 seconds
      await jest.advanceTimersByTimeAsync(10000);

      // Should not emit anything
      expect(mockServer.emit).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should stop sync broadcast if playback is not playing', async () => {
      jest.useFakeTimers();
      const roomId = 'room-123';
      const mockPlaybackState = {
        playing: false,
        trackId: 'track-456',
        startAtServerTime: 1000,
        startedAt: 1000,
      };

      redisService.getClient().get.mockResolvedValue(JSON.stringify(mockPlaybackState));

      service.startSyncBroadcast(roomId);

      // Fast-forward 10 seconds
      await jest.advanceTimersByTimeAsync(10000);

      // Should not emit since playing is false
      expect(mockServer.emit).not.toHaveBeenCalled();

      // Interval should be stopped
      expect(service['intervals'].has(roomId)).toBe(false);

      jest.useRealTimers();
    });

    it('should handle multiple rooms simultaneously', async () => {
      jest.useFakeTimers();
      const roomId1 = 'room-123';
      const roomId2 = 'room-456';
      const mockPlaybackState1 = {
        playing: true,
        trackId: 'track-1',
        startAtServerTime: 1000,
        startedAt: 1000,
      };
      const mockPlaybackState2 = {
        playing: true,
        trackId: 'track-2',
        startAtServerTime: 2000,
        startedAt: 2000,
      };

      redisService.getClient().get.mockImplementation((key: string) => {
        if (key === `room:${roomId1}:state.playback`) {
          return Promise.resolve(JSON.stringify(mockPlaybackState1));
        }
        if (key === `room:${roomId2}:state.playback`) {
          return Promise.resolve(JSON.stringify(mockPlaybackState2));
        }
        return Promise.resolve(null);
      });

      service.startSyncBroadcast(roomId1);
      service.startSyncBroadcast(roomId2);

      // Fast-forward 10 seconds
      await jest.advanceTimersByTimeAsync(10000);

      // Both rooms should have broadcasted
      expect(mockServer.to).toHaveBeenCalledWith(roomId1);
      expect(mockServer.to).toHaveBeenCalledWith(roomId2);
      expect(mockServer.emit).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all intervals on module destroy', () => {
      jest.useFakeTimers();
      const roomId1 = 'room-123';
      const roomId2 = 'room-456';

      service.startSyncBroadcast(roomId1);
      service.startSyncBroadcast(roomId2);

      expect(service['intervals'].size).toBe(2);

      service.onModuleDestroy();

      expect(service['intervals'].size).toBe(0);

      jest.useRealTimers();
    });

    it('should not throw error when destroying with no active intervals', () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  describe('SYNC_INTERVAL_MS constant', () => {
    it('should be set to 10000ms (10 seconds)', () => {
      expect(service['SYNC_INTERVAL_MS']).toBe(10000);
    });
  });
});
