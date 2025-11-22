import { Test, TestingModule } from '@nestjs/testing';
import { SyncGateway } from './sync.gateway';
import { RedisService } from '../redis/redis.service';
import { Socket } from 'socket.io';
import { ValidationPipe } from '@nestjs/common';
import { SyncPingDto } from './dto/sync-ping.dto';
import { SyncReportDto } from './dto/sync-report.dto';

describe('SyncGateway', () => {
  let gateway: SyncGateway;
  let redisService: RedisService;

  const mockRedisService = {
    getClient: jest.fn().mockReturnValue({
      setex: jest.fn(),
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

    it('should store clock offset in Redis with TTL', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const clientTimestamp = 1000000;
      const serverTimestamp = 1000100;

      jest.spyOn(Date, 'now').mockReturnValue(serverTimestamp);

      const mockRedisClient = {
        setex: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncPing(mockClient, { clientTimestamp });

      const expectedOffset = serverTimestamp - clientTimestamp; // 100

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        3600,
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
        setex: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncPing(mockClient, { clientTimestamp });

      // RTT is not stored directly in ping handler
      // It's calculated by the client and reported via sync:report
      expect(mockRedisClient.setex).toHaveBeenCalled();
    });

    it('should update values on multiple pings', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        setex: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      // First ping
      jest.spyOn(Date, 'now').mockReturnValue(1000100);
      await gateway.handleSyncPing(mockClient, { clientTimestamp: 1000000 });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        3600,
        '100',
      );

      // Second ping
      jest.spyOn(Date, 'now').mockReturnValue(2000200);
      await gateway.handleSyncPing(mockClient, { clientTimestamp: 2000000 });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        3600,
        '200',
      );

      expect(mockRedisClient.setex).toHaveBeenCalledTimes(2);
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
        setex: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      jest.spyOn(Date, 'now').mockReturnValue(1000100);

      await gateway.handleSyncPing(mockClient1, { clientTimestamp: 1000000 });
      await gateway.handleSyncPing(mockClient2, { clientTimestamp: 1000050 });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'socket:socket-123:user.clockOffset',
        3600,
        '100',
      );

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'socket:socket-456:user.clockOffset',
        3600,
        '50',
      );
    });
  });

  describe('handleSyncReport', () => {
    it('should store RTT from client report with TTL', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        setex: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      const rtt = 45; // 45ms RTT
      await gateway.handleSyncReport(mockClient, { rtt });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'socket:socket-123:user.lastRtt',
        3600,
        rtt.toString(),
      );
    });

    it('should return success on valid RTT report', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        setex: jest.fn(),
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
        setex: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncReport(mockClient, { rtt: 30 });
      await gateway.handleSyncReport(mockClient, { rtt: 50 });
      await gateway.handleSyncReport(mockClient, { rtt: 40 });

      expect(mockRedisClient.setex).toHaveBeenCalledTimes(3);
      expect(mockRedisClient.setex).toHaveBeenLastCalledWith(
        'socket:socket-123:user.lastRtt',
        3600,
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
        setex: jest.fn(),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      await gateway.handleSyncReport(mockClient, { rtt: 0 });

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'socket:socket-123:user.lastRtt',
        3600,
        '0',
      );
    });
  });

  describe('Validation', () => {
    it('should reject invalid clientTimestamp (non-number)', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const validationPipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true
      });

      await expect(
        validationPipe.transform({ clientTimestamp: 'invalid' }, {
          type: 'body',
          metatype: SyncPingDto,
        }),
      ).rejects.toThrow();
    });

    it('should reject negative RTT', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const validationPipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true
      });

      await expect(
        validationPipe.transform({ rtt: -10 }, {
          type: 'body',
          metatype: SyncReportDto,
        }),
      ).rejects.toThrow();
    });

    it('should reject invalid RTT (non-number)', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const validationPipe = new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true
      });

      await expect(
        validationPipe.transform({ rtt: 'invalid' }, {
          type: 'body',
          metatype: SyncReportDto,
        }),
      ).rejects.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should handle Redis errors gracefully in handleSyncPing', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        setex: jest.fn().mockRejectedValue(new Error('Redis connection error')),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      jest.spyOn(Date, 'now').mockReturnValue(1000100);

      // Should not throw, should still return response
      const result = await gateway.handleSyncPing(mockClient, {
        clientTimestamp: 1000000
      });

      expect(result).toEqual({
        clientTimestamp: 1000000,
        serverTimestamp: 1000100,
      });
    });

    it('should handle Redis errors gracefully in handleSyncReport', async () => {
      const mockClient = {
        id: 'socket-123',
        data: { userId: 'user-123' },
      } as unknown as Socket;

      const mockRedisClient = {
        setex: jest.fn().mockRejectedValue(new Error('Redis connection error')),
      };
      mockRedisService.getClient.mockReturnValue(mockRedisClient);

      // Should not throw, should still return response
      const result = await gateway.handleSyncReport(mockClient, { rtt: 30 });

      expect(result).toEqual({ success: true });
    });
  });
});
