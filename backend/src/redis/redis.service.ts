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

  // Room-socket membership tracking
  async addSocketToRoom(roomId: string, socketId: string): Promise<void> {
    await this.client.sadd(`room:${roomId}:sockets`, socketId);
  }

  async removeSocketFromRoom(roomId: string, socketId: string): Promise<void> {
    await this.client.srem(`room:${roomId}:sockets`, socketId);
  }

  async getSocketsInRoom(roomId: string): Promise<string[]> {
    return await this.client.smembers(`room:${roomId}:sockets`);
  }

  // Get maximum RTT for room (for adaptive sync buffer)
  async getMaxRttForRoom(roomId: string): Promise<number> {
    // Get all sockets in this specific room
    const socketIds = await this.getSocketsInRoom(roomId);
    if (socketIds.length === 0) return 50; // default 50ms

    // Query RTT for each socket in the room
    const rtts = await Promise.all(
      socketIds.map(socketId => this.client.get(`socket:${socketId}:user.lastRtt`))
    );

    const validRtts = rtts
      .map(r => parseFloat(r || '50'))
      .filter(r => !isNaN(r));

    return validRtts.length > 0 ? Math.max(...validRtts) : 50;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // Generic key-value operations
  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
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

  async removeCurrentDj(roomId: string): Promise<void> {
    await this.setCurrentDj(roomId, null);
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
}
