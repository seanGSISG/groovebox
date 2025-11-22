# Phase 2 Backend Implementation Plan: Robust Audio Synchronization

**Objective**: Implement backend clock synchronization and enhanced playback features to enable sub-50ms audio sync across devices.

**Working Directory**: `/home/user/groovebox/backend`

**Prerequisites**: Phase 1 backend complete (WebSocket gateway, Redis, rooms, auth)

---

## Task 1: Backend Clock Sync Module

**Goal**: Create WebSocket handlers for NTP-style clock synchronization.

**Files to Create**:
- `src/sync/sync.gateway.ts` - WebSocket gateway for clock sync
- `src/sync/sync.module.ts` - Module definition
- `src/sync/dto/sync-ping.dto.ts` - DTO for ping event
- `src/sync/dto/sync-pong.dto.ts` - DTO for pong event
- `src/sync/sync.gateway.spec.ts` - Unit tests

**Implementation Details**:

1. **Create sync module structure**:
   ```bash
   mkdir -p src/sync/dto
   ```

2. **Create `src/sync/dto/sync-ping.dto.ts`**:
   ```typescript
   import { IsNumber } from 'class-validator';

   export class SyncPingDto {
     @IsNumber()
     clientTimestamp: number;
   }
   ```

3. **Create `src/sync/dto/sync-pong.dto.ts`**:
   ```typescript
   export class SyncPongDto {
     clientTimestamp: number;
     serverTimestamp: number;
   }
   ```

4. **Create `src/sync/sync.gateway.ts`**:
   - Extend existing WebSocketGateway or create new one on same namespace
   - Implement `@SubscribeMessage('sync:ping')` handler
   - Handler receives `clientTimestamp`, captures `serverTimestamp`
   - Store offset in Redis: `socket:{socketId}:user.clockOffset`
   - Store RTT in Redis: `socket:{socketId}:user.lastRtt`
   - Emit `sync:pong` with both timestamps
   - Add `@SubscribeMessage('sync:report')` for optional client reporting

5. **Create `src/sync/sync.module.ts`**:
   - Import RedisModule
   - Declare SyncGateway as provider
   - Export SyncGateway

6. **Testing Requirements**:
   - Test sync:ping returns pong with timestamps
   - Test Redis storage of offset/RTT
   - Test multiple pings update values
   - Mock Redis and WebSocket client

7. **Verification**:
   - Run `npm test`
   - All tests pass
   - Commit with message: "Add backend clock sync module with NTP-style ping/pong"

---

## Task 2: Backend Enhanced Playback with Adaptive Sync Buffer

**Goal**: Modify playback:start event to calculate server-side start time and adaptive sync buffer.

**Files to Modify**:
- `src/websocket/websocket.gateway.ts` - Update playback:start handler
- `src/redis/redis.service.ts` - Add helper methods
- `src/websocket/dto/playback-start.dto.ts` - Update DTO

**Files to Create**:
- `src/websocket/helpers/sync-buffer.helper.ts` - Calculate sync buffer
- `src/websocket/helpers/sync-buffer.helper.spec.ts` - Tests

**Implementation Details**:

1. **Create `src/websocket/helpers/sync-buffer.helper.ts`**:
   ```typescript
   export class SyncBufferHelper {
     static readonly DEFAULT_BUFFER_MS = 100;
     static readonly RTT_MULTIPLIER = 2;
     static readonly MAX_BUFFER_MS = 500;

     static calculateSyncBuffer(maxRtt: number): number {
       const buffer = Math.max(
         this.DEFAULT_BUFFER_MS,
         maxRtt * this.RTT_MULTIPLIER
       );
       return Math.min(buffer, this.MAX_BUFFER_MS);
     }
   }
   ```

2. **Add to `src/redis/redis.service.ts`**:
   ```typescript
   async getMaxRttForRoom(roomId: string): Promise<number> {
     const pattern = `socket:*:user.lastRtt`;
     const keys = await this.redis.keys(pattern);
     if (keys.length === 0) return 50; // default 50ms

     const rtts = await Promise.all(
       keys.map(key => this.redis.get(key))
     );
     return Math.max(...rtts.map(r => parseFloat(r || '50')));
   }
   ```

3. **Update `src/websocket/dto/playback-start.dto.ts`**:
   ```typescript
   export class PlaybackStartDto {
     @IsString()
     trackId: string;

     @IsNumber()
     @IsOptional()
     position?: number; // starting position in ms

     // Response fields (not validated)
     startAtServerTime?: number;
     syncBufferMs?: number;
     serverTimestamp?: number;
   }
   ```

4. **Update playback:start handler in `src/websocket/websocket.gateway.ts`**:
   ```typescript
   @SubscribeMessage('playback:start')
   async handlePlaybackStart(
     @ConnectedSocket() client: Socket,
     @MessageBody() data: PlaybackStartDto,
   ) {
     // ... existing DJ validation ...

     const maxRtt = await this.redisService.getMaxRttForRoom(roomId);
     const syncBufferMs = SyncBufferHelper.calculateSyncBuffer(maxRtt);
     const serverTimestamp = Date.now();
     const startAtServerTime = serverTimestamp + syncBufferMs;

     const response = {
       ...data,
       startAtServerTime,
       syncBufferMs,
       serverTimestamp,
     };

     // Store in Redis
     await this.redisService.set(
       `room:${roomId}:state.playback`,
       JSON.stringify({
         playing: true,
         trackId: data.trackId,
         startAtServerTime,
         startedAt: serverTimestamp,
       })
     );

     // Broadcast to room
     this.server.to(roomId).emit('playback:start', response);
   }
   ```

5. **Testing Requirements**:
   - Test sync buffer calculation (min, max, adaptive)
   - Test getMaxRttForRoom with various RTT values
   - Test playback:start includes all response fields
   - Test Redis state storage
   - Mock Redis and WebSocket

6. **Verification**:
   - Run `npm test`
   - All tests pass
   - Commit: "Add adaptive sync buffer to playback:start"

---

## Task 3: Backend State Snapshots (Periodic Sync Broadcasts)

**Goal**: Implement periodic state broadcasts during playback for drift correction.

**Files to Create**:
- `src/websocket/services/playback-sync.service.ts` - Periodic sync service
- `src/websocket/services/playback-sync.service.spec.ts` - Tests
- `src/websocket/dto/playback-sync.dto.ts` - DTO

**Files to Modify**:
- `src/websocket/websocket.module.ts` - Register service
- `src/websocket/websocket.gateway.ts` - Start/stop sync on playback events

**Implementation Details**:

1. **Create `src/websocket/dto/playback-sync.dto.ts`**:
   ```typescript
   export class PlaybackSyncDto {
     roomId: string;
     serverTimestamp: number;
     theoreticalPosition: number; // ms
     trackId: string;
   }
   ```

2. **Create `src/websocket/services/playback-sync.service.ts`**:
   ```typescript
   @Injectable()
   export class PlaybackSyncService {
     private intervals: Map<string, NodeJS.Timeout> = new Map();
     private readonly SYNC_INTERVAL_MS = 10000; // 10 seconds

     constructor(
       @InjectRedis() private readonly redis: Redis,
       private readonly wsGateway: WebsocketGateway,
     ) {}

     startSyncBroadcast(roomId: string) {
       if (this.intervals.has(roomId)) return;

       const interval = setInterval(async () => {
         await this.broadcastSync(roomId);
       }, this.SYNC_INTERVAL_MS);

       this.intervals.set(roomId, interval);
     }

     stopSyncBroadcast(roomId: string) {
       const interval = this.intervals.get(roomId);
       if (interval) {
         clearInterval(interval);
         this.intervals.delete(roomId);
       }
     }

     private async broadcastSync(roomId: string) {
       const stateJson = await this.redis.get(`room:${roomId}:state.playback`);
       if (!stateJson) return;

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

       this.wsGateway.server.to(roomId).emit('playback:sync', syncData);
     }

     onModuleDestroy() {
       this.intervals.forEach((interval) => clearInterval(interval));
       this.intervals.clear();
     }
   }
   ```

3. **Update `src/websocket/websocket.gateway.ts`**:
   - Inject PlaybackSyncService
   - Call `playbackSyncService.startSyncBroadcast(roomId)` in playback:start
   - Call `playbackSyncService.stopSyncBroadcast(roomId)` in playback:pause/stop

4. **Testing Requirements**:
   - Test sync broadcasts every 10s during playback
   - Test theoretical position calculation
   - Test stop sync on pause
   - Test cleanup on module destroy
   - Use fake timers (jest.useFakeTimers)

5. **Verification**:
   - Run `npm test`
   - All tests pass
   - Commit: "Add periodic playback sync broadcasts for drift correction"

---

## Task 4: Backend Join Mid-Song Support

**Goal**: Send current playback state to users joining mid-song.

**Files to Modify**:
- `src/websocket/websocket.gateway.ts` - Update room join handler

**Files to Create**:
- `src/websocket/dto/room-state.dto.ts` - DTO for room state

**Implementation Details**:

1. **Create `src/websocket/dto/room-state.dto.ts`**:
   ```typescript
   export class RoomStateDto {
     roomId: string;
     members: Array<{ userId: string; username: string }>;
     currentDjId: string | null;
     playback: {
       playing: boolean;
       trackId: string | null;
       startAtServerTime: number | null;
       currentPosition: number | null; // for mid-song join
       serverTimestamp: number;
     };
   }
   ```

2. **Update room join handler in `src/websocket/websocket.gateway.ts`**:
   ```typescript
   @SubscribeMessage('room:join')
   async handleRoomJoin(
     @ConnectedSocket() client: Socket,
     @MessageBody() data: { roomCode: string },
   ) {
     // ... existing join logic ...

     // Send current room state to joining user
     const playbackJson = await this.redisService.get(
       `room:${room.id}:state.playback`
     );
     const currentDjId = await this.redisService.get(
       `room:${room.id}:state.currentDjId`
     );

     const serverTimestamp = Date.now();
     let playbackState = {
       playing: false,
       trackId: null,
       startAtServerTime: null,
       currentPosition: null,
       serverTimestamp,
     };

     if (playbackJson) {
       const state = JSON.parse(playbackJson);
       if (state.playing) {
         const elapsed = serverTimestamp - state.startedAt;
         playbackState = {
           playing: true,
           trackId: state.trackId,
           startAtServerTime: state.startAtServerTime,
           currentPosition: elapsed,
           serverTimestamp,
         };
       }
     }

     const roomState: RoomStateDto = {
       roomId: room.id,
       members: [], // TODO: fetch from room members
       currentDjId,
       playback: playbackState,
     };

     client.emit('room:state', roomState);

     // ... rest of join logic ...
   }
   ```

3. **Testing Requirements**:
   - Test room:state sent on join
   - Test currentPosition calculation for mid-song join
   - Test room:state with no active playback
   - Test room:state with active playback
   - Mock Redis and WebSocket

4. **Verification**:
   - Run `npm test`
   - All tests pass
   - Commit: "Add mid-song join support with current playback position"

---

## Verification Steps After All Tasks

1. **Run all tests**: `npm test` - All pass
2. **Build check**: `npm run build` - No errors
3. **Manual WebSocket test**:
   - Connect client
   - Send sync:ping, verify pong
   - Start playback, verify startAtServerTime and syncBufferMs
   - Join room mid-song, verify currentPosition
4. **Redis verification**:
   - Check clock offsets stored
   - Check playback state stored
   - Check sync broadcasts occurring

---

## Commit Strategy

- Commit after each task passes tests
- Use conventional commit messages
- Push to branch: `claude/setup-subagent-workflow-01NcBX71HQ41PVrGkk5HVV4P`

---

## Success Criteria

✅ Clock sync ping/pong working
✅ RTT and offset stored in Redis
✅ Adaptive sync buffer calculated
✅ playback:start includes server timestamp
✅ Periodic sync broadcasts every 10s
✅ Mid-song join sends current position
✅ All tests passing (target 100+ total tests)
✅ No TypeScript errors
✅ Code reviewed and approved

---

**Document Version**: 1.0
**Created**: 2025-11-22
**For**: Phase 2 Backend - Audio Synchronization
