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

interface SyncReportDto {
  rtt: number;
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

    // Store offset in Redis
    const redis = this.redisService.getClient();
    await redis.set(
      `socket:${client.id}:user.clockOffset`,
      clockOffset.toString(),
    );

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

    // Store RTT in Redis
    const redis = this.redisService.getClient();
    await redis.set(`socket:${client.id}:user.lastRtt`, rtt.toString());

    this.logger.debug(`Sync report from ${client.id}: rtt=${rtt}ms`);

    return { success: true };
  }
}
