import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.client = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis connection error:', error);
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // Room state management
  async setRoomState(roomId: string, key: string, value: string): Promise<void> {
    await this.client.hset(`room:${roomId}:state`, key, value);
  }

  async getRoomState(roomId: string, key: string): Promise<string | null> {
    return await this.client.hget(`room:${roomId}:state`, key);
  }

  async getAllRoomState(roomId: string): Promise<Record<string, string>> {
    return await this.client.hgetall(`room:${roomId}:state`);
  }

  async deleteRoomState(roomId: string, key?: string): Promise<void> {
    if (key) {
      await this.client.hdel(`room:${roomId}:state`, key);
    } else {
      await this.client.del(`room:${roomId}:state`);
    }
  }

  // Current DJ management
  async setCurrentDj(roomId: string, userId: string | null): Promise<void> {
    if (userId) {
      await this.setRoomState(roomId, 'currentDjId', userId);
    } else {
      await this.deleteRoomState(roomId, 'currentDjId');
    }
  }

  async getCurrentDj(roomId: string): Promise<string | null> {
    return await this.getRoomState(roomId, 'currentDjId');
  }

  // Playback state management
  async setPlaybackState(
    roomId: string,
    state: 'playing' | 'paused' | 'stopped',
    trackId?: string,
    position?: number,
  ): Promise<void> {
    await this.client.hmset(`room:${roomId}:state`, {
      playbackState: state,
      ...(trackId && { trackId }),
      ...(position !== undefined && { position: position.toString() }),
      lastUpdate: Date.now().toString(),
    });
  }

  async getPlaybackState(roomId: string): Promise<{
    playbackState: string | null;
    trackId: string | null;
    position: number | null;
    lastUpdate: number | null;
  }> {
    const state = await this.getAllRoomState(roomId);
    return {
      playbackState: state.playbackState || null,
      trackId: state.trackId || null,
      position: state.position ? parseInt(state.position, 10) : null,
      lastUpdate: state.lastUpdate ? parseInt(state.lastUpdate, 10) : null,
    };
  }

  // Clock synchronization management
  async setSocketSyncState(socketId: string, offset: number, rtt: number): Promise<void> {
    const multi = this.client.multi();
    multi.set(`socket:${socketId}:sync.clockOffset`, offset.toString());
    multi.set(`socket:${socketId}:sync.lastRtt`, rtt.toString());
    // Set expiry to 5 minutes for auto-cleanup of disconnected sockets
    multi.expire(`socket:${socketId}:sync.clockOffset`, 300);
    multi.expire(`socket:${socketId}:sync.lastRtt`, 300);
    await multi.exec();
  }

  async getSocketSyncState(socketId: string): Promise<{
    clockOffset: number | null;
    lastRtt: number | null;
  }> {
    const [offset, rtt] = await Promise.all([
      this.client.get(`socket:${socketId}:sync.clockOffset`),
      this.client.get(`socket:${socketId}:sync.lastRtt`),
    ]);

    return {
      clockOffset: offset ? parseFloat(offset) : null,
      lastRtt: rtt ? parseFloat(rtt) : null,
    };
  }

  // Room membership tracking for RTT calculations
  async addSocketToRoom(roomId: string, socketId: string): Promise<void> {
    await this.client.sadd(`room:${roomId}:sockets`, socketId);
  }

  async removeSocketFromRoom(roomId: string, socketId: string): Promise<void> {
    await this.client.srem(`room:${roomId}:sockets`, socketId);
  }

  async getMaxRttForRoom(roomId: string): Promise<number | null> {
    // Get all socket IDs in the room from the set
    const socketIds = await this.client.smembers(`room:${roomId}:sockets`);

    if (socketIds.length === 0) {
      return null;
    }

    // Get RTT values for all sockets using MGET
    const rttKeys = socketIds.map(id => `socket:${id}:sync.lastRtt`);
    const rttValues = await this.client.mget(...rttKeys);

    // Parse and filter valid RTT values
    const rtts = rttValues
      .filter(value => value !== null)
      .map(value => parseFloat(value as string))
      .filter(value => !isNaN(value) && value > 0);

    if (rtts.length === 0) {
      return null;
    }

    // Return the maximum RTT
    return Math.max(...rtts);
  }
}
