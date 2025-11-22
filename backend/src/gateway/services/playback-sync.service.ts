import { Injectable, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import { RoomGateway } from '../room.gateway';
import { PlaybackSyncDto } from '../dto/playback-sync.dto';

@Injectable()
export class PlaybackSyncService implements OnModuleDestroy {
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly SYNC_INTERVAL_MS = 10000; // 10 seconds

  constructor(
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => RoomGateway))
    private readonly roomGateway: RoomGateway,
  ) {}

  startSyncBroadcast(roomId: string): void {
    if (this.intervals.has(roomId)) {
      return;
    }

    const interval = setInterval(async () => {
      await this.broadcastSync(roomId);
    }, this.SYNC_INTERVAL_MS);

    this.intervals.set(roomId, interval);
  }

  stopSyncBroadcast(roomId: string): void {
    const interval = this.intervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(roomId);
    }
  }

  private async broadcastSync(roomId: string): Promise<void> {
    const stateJson = await this.redisService.getClient().get(
      `room:${roomId}:state.playback`,
    );

    if (!stateJson) {
      return;
    }

    const state = JSON.parse(stateJson);

    if (!state.playing) {
      this.stopSyncBroadcast(roomId);
      return;
    }

    const serverTimestamp = Date.now();
    const elapsed = serverTimestamp - state.startedAt;
    const theoreticalPosition = elapsed;

    const syncData: PlaybackSyncDto = {
      roomId,
      serverTimestamp,
      theoreticalPosition,
      trackId: state.trackId,
    };

    this.roomGateway.server.to(roomId).emit('playback:sync', syncData);
  }

  onModuleDestroy(): void {
    this.intervals.forEach((interval) => clearInterval(interval));
    this.intervals.clear();
  }
}
