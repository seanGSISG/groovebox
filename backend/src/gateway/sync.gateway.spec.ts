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
      expect(result).toHaveProperty('serverReceiveTime');
      expect(result).toHaveProperty('serverTimestamp');
      expect(result).toHaveProperty('serverProcessTime');
      expect(typeof result.serverReceiveTime).toBe('number');
      expect(typeof result.serverTimestamp).toBe('number');
      expect(result.serverTimestamp).toBeGreaterThanOrEqual(result.serverReceiveTime);
      expect(result.serverReceiveTime).toBeGreaterThanOrEqual(clientTimestamp - 1000);
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
        expect(result).toHaveProperty('serverReceiveTime');
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

    it('should accept offset at upper boundary', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = 3600000; // Exactly 1 hour
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

    it('should accept offset at lower boundary', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = -3600000; // Exactly -1 hour
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

    it('should accept RTT at upper boundary', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offset = 50;
      const rtt = 10000; // Exactly 10 seconds

      mockRedisService.setSocketSyncState.mockResolvedValue(undefined);

      const result = await gateway.handleSyncUpdate(mockClient, { offset, rtt });

      expect(result).toEqual({ success: true, offset, rtt });
      expect(mockRedisService.setSocketSyncState).toHaveBeenCalledWith(
        'socket-123',
        offset,
        rtt,
      );
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
    it('should provide all required timestamps for NTP calculations', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      // T1: Client sends timestamp
      const t1 = Date.now();

      // Server processes sync:ping
      const response = await gateway.handleSyncPing(mockClient, { clientTimestamp: t1 });

      // Verify response contains all required timestamps
      expect(response).toHaveProperty('clientTimestamp', t1);
      expect(response).toHaveProperty('serverReceiveTime');
      expect(response).toHaveProperty('serverTimestamp');
      expect(response).toHaveProperty('serverProcessTime');

      // Extract timestamps
      const t2 = response.serverReceiveTime;  // T2: Server receive time
      const t3 = response.serverTimestamp;     // T3: Server send time

      // Verify timestamp ordering: T1 <= T2 <= T3
      expect(t2).toBeGreaterThanOrEqual(t1 - 10); // Allow 10ms clock skew
      expect(t3).toBeGreaterThanOrEqual(t2);

      // Verify serverProcessTime matches T3 - T2
      expect(response.serverProcessTime).toBe(t3 - t2);
    });

    it('should verify NTP offset and RTT calculations are correct', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      // T1: Client timestamp when request sent
      const t1 = Date.now();

      // Server processes sync:ping
      const response = await gateway.handleSyncPing(mockClient, { clientTimestamp: t1 });

      // T2: Server time when request received
      const t2 = response.serverReceiveTime;

      // T3: Server time when response sent
      const t3 = response.serverTimestamp;

      // T4: Client time when response received (simulated)
      const t4 = Date.now();

      // Calculate RTT using NTP formula: RTT = (T4 - T1) - (T3 - T2)
      const rtt = (t4 - t1) - (t3 - t2);

      // Calculate offset using NTP formula: offset = ((T2 - T1) + (T3 - T4)) / 2
      const offset = ((t2 - t1) + (t3 - t4)) / 2;

      // Verify RTT is reasonable (should be close to 0 in unit tests)
      expect(rtt).toBeGreaterThanOrEqual(0);
      expect(rtt).toBeLessThan(100); // Should be < 100ms in local tests

      // Verify offset is reasonable (should be close to 0 in unit tests)
      expect(Math.abs(offset)).toBeLessThan(100); // Should be < 100ms in local tests

      // Verify the math is correct
      const serverProcessTime = t3 - t2;
      expect(serverProcessTime).toBe(response.serverProcessTime);
    });

    it('should calculate consistent offset across multiple pings', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123', username: 'testuser' },
      } as unknown as Socket;

      const offsets: number[] = [];
      const rtts: number[] = [];

      // Perform 5 sync pings and calculate offset/RTT for each
      for (let i = 0; i < 5; i++) {
        const t1 = Date.now();
        const response = await gateway.handleSyncPing(mockClient, { clientTimestamp: t1 });
        const t2 = response.serverReceiveTime;
        const t3 = response.serverTimestamp;
        const t4 = Date.now();

        const rtt = (t4 - t1) - (t3 - t2);
        const offset = ((t2 - t1) + (t3 - t4)) / 2;

        offsets.push(offset);
        rtts.push(rtt);

        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Verify all offsets are reasonably close to each other
      const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
      offsets.forEach((offset) => {
        expect(Math.abs(offset - avgOffset)).toBeLessThan(50); // Within 50ms of average
      });

      // Verify all RTTs are non-negative
      rtts.forEach((rtt) => {
        expect(rtt).toBeGreaterThanOrEqual(0);
      });
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
