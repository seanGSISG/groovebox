import { Test, TestingModule } from '@nestjs/testing';
import { SyncGateway } from './sync.gateway';
import { RedisService } from '../redis/redis.service';
import { Socket } from 'socket.io';

describe('SyncGateway', () => {
  let gateway: SyncGateway;
  let redisService: RedisService;

  const mockRedisService = {
    setSocketSyncState: jest.fn(),
    getSocketSyncState: jest.fn(),
    getMaxRttForRoom: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncGateway,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    gateway = module.get<SyncGateway>(SyncGateway);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSyncPing', () => {
    it('should return server timestamp for valid client timestamp', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const clientTimestamp = Date.now();
      const result = await gateway.handleSyncPing(mockClient, { clientTimestamp });

      expect(result).toHaveProperty('clientTimestamp', clientTimestamp);
      expect(result).toHaveProperty('serverTimestamp');
      expect(result).toHaveProperty('serverProcessTime');
      expect(typeof result.serverTimestamp).toBe('number');
      expect(result.serverTimestamp).toBeGreaterThanOrEqual(clientTimestamp - 1000);
    });

    it('should reject timestamp too far in the past', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      // Timestamp 2 hours in the past
      const clientTimestamp = Date.now() - 7200000;
      const result = await gateway.handleSyncPing(mockClient, { clientTimestamp });

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Client timestamp is unreasonable');
      expect(result).toHaveProperty('serverTimestamp');
    });

    it('should reject timestamp too far in the future', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      // Timestamp 2 hours in the future
      const clientTimestamp = Date.now() + 7200000;
      const result = await gateway.handleSyncPing(mockClient, { clientTimestamp });

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Client timestamp is unreasonable');
    });

    it('should handle multiple ping requests', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const results = [];
      for (let i = 0; i < 5; i++) {
        const clientTimestamp = Date.now();
        const result = await gateway.handleSyncPing(mockClient, { clientTimestamp });
        results.push(result);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result).toHaveProperty('serverTimestamp');
        expect(result).not.toHaveProperty('error');
      });
    });

    it('should return reasonable server process time', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const clientTimestamp = Date.now();
      const result = await gateway.handleSyncPing(mockClient, { clientTimestamp });

      expect(result.serverProcessTime).toBeDefined();
      expect(result.serverProcessTime).toBeGreaterThanOrEqual(0);
      expect(result.serverProcessTime).toBeLessThan(100); // Should be < 100ms
    });
  });

  describe('handleSyncUpdate', () => {
    it('should store valid offset and RTT', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = 50; // 50ms clock offset
      const rtt = 100; // 100ms round-trip time

      mockRedisService.setSocketSyncState.mockResolvedValue(undefined);

      const result = await gateway.handleSyncUpdate(mockClient, { offset, rtt });

      expect(result).toEqual({ success: true, offset, rtt });
      expect(mockRedisService.setSocketSyncState).toHaveBeenCalledWith(
        'socket-123',
        offset,
        rtt,
      );
    });

    it('should store negative offset', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = -75; // Client is ahead
      const rtt = 50;

      mockRedisService.setSocketSyncState.mockResolvedValue(undefined);

      const result = await gateway.handleSyncUpdate(mockClient, { offset, rtt });

      expect(result).toEqual({ success: true, offset, rtt });
      expect(mockRedisService.setSocketSyncState).toHaveBeenCalledWith(
        'socket-123',
        offset,
        rtt,
      );
    });

    it('should reject unreasonable offset', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = 4000000; // 1+ hour offset
      const rtt = 50;

      const result = await gateway.handleSyncUpdate(mockClient, { offset, rtt });

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Offset is unreasonable');
      expect(mockRedisService.setSocketSyncState).not.toHaveBeenCalled();
    });

    it('should reject negative RTT', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = 50;
      const rtt = -10;

      const result = await gateway.handleSyncUpdate(mockClient, { offset, rtt });

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('RTT is unreasonable');
      expect(mockRedisService.setSocketSyncState).not.toHaveBeenCalled();
    });

    it('should reject excessive RTT', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = 50;
      const rtt = 15000; // 15 seconds

      const result = await gateway.handleSyncUpdate(mockClient, { offset, rtt });

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('RTT is unreasonable');
      expect(mockRedisService.setSocketSyncState).not.toHaveBeenCalled();
    });

    it('should handle multiple updates from same client', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      mockRedisService.setSocketSyncState.mockResolvedValue(undefined);

      const updates = [
        { offset: 50, rtt: 100 },
        { offset: 48, rtt: 95 },
        { offset: 52, rtt: 105 },
      ];

      for (const update of updates) {
        const result = await gateway.handleSyncUpdate(mockClient, update);
        expect(result).toEqual({ success: true, ...update });
      }

      expect(mockRedisService.setSocketSyncState).toHaveBeenCalledTimes(3);
    });

    it('should handle zero offset and RTT', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = 0;
      const rtt = 0;

      mockRedisService.setSocketSyncState.mockResolvedValue(undefined);

      const result = await gateway.handleSyncUpdate(mockClient, { offset, rtt });

      expect(result).toEqual({ success: true, offset, rtt });
      expect(mockRedisService.setSocketSyncState).toHaveBeenCalledWith(
        'socket-123',
        offset,
        rtt,
      );
    });
  });

  describe('NTP algorithm calculations', () => {
    it('should provide timestamps for client-side NTP calculations', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      // T1: Client sends timestamp
      const t1 = Date.now();

      // Server processes sync:ping
      const response = await gateway.handleSyncPing(mockClient, { clientTimestamp: t1 });

      // T2 would be recorded on server (implicit in response.serverTimestamp)
      // T3 is in response.serverTimestamp
      const t3 = response.serverTimestamp;

      // T4: Client would receive at this time (simulated)
      const t4 = Date.now();

      // Verify we can calculate RTT and offset with the response
      // RTT = (T4 - T1) - (T3 - T2)
      // For this test, we approximate T2 ≈ T3 (minimal server processing)
      const approximateRtt = t4 - t1;

      // offset = ((T2 - T1) + (T3 - T4)) / 2
      // This would be calculated on client side

      expect(response.clientTimestamp).toBe(t1);
      expect(t3).toBeGreaterThanOrEqual(t1);
      expect(t3).toBeLessThanOrEqual(t4);
      expect(approximateRtt).toBeGreaterThanOrEqual(0);
    });

    it('should handle high-precision timestamps', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      // Use current time with high precision
      const clientTimestamp = Date.now() + 0.456;
      const result = await gateway.handleSyncPing(mockClient, { clientTimestamp });

      expect(result.clientTimestamp).toBe(clientTimestamp);
      expect(Number.isFinite(result.serverTimestamp)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle Redis errors gracefully in sync update', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      mockRedisService.setSocketSyncState.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      const result = await gateway.handleSyncUpdate(mockClient, { offset: 50, rtt: 100 });

      expect(result).toHaveProperty('error');
      expect(result.error).toBe('Failed to update sync state');
    });
  });
});
