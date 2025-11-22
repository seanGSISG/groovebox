import {
  WebSocketGateway,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { SyncPingDto } from './dto/sync-ping.dto';
import { SyncPongDto } from './dto/sync-pong.dto';
import { SyncReportDto } from './dto/sync-report.dto';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:19006', 'http://localhost:19000'],
    credentials: true,
  },
})
export class SyncGateway {
  private readonly logger = new Logger(SyncGateway.name);

  constructor(private readonly redisService: RedisService) {}

  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('sync:ping')
  async handleSyncPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SyncPingDto,
  ): Promise<SyncPongDto> {
    const { clientTimestamp } = data;
    const serverTimestamp = Date.now();

    // Calculate clock offset (server - client)
    const clockOffset = serverTimestamp - clientTimestamp;

    // Store offset in Redis with TTL of 1 hour (3600 seconds)
    const redis = this.redisService.getClient();
    try {
      await redis.setex(
        `socket:${client.id}:user.clockOffset`,
        3600,
        clockOffset.toString(),
      );
    } catch (error) {
      this.logger.error(
        `Failed to store clock offset for ${client.id}: ${error.message}`,
      );
    }

    this.logger.debug(
      `Sync ping from ${client.id}: client=${clientTimestamp}, server=${serverTimestamp}, offset=${clockOffset}`,
    );

    return {
      clientTimestamp,
      serverTimestamp,
    };
  }

  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('sync:report')
  async handleSyncReport(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SyncReportDto,
  ): Promise<{ success: boolean }> {
    const { rtt } = data;

    // Store RTT in Redis with TTL of 1 hour (3600 seconds)
    const redis = this.redisService.getClient();
    try {
      await redis.setex(`socket:${client.id}:user.lastRtt`, 3600, rtt.toString());
    } catch (error) {
      this.logger.error(
        `Failed to store RTT for ${client.id}: ${error.message}`,
      );
    }

    this.logger.debug(`Sync report from ${client.id}: rtt=${rtt}ms`);

    return { success: true };
  }
}
