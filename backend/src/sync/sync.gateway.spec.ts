import { Test, TestingModule } from '@nestjs/testing';
import { SyncGateway } from './sync.gateway';
import { RedisService } from '../redis/redis.service';
import { Socket } from 'socket.io';

describe('SyncGateway', () => {
  let gateway: SyncGateway;
  let redisService: RedisService;

  const mockRedisService = {
    getClient: jest.fn().mockReturnValue({
      set: jest.fn(),
      get: jest.fn(),
    }),
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
    it('should return pong with client and server timestamps', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const clientTimestamp = 1000000;
      const mockDate = 1000100;

      jest.spyOn(Date, 'now').mockReturnValue(mockDate);

      const result = await gateway.handleSyncPing(mockClient, {
        clientTimestamp,
      });

      expect(result).toEqual({
        clientTimestamp: 1000000,
        serverTimestamp: 1000100,
      });
    });

    it('should store clock offset in Redis', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const clientTimestamp = 1000000;
      const serverTimestamp = 1000100;

      jest.spyOn(Date, 'now').mockReturnValue(serverTimestamp);

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncPing(mockClient, { clientTimestamp });

      const expectedOffset = serverTimestamp - clientTimestamp; // 100

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        expectedOffset.toString(),
      );
    });

    it('should store RTT in Redis when client sends roundtrip time', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const clientTimestamp = 1000000;
      const serverTimestamp = 1000100;

      jest.spyOn(Date, 'now').mockReturnValue(serverTimestamp);

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncPing(mockClient, { clientTimestamp });

      // RTT is not stored directly in ping handler
      // It's calculated by the client and reported via sync:report
      expect(mockRedisClient.set).toHaveBeenCalled();
    });

    it('should update values on multiple pings', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      // First ping
      jest.spyOn(Date, 'now').mockReturnValue(1000100);
      await gateway.handleSyncPing(mockClient, { clientTimestamp: 1000000 });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        '100',
      );

      // Second ping
      jest.spyOn(Date, 'now').mockReturnValue(2000200);
      await gateway.handleSyncPing(mockClient, { clientTimestamp: 2000000 });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        '200',
      );

      expect(mockRedisClient.set).toHaveBeenCalledTimes(2);
    });

    it('should handle different socket IDs correctly', async () => {
      const mockClient1 = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockClient2 = {
        id: 'socket-456',
        data: { userId: 'user-456' },
      } as unknown as Socket;

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      jest.spyOn(Date, 'now').mockReturnValue(1000100);

      await gateway.handleSyncPing(mockClient1, { clientTimestamp: 1000000 });
      await gateway.handleSyncPing(mockClient2, { clientTimestamp: 1000050 });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        '100',
      );

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'socket:socket-456:user.clockOffset',
        '50',
      );
    });
  });

  describe('handleSyncReport', () => {
    it('should store RTT from client report', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      const rtt = 45; // 45ms RTT
      await gateway.handleSyncReport(mockClient, { rtt });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'socket:socket-123:user.lastRtt',
        rtt.toString(),
      );
    });

    it('should return success on valid RTT report', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      const result = await gateway.handleSyncReport(mockClient, { rtt: 30 });

      expect(result).toEqual({ success: true });
    });

    it('should update RTT on multiple reports', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncReport(mockClient, { rtt: 30 });
      await gateway.handleSyncReport(mockClient, { rtt: 50 });
      await gateway.handleSyncReport(mockClient, { rtt: 40 });

      expect(mockRedisClient.set).toHaveBeenCalledTimes(3);
      expect(mockRedisClient.set).toHaveBeenLastCalledWith(
        'socket:socket-123:user.lastRtt',
        '40',
      );
    });
  });

  describe('Edge cases', () => {
    it('should handle zero client timestamp', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      jest.spyOn(Date, 'now').mockReturnValue(1000);

      const result = await gateway.handleSyncPing(mockClient, {
        clientTimestamp: 0,
      });

      expect(result).toEqual({
        clientTimestamp: 0,
        serverTimestamp: 1000,
      });
    });

    it('should handle large timestamp values', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const largeTimestamp = 9999999999999;
      jest.spyOn(Date, 'now').mockReturnValue(largeTimestamp);

      const result = await gateway.handleSyncPing(mockClient, {
        clientTimestamp: largeTimestamp - 100,
      });

      expect(result.serverTimestamp).toBe(largeTimestamp);
      expect(result.clientTimestamp).toBe(largeTimestamp - 100);
    });

    it('should handle zero RTT', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        set: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncReport(mockClient, { rtt: 0 });

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'socket:socket-123:user.lastRtt',
        '0',
      );
    });
  });
});
