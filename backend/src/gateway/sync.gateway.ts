import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { WsJwtGuard } from './ws-jwt.guard';
import { SyncPingDto } from './dto/websocket-events.dto';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    username: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:19006', 'http://localhost:19000'],
    credentials: true,
  },
})
export class SyncGateway {
  private readonly logger = new Logger(SyncGateway.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Handle sync:ping events for NTP-like clock synchronization
   *
   * NTP Algorithm:
   * - Client sends T1 (client timestamp when request sent)
   * - Server receives and records T2 (server time when received)
   * - Server sends response with T2 and T3 (server time when sent)
   * - Client receives at T4 (client time when received)
   *
   * Client calculates:
   * - RTT = (T4 - T1) - (T3 - T2)
   * - offset = ((T2 - T1) + (T3 - T4)) / 2
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('sync:ping')
  async handleSyncPing(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SyncPingDto,
  ) {
    try {
      const { clientTimestamp } = data;

      // T2: Server time when request received
      const serverReceiveTime = Date.now();

      // Validate client timestamp is reasonable (not too far in past or future)
      const timeDiff = Math.abs(serverReceiveTime - clientTimestamp);
      const MAX_TIME_DIFF = 3600000; // 1 hour in milliseconds

      if (timeDiff > MAX_TIME_DIFF) {
        this.logger.warn(
          `Client ${client.id} sent timestamp too far off: ${timeDiff}ms difference`,
        );
        return {
          error: 'Client timestamp is unreasonable',
          serverTimestamp: serverReceiveTime,
        };
      }

      // Small processing delay to simulate minimal server work
      const processStartTime = Date.now();

      // T3: Server time when response sent
      const serverSendTime = Date.now();
      const serverProcessTime = serverSendTime - processStartTime;

      this.logger.debug(
        `Sync ping from ${client.data.username} (socket: ${client.id}): ` +
        `client=${clientTimestamp}, server_recv=${serverReceiveTime}, server_send=${serverSendTime}`,
      );

      // Return response with all timestamps for client-side NTP calculations
      return {
        clientTimestamp,
        serverTimestamp: serverSendTime,
        serverProcessTime,
      };
    } catch (error) {
      this.logger.error(`Error handling sync ping: ${error.message}`);
      return { error: 'Failed to process sync ping' };
    }
  }

  /**
   * Handle sync:update events where client sends calculated offset and RTT
   * This is called after client calculates offset using NTP algorithm
   */
  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('sync:update')
  async handleSyncUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { offset: number; rtt: number },
  ) {
    try {
      const { offset, rtt } = data;

      // Validate offset and RTT are reasonable
      const MAX_OFFSET = 3600000; // 1 hour
      const MAX_RTT = 10000; // 10 seconds

      if (Math.abs(offset) > MAX_OFFSET) {
        this.logger.warn(
          `Client ${client.id} sent unreasonable offset: ${offset}ms`,
        );
        return { error: 'Offset is unreasonable' };
      }

      if (rtt < 0 || rtt > MAX_RTT) {
        this.logger.warn(
          `Client ${client.id} sent unreasonable RTT: ${rtt}ms`,
        );
        return { error: 'RTT is unreasonable' };
      }

      // Store sync state in Redis
      await this.redisService.setSocketSyncState(client.id, offset, rtt);

      this.logger.log(
        `Sync update from ${client.data.username} (socket: ${client.id}): ` +
        `offset=${offset}ms, rtt=${rtt}ms`,
      );

      return { success: true, offset, rtt };
    } catch (error) {
      this.logger.error(`Error handling sync update: ${error.message}`);
      return { error: 'Failed to update sync state' };
    }
  }
}
