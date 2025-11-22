# Phase 2 Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build React Native mobile app with synchronized audio playback using ClockSyncManager and SyncedAudioPlayer services to achieve <50ms drift between devices.

**Architecture:** React Native + TypeScript with socket.io-client for WebSocket communication, react-native-track-player for audio, and NTP-inspired clock synchronization for coordinated playback.

**Tech Stack:**
- React Native 0.76+ with TypeScript
- Socket.io-client 4.x
- react-native-track-player 4.x
- @react-navigation/native 6.x
- @react-native-async-storage/async-storage 1.x
- axios 1.x

---

## Task 1: React Native Project Initialization

**Goal:** Initialize React Native project with TypeScript and core dependencies.

**Files:**
- Create: `mobile/` directory and all React Native scaffolding
- Create: `mobile/package.json`
- Create: `mobile/tsconfig.json`
- Create: `mobile/src/config/api.ts`

### Step 1: Initialize React Native project

Run from project root:
```bash
cd /home/user/groovebox
npx @react-native-community/cli@latest init mobile --skip-install --template react-native-template-typescript
cd mobile
```

Expected: React Native project created with TypeScript template

### Step 2: Install dependencies

Run:
```bash
npm install socket.io-client@^4.8.1 \
  react-native-track-player@^4.1.1 \
  @react-navigation/native@^6.1.18 \
  @react-navigation/native-stack@^6.11.0 \
  @react-native-async-storage/async-storage@^2.0.0 \
  axios@^1.7.7 \
  react-native-screens react-native-safe-area-context
```

Expected: All packages installed successfully

### Step 3: Create API configuration

Create `mobile/src/config/api.ts`:
```typescript
// API configuration for backend connection
export const API_CONFIG = {
  // Update this to your backend URL (development/production)
  BASE_URL: 'http://localhost:3000',
  WS_URL: 'ws://localhost:3000',

  // For physical device testing, use your machine's IP:
  // BASE_URL: 'http://192.168.1.100:3000',
  // WS_URL: 'ws://192.168.1.100:3000',
};

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    PROFILE: '/auth/profile',
  },
  ROOMS: {
    CREATE: '/rooms',
    JOIN: (code: string) => `/rooms/${code}/join`,
    DETAILS: (code: string) => `/rooms/${code}`,
    MY_ROOMS: '/rooms/my-rooms',
    LEAVE: (code: string) => `/rooms/${code}/leave`,
  },
};
```

### Step 4: Create source directory structure

Run:
```bash
mkdir -p src/{services,screens,hooks,components,contexts,types}
```

Expected: Directory structure created

### Step 5: Verify build (iOS simulation only, skip for now)

Skip this step for now. We'll verify after implementing core features.

### Step 6: Commit

```bash
git add .
git commit -m "feat: initialize React Native project with TypeScript and dependencies"
```

Expected: Changes committed successfully

---

## Task 2: Core Service - ClockSyncManager

**Goal:** Implement NTP-style clock synchronization manager.

**Files:**
- Create: `mobile/src/services/ClockSyncManager.ts`
- Create: `mobile/src/services/__tests__/ClockSyncManager.test.ts`
- Create: `mobile/src/types/sync.types.ts`

### Step 1: Write the type definitions

Create `mobile/src/types/sync.types.ts`:
```typescript
export interface SyncPongPayload {
  clientT0: number;
  serverT1: number;
  serverT2: number;
}

export interface SyncMetrics {
  offset: number;
  rtt: number;
}
```

### Step 2: Write the failing test

Create `mobile/src/services/__tests__/ClockSyncManager.test.ts`:
```typescript
import { ClockSyncManager } from '../ClockSyncManager';
import { Socket } from 'socket.io-client';

// Mock socket.io-client
jest.mock('socket.io-client');

describe('ClockSyncManager', () => {
  let mockSocket: jest.Mocked<Socket>;
  let manager: ClockSyncManager;

  beforeEach(() => {
    mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      off: jest.fn(),
    } as any;

    manager = new ClockSyncManager(mockSocket);
  });

  afterEach(() => {
    manager.stopSync();
  });

  it('should calculate clock offset correctly', () => {
    // Setup listener
    const pongCallback = (mockSocket.on as jest.Mock).mock.calls.find(
      call => call[0] === 'sync:pong'
    )?.[1];

    expect(pongCallback).toBeDefined();

    // Simulate sync:pong response
    const clientT0 = 1000;
    const serverT1 = 1050; // Server received 50ms later
    const serverT2 = 1051; // Server sent 1ms later
    // clientT3 will be captured in the handler

    // Mock Date.now for clientT3
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => 1102); // Client received 102ms after sending

    pongCallback({
      clientT0,
      serverT1,
      serverT2,
    });

    Date.now = originalDateNow;

    const offset = manager.getOffset();
    // Expected offset calculation:
    // RTT = (clientT3 - clientT0) - (serverT2 - serverT1) = (1102 - 1000) - (1051 - 1050) = 101ms
    // Offset = ((serverT1 - clientT0) + (serverT2 - clientT3)) / 2
    //        = ((1050 - 1000) + (1051 - 1102)) / 2
    //        = (50 + (-51)) / 2 = -0.5ms

    expect(offset).toBeCloseTo(-0.5, 1);
  });

  it('should emit sync:ping when startSync is called', () => {
    jest.useFakeTimers();

    manager.startSync(false);

    // Should emit immediately
    expect(mockSocket.emit).toHaveBeenCalledWith(
      'sync:ping',
      expect.objectContaining({ clientT0: expect.any(Number) })
    );

    jest.useRealTimers();
  });

  it('should sync more frequently during playback', () => {
    jest.useFakeTimers();

    manager.startSync(true); // isPlaying = true

    const initialCallCount = mockSocket.emit.mock.calls.length;

    // Advance by 10 seconds (playing interval)
    jest.advanceTimersByTime(10000);

    expect(mockSocket.emit.mock.calls.length).toBeGreaterThan(initialCallCount);

    jest.useRealTimers();
  });

  it('should convert server time to local time', () => {
    manager['clockOffset'] = 50; // Client is 50ms ahead

    const serverTime = 1000;
    const localTime = manager.serverTimeToLocal(serverTime);

    expect(localTime).toBe(950); // 1000 - 50
  });
});
```

### Step 3: Run test to verify it fails

Run:
```bash
cd mobile
npm test -- ClockSyncManager.test.ts
```

Expected: Tests fail with "Cannot find module '../ClockSyncManager'"

### Step 4: Write minimal implementation

Create `mobile/src/services/ClockSyncManager.ts`:
```typescript
import { Socket } from 'socket.io-client';
import { SyncPongPayload } from '../types/sync.types';

export class ClockSyncManager {
  private socket: Socket;
  private clockOffset: number = 0; // milliseconds (server ahead = positive)
  private currentRtt: number = 0; // milliseconds
  private syncInterval: NodeJS.Timeout | null = null;

  // Smoothing factor for exponential moving average (0-1)
  // Lower = more smoothing, higher = more responsive
  private readonly SMOOTHING_FACTOR = 0.3;

  // Sync intervals
  private readonly SYNC_INTERVAL_IDLE_MS = 30000; // 30 seconds when idle
  private readonly SYNC_INTERVAL_PLAYING_MS = 10000; // 10 seconds during playback

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on('sync:pong', (payload: SyncPongPayload) => {
      this.handleSyncPong(payload);
    });
  }

  /**
   * Start periodic clock synchronization
   * @param isPlaying - If true, sync more frequently (every 10s vs 30s)
   */
  public startSync(isPlaying: boolean = false): void {
    this.stopSync(); // Clear any existing interval

    // Send initial ping
    this.sendSyncPing();

    // Set up periodic pings
    const interval = isPlaying
      ? this.SYNC_INTERVAL_PLAYING_MS
      : this.SYNC_INTERVAL_IDLE_MS;

    this.syncInterval = setInterval(() => {
      this.sendSyncPing();
    }, interval);
  }

  public stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private sendSyncPing(): void {
    const clientT0 = Date.now();
    this.socket.emit('sync:ping', { clientT0 });
  }

  private handleSyncPong(payload: SyncPongPayload): void {
    const { clientT0, serverT1, serverT2 } = payload;
    const clientT3 = Date.now();

    // Calculate round-trip time (RTT)
    // RTT = total time - server processing time
    const rtt = (clientT3 - clientT0) - (serverT2 - serverT1);

    // Calculate clock offset using NTP algorithm
    // offset = ((server_recv - client_send) + (server_send - client_recv)) / 2
    // Positive offset means server clock is ahead of client
    const offset = ((serverT1 - clientT0) + (serverT2 - clientT3)) / 2;

    // Apply exponential smoothing to reduce jitter
    if (this.clockOffset === 0) {
      // First measurement - no smoothing
      this.clockOffset = offset;
    } else {
      this.clockOffset =
        this.SMOOTHING_FACTOR * offset +
        (1 - this.SMOOTHING_FACTOR) * this.clockOffset;
    }

    this.currentRtt = rtt;

    // Optional: Report metrics back to server
    this.socket.emit('sync:report', {
      offset: this.clockOffset,
      rtt: this.currentRtt,
    });

    console.log(
      `[ClockSync] Offset: ${this.clockOffset.toFixed(2)}ms, RTT: ${rtt.toFixed(2)}ms`,
    );
  }

  /**
   * Convert server timestamp to local timestamp
   * @param serverTime - Timestamp from server (ms)
   * @returns Equivalent local timestamp (ms)
   */
  public serverTimeToLocal(serverTime: number): number {
    return serverTime - this.clockOffset;
  }

  /**
   * Convert local timestamp to server timestamp
   * @param localTime - Local timestamp (ms)
   * @returns Equivalent server timestamp (ms)
   */
  public localTimeToServer(localTime: number): number {
    return localTime + this.clockOffset;
  }

  /**
   * Get current clock offset (for debugging/UI display)
   */
  public getOffset(): number {
    return this.clockOffset;
  }

  /**
   * Get current RTT (for debugging/UI display)
   */
  public getRtt(): number {
    return this.currentRtt;
  }

  /**
   * Clean up listeners when destroying
   */
  public destroy(): void {
    this.stopSync();
    this.socket.off('sync:pong');
  }
}
```

### Step 5: Run tests to verify they pass

Run:
```bash
npm test -- ClockSyncManager.test.ts
```

Expected: All tests pass

### Step 6: Commit

```bash
git add src/services/ClockSyncManager.ts src/services/__tests__/ClockSyncManager.test.ts src/types/sync.types.ts
git commit -m "feat: add ClockSyncManager with NTP-style synchronization"
```

Expected: Changes committed

---

## Task 3: Core Service - SyncedAudioPlayer

**Goal:** Implement synchronized audio player with drift correction.

**Files:**
- Create: `mobile/src/services/SyncedAudioPlayer.ts`
- Create: `mobile/src/services/__tests__/SyncedAudioPlayer.test.ts`
- Create: `mobile/src/types/playback.types.ts`

### Step 1: Write type definitions

Create `mobile/src/types/playback.types.ts`:
```typescript
export interface PlaybackStartEvent {
  trackId: string;
  trackSource: string;
  startAtServerTime: number; // Unix timestamp (ms)
  startPosition: number; // Seconds
  serverTimestamp: number; // Current server time
  syncBufferMs?: number; // Optional sync buffer info
}

export interface RoomStatePlayback {
  playing: boolean;
  trackId: string | null;
  startAtServerTime: number | null;
  currentPosition: number | null; // milliseconds
  serverTimestamp: number;
}
```

### Step 2: Write the failing test

Create `mobile/src/services/__tests__/SyncedAudioPlayer.test.ts`:
```typescript
import { SyncedAudioPlayer } from '../SyncedAudioPlayer';
import { ClockSyncManager } from '../ClockSyncManager';
import TrackPlayer from 'react-native-track-player';

// Mock dependencies
jest.mock('react-native-track-player', () => ({
  setupPlayer: jest.fn().mockResolvedValue(undefined),
  add: jest.fn().mockResolvedValue(undefined),
  play: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  reset: jest.fn().mockResolvedValue(undefined),
  seekTo: jest.fn().mockResolvedValue(undefined),
  getPosition: jest.fn().mockResolvedValue(0),
  getState: jest.fn().mockResolvedValue('playing'),
}));

describe('SyncedAudioPlayer', () => {
  let mockSyncManager: jest.Mocked<ClockSyncManager>;
  let player: SyncedAudioPlayer;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSyncManager = {
      serverTimeToLocal: jest.fn((serverTime) => serverTime - 50), // Mock 50ms offset
      getOffset: jest.fn(() => 50),
      getRtt: jest.fn(() => 100),
    } as any;

    player = new SyncedAudioPlayer(mockSyncManager);
  });

  afterEach(() => {
    player.destroy();
  });

  it('should schedule playback in the future', async () => {
    jest.useFakeTimers();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    const event = {
      trackId: 'test-track',
      trackSource: 'local',
      startAtServerTime: 2000, // Server time
      startPosition: 0,
      serverTimestamp: 1000,
    };

    // Mock Date.now to return 900 (local time)
    // startAtServerTime in local time = 2000 - 50 = 1950
    // delay = 1950 - 900 = 1050ms
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => 900);

    await player.handlePlaybackStart(event);

    // Should schedule playback with setTimeout
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1050);

    Date.now = originalDateNow;
    jest.useRealTimers();
  });

  it('should seek to catch-up position if start time is in past', async () => {
    const event = {
      trackId: 'test-track',
      trackSource: 'local',
      startAtServerTime: 1000,
      startPosition: 0,
      serverTimestamp: 1000,
    };

    // Mock Date.now so start time is in the past
    // startAtServerTime in local = 1000 - 50 = 950
    // now = 2000, so we're 1050ms late
    // Should seek to 1.05 seconds
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => 2000);

    await player.handlePlaybackStart(event);

    expect(TrackPlayer.seekTo).toHaveBeenCalledWith(1.05); // 1050ms late / 1000 = 1.05s
    expect(TrackPlayer.play).toHaveBeenCalled();

    Date.now = originalDateNow;
  });

  it('should correct drift if exceeds threshold', async () => {
    jest.useFakeTimers();

    // Start playback to set up drift correction
    const event = {
      trackId: 'test-track',
      trackSource: 'local',
      startAtServerTime: Date.now() + 1000,
      startPosition: 0,
      serverTimestamp: Date.now(),
    };

    await player.handlePlaybackStart(event);

    // Mock getPosition to return position ahead of expected
    (TrackPlayer.getPosition as jest.Mock).mockResolvedValue(5.3); // 5.3 seconds

    // Fast-forward time so expected position is 5.0 seconds
    // Drift = 5.3 - 5.0 = 0.3s = 300ms (exceeds SEEK_THRESHOLD_MS of 200ms)
    jest.advanceTimersByTime(5000);

    // Trigger drift correction
    jest.advanceTimersByTime(5000); // DRIFT_CHECK_INTERVAL_MS

    // Wait for async operations
    await Promise.resolve();

    expect(TrackPlayer.seekTo).toHaveBeenCalledWith(expect.any(Number));

    jest.useRealTimers();
  });
});
```

### Step 3: Run test to verify it fails

Run:
```bash
npm test -- SyncedAudioPlayer.test.ts
```

Expected: Test fails with "Cannot find module '../SyncedAudioPlayer'"

### Step 4: Write minimal implementation

Create `mobile/src/services/SyncedAudioPlayer.ts`:
```typescript
import TrackPlayer, { State } from 'react-native-track-player';
import { ClockSyncManager } from './ClockSyncManager';
import { PlaybackStartEvent, RoomStatePlayback } from '../types/playback.types';

export class SyncedAudioPlayer {
  private syncManager: ClockSyncManager;
  private driftCorrectionInterval: NodeJS.Timeout | null = null;

  // Playback metadata
  private currentTrackId: string | null = null;
  private startedAtLocalTime: number = 0;
  private trackStartPosition: number = 0; // seconds

  // Drift correction thresholds
  private readonly DRIFT_THRESHOLD_MS = 50; // Ignore drift below this
  private readonly SEEK_THRESHOLD_MS = 200; // Seek if drift exceeds this
  private readonly DRIFT_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds

  constructor(syncManager: ClockSyncManager) {
    this.syncManager = syncManager;
    this.initializePlayer();
  }

  private async initializePlayer(): Promise<void> {
    try {
      await TrackPlayer.setupPlayer();
      console.log('[SyncedAudioPlayer] Player initialized');
    } catch (error) {
      console.error('[SyncedAudioPlayer] Setup failed:', error);
    }
  }

  /**
   * Handle synchronized playback start from server
   */
  public async handlePlaybackStart(event: PlaybackStartEvent): Promise<void> {
    const {
      trackId,
      trackSource,
      startAtServerTime,
      startPosition,
      serverTimestamp,
    } = event;

    console.log(
      `[SyncedAudioPlayer] Playback start: track=${trackId}, serverStart=${startAtServerTime}`,
    );

    // Convert server start time to local time
    const localStartTime = this.syncManager.serverTimeToLocal(startAtServerTime);
    const nowLocal = Date.now();
    const delayMs = localStartTime - nowLocal;

    console.log(
      `[SyncedAudioPlayer] Scheduling in ${delayMs}ms (localStart=${localStartTime})`,
    );

    // Load track
    await this.loadTrack(trackId, trackSource);

    // Store metadata
    this.currentTrackId = trackId;
    this.startedAtLocalTime = localStartTime;
    this.trackStartPosition = startPosition;

    if (delayMs > 0) {
      // Schedule future playback
      setTimeout(() => {
        this.startPlayback(startPosition);
      }, delayMs);
    } else {
      // Start time is in the past (network delay exceeded buffer)
      // Calculate catch-up position
      const elapsedSeconds = Math.abs(delayMs) / 1000;
      const adjustedPosition = startPosition + elapsedSeconds;

      console.warn(
        `[SyncedAudioPlayer] Start time in past by ${Math.abs(delayMs)}ms, seeking to ${adjustedPosition}s`,
      );

      await this.startPlayback(adjustedPosition);
    }

    // Start drift correction loop
    this.startDriftCorrection();
  }

  /**
   * Handle pause event
   */
  public async handlePlaybackPause(): Promise<void> {
    await TrackPlayer.pause();
    this.stopDriftCorrection();
    console.log('[SyncedAudioPlayer] Paused');
  }

  /**
   * Handle stop event
   */
  public async handlePlaybackStop(): Promise<void> {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
    this.stopDriftCorrection();
    this.currentTrackId = null;
    console.log('[SyncedAudioPlayer] Stopped');
  }

  /**
   * Join mid-song: seek to current position
   */
  public async joinMidSong(playback: RoomStatePlayback): Promise<void> {
    if (!playback.playing || !playback.trackId || !playback.startAtServerTime) {
      return;
    }

    const {
      trackId,
      startAtServerTime,
      currentPosition,
      serverTimestamp,
    } = playback as Required<RoomStatePlayback>;

    console.log(
      `[SyncedAudioPlayer] Joining mid-song: track=${trackId}, position=${currentPosition}ms`,
    );

    // Load track
    await this.loadTrack(trackId, 'local'); // TODO: Get trackSource from state

    // Calculate current position
    // currentPosition from server is in milliseconds
    const positionSeconds = currentPosition / 1000;

    // Store metadata
    this.currentTrackId = trackId;
    this.startedAtLocalTime = this.syncManager.serverTimeToLocal(startAtServerTime);
    this.trackStartPosition = 0; // Assume track started from beginning

    // Seek and play
    await TrackPlayer.seekTo(positionSeconds);
    await TrackPlayer.play();

    console.log(`[SyncedAudioPlayer] Playing from position ${positionSeconds.toFixed(2)}s`);

    // Start drift correction
    this.startDriftCorrection();
  }

  /**
   * Periodically check and correct drift
   */
  private startDriftCorrection(): void {
    this.stopDriftCorrection();

    this.driftCorrectionInterval = setInterval(async () => {
      await this.correctDrift();
    }, this.DRIFT_CHECK_INTERVAL_MS);
  }

  private stopDriftCorrection(): void {
    if (this.driftCorrectionInterval) {
      clearInterval(this.driftCorrectionInterval);
      this.driftCorrectionInterval = null;
    }
  }

  /**
   * Check current position vs. expected position and correct if needed
   */
  private async correctDrift(): Promise<void> {
    try {
      const state = await TrackPlayer.getState();

      if (state !== State.Playing) {
        return; // Only correct during playback
      }

      // Calculate expected position
      const nowLocal = Date.now();
      const elapsedMs = nowLocal - this.startedAtLocalTime;
      const elapsedSeconds = elapsedMs / 1000;
      const expectedPosition = this.trackStartPosition + elapsedSeconds;

      // Get actual position
      const actualPosition = await TrackPlayer.getPosition();

      // Calculate drift
      const driftSeconds = actualPosition - expectedPosition;
      const driftMs = driftSeconds * 1000;

      console.log(
        `[SyncedAudioPlayer] Drift: expected=${expectedPosition.toFixed(3)}s, actual=${actualPosition.toFixed(3)}s, drift=${driftMs.toFixed(2)}ms`,
      );

      // Only correct if drift exceeds threshold
      if (Math.abs(driftMs) < this.DRIFT_THRESHOLD_MS) {
        return; // Drift is acceptable
      }

      if (Math.abs(driftMs) > this.SEEK_THRESHOLD_MS) {
        // Large drift: seek to correct position
        console.log(
          `[SyncedAudioPlayer] Large drift, seeking to ${expectedPosition.toFixed(3)}s`,
        );
        await TrackPlayer.seekTo(expectedPosition);
      } else {
        // Small drift: could apply time-stretching here (future enhancement)
        // For now, just seek
        console.log(
          `[SyncedAudioPlayer] Small drift, seeking to ${expectedPosition.toFixed(3)}s`,
        );
        await TrackPlayer.seekTo(expectedPosition);
      }
    } catch (error) {
      console.error('[SyncedAudioPlayer] Drift correction error:', error);
    }
  }

  /**
   * Load track based on source
   */
  private async loadTrack(trackId: string, trackSource: string): Promise<void> {
    await TrackPlayer.reset();

    // Different loading logic based on source
    switch (trackSource) {
      case 'spotify':
        console.warn('[SyncedAudioPlayer] Spotify not implemented yet');
        break;

      case 'youtube':
        console.warn('[SyncedAudioPlayer] YouTube not implemented yet');
        break;

      case 'local':
        // For Phase 2, use a placeholder local file
        // In production, trackId would be a file URI or URL
        await TrackPlayer.add({
          id: trackId,
          url: trackId,
          title: 'Test Track',
          artist: 'GrooveBox',
        });
        break;

      default:
        throw new Error(`Unknown track source: ${trackSource}`);
    }
  }

  /**
   * Start playback at specific position
   */
  private async startPlayback(position: number): Promise<void> {
    try {
      if (position > 0) {
        await TrackPlayer.seekTo(position);
      }
      await TrackPlayer.play();
      console.log(`[SyncedAudioPlayer] Playing from ${position.toFixed(3)}s`);
    } catch (error) {
      console.error('[SyncedAudioPlayer] Playback start error:', error);
    }
  }

  /**
   * Clean up when destroying
   */
  public destroy(): void {
    this.stopDriftCorrection();
  }
}
```

### Step 5: Run tests to verify they pass

Run:
```bash
npm test -- SyncedAudioPlayer.test.ts
```

Expected: All tests pass

### Step 6: Commit

```bash
git add src/services/SyncedAudioPlayer.ts src/services/__tests__/SyncedAudioPlayer.test.ts src/types/playback.types.ts
git commit -m "feat: add SyncedAudioPlayer with drift correction"
```

Expected: Changes committed

---

## Task 4: Socket.io Connection Hook

**Goal:** Create custom hook for socket.io connection management.

**Files:**
- Create: `mobile/src/hooks/useSocket.ts`
- Create: `mobile/src/types/socket.types.ts`

### Step 1: Write type definitions

Create `mobile/src/types/socket.types.ts`:
```typescript
export interface ServerToClientEvents {
  'sync:pong': (data: any) => void;
  'playback:start': (data: any) => void;
  'playback:pause': () => void;
  'playback:stop': () => void;
  'playback:sync': (data: any) => void;
  'room:state': (data: any) => void;
  'chat:message': (data: any) => void;
  'room:members-changed': (data: any) => void;
}

export interface ClientToServerEvents {
  'sync:ping': (data: { clientT0: number }) => void;
  'sync:report': (data: { offset: number; rtt: number }) => void;
  'playback:start': (data: any) => void;
  'playback:pause': () => void;
  'playback:stop': () => void;
  'room:join': (data: { roomCode: string }) => void;
  'room:leave': () => void;
  'chat:message': (data: { message: string }) => void;
}
```

### Step 2: Create useSocket hook

Create `mobile/src/hooks/useSocket.ts`:
```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import { ServerToClientEvents, ClientToServerEvents } from '../types/socket.types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const useSocket = (): TypedSocket | null => {
  const [socket, setSocket] = useState<TypedSocket | null>(null);

  useEffect(() => {
    let newSocket: TypedSocket | null = null;

    const connectSocket = async () => {
      try {
        // Get JWT token from storage
        const token = await AsyncStorage.getItem('jwt_token');

        if (!token) {
          console.log('[Socket] No token found, skipping connection');
          return;
        }

        // Create socket connection with auth
        newSocket = io(API_CONFIG.WS_URL, {
          auth: {
            token,
          },
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
        }) as TypedSocket;

        newSocket.on('connect', () => {
          console.log('[Socket] Connected:', newSocket?.id);
        });

        newSocket.on('disconnect', (reason) => {
          console.log('[Socket] Disconnected:', reason);
        });

        newSocket.on('connect_error', (error) => {
          console.error('[Socket] Connection error:', error.message);
        });

        setSocket(newSocket);
      } catch (error) {
        console.error('[Socket] Setup error:', error);
      }
    };

    connectSocket();

    return () => {
      if (newSocket) {
        console.log('[Socket] Disconnecting...');
        newSocket.disconnect();
      }
    };
  }, []);

  return socket;
};
```

### Step 3: Commit

```bash
git add src/hooks/useSocket.ts src/types/socket.types.ts
git commit -m "feat: add useSocket hook for WebSocket connection"
```

Expected: Changes committed

---

## Task 5: Auth Context & Screens

**Goal:** Implement authentication context and login/register screens.

**Files:**
- Create: `mobile/src/contexts/AuthContext.tsx`
- Create: `mobile/src/screens/LoginScreen.tsx`
- Create: `mobile/src/screens/RegisterScreen.tsx`
- Create: `mobile/src/types/auth.types.ts`

### Step 1: Write type definitions

Create `mobile/src/types/auth.types.ts`:
```typescript
export interface User {
  id: string;
  username: string;
  displayName: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  displayName: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  user: User;
}
```

### Step 2: Create Auth Context

Create `mobile/src/contexts/AuthContext.tsx`:
```typescript
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_CONFIG, API_ENDPOINTS } from '../config/api';
import { User, LoginRequest, RegisterRequest, AuthResponse } from '../types/auth.types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-login on app start
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('jwt_token');
        const storedUser = await AsyncStorage.getItem('user');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error('[Auth] Load error:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAuth();
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await axios.post<AuthResponse>(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.AUTH.LOGIN}`,
        credentials,
      );

      const { access_token, user: userData } = response.data;

      await AsyncStorage.setItem('jwt_token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      const response = await axios.post<AuthResponse>(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.AUTH.REGISTER}`,
        data,
      );

      const { access_token, user: userData } = response.data;

      await AsyncStorage.setItem('jwt_token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);
    } catch (error) {
      console.error('[Auth] Register error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('jwt_token');
    await AsyncStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
```

### Step 3: Create Login Screen

Create `mobile/src/screens/LoginScreen.tsx`:
```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export const LoginScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }

    setLoading(true);
    try {
      await login({ username, password });
      // Navigation handled by App.tsx based on auth state
    } catch (error: any) {
      Alert.alert('Login Failed', error.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GrooveBox</Text>
      <Text style={styles.subtitle}>Synchronized Audio Playback</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('Register')}
        disabled={loading}
      >
        <Text style={styles.linkText}>Don't have an account? Register</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    textAlign: 'center',
    color: '#007AFF',
    marginTop: 16,
    fontSize: 14,
  },
});
```

### Step 4: Create Register Screen

Create `mobile/src/screens/RegisterScreen.tsx`:
```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export const RegisterScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { register } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !displayName || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await register({ username, displayName, password });
      // Navigation handled by App.tsx based on auth state
    } catch (error: any) {
      Alert.alert('Registration Failed', error.response?.data?.message || 'Please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Display Name"
        value={displayName}
        onChangeText={setDisplayName}
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <TextInput
        style={styles.input}
        placeholder="Confirm Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Register</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => navigation.navigate('Login')}
        disabled={loading}
      >
        <Text style={styles.linkText}>Already have an account? Login</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 40,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkText: {
    textAlign: 'center',
    color: '#007AFF',
    marginTop: 16,
    fontSize: 14,
  },
});
```

### Step 5: Commit

```bash
git add src/contexts/AuthContext.tsx src/screens/LoginScreen.tsx src/screens/RegisterScreen.tsx src/types/auth.types.ts
git commit -m "feat: add auth context and login/register screens"
```

Expected: Changes committed

---

## Task 6: Room Management Screens

**Goal:** Create lobby, create room, and join room screens.

**Files:**
- Create: `mobile/src/screens/LobbyScreen.tsx`
- Create: `mobile/src/screens/RoomScreen.tsx`
- Create: `mobile/src/types/room.types.ts`

### Step 1: Write type definitions

Create `mobile/src/types/room.types.ts`:
```typescript
export interface Room {
  id: string;
  roomCode: string;
  roomName: string;
  ownerI: string;
  memberCount?: number;
  hasPassword: boolean;
}

export interface CreateRoomRequest {
  roomName: string;
  password?: string;
}

export interface JoinRoomRequest {
  roomCode: string;
  password?: string;
}
```

### Step 2: Create Lobby Screen

Create `mobile/src/screens/LobbyScreen.tsx`:
```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, API_ENDPOINTS } from '../config/api';
import { useAuth } from '../contexts/AuthContext';

export const LobbyScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { logout } = useAuth();
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const createRoom = async () => {
    if (!roomName) {
      Alert.alert('Error', 'Please enter room name');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('jwt_token');
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.ROOMS.CREATE}`,
        {
          roomName,
          password: roomPassword || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const room = response.data;
      Alert.alert('Room Created', `Room code: ${room.roomCode}`);
      navigation.navigate('Room', { roomCode: room.roomCode });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!roomCode) {
      Alert.alert('Error', 'Please enter room code');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('jwt_token');
      await axios.post(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.ROOMS.JOIN(roomCode)}`,
        { password: roomPassword || undefined },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      navigation.navigate('Room', { roomCode });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GrooveBox Lobby</Text>

      {!showCreateRoom ? (
        <>
          <Text style={styles.sectionTitle}>Join Room</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Room Code"
            value={roomCode}
            onChangeText={setRoomCode}
            autoCapitalize="characters"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={joinRoom}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Join Room</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
            onPress={() => setShowCreateRoom(true)}
            disabled={loading}
          >
            <Text style={styles.buttonTextSecondary}>Create New Room</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Create Room</Text>
          <TextInput
            style={styles.input}
            placeholder="Room Name"
            value={roomName}
            onChangeText={setRoomName}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password (Optional)"
            value={roomPassword}
            onChangeText={setRoomPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={createRoom}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Room</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
            onPress={() => setShowCreateRoom(false)}
            disabled={loading}
          >
            <Text style={styles.buttonTextSecondary}>Back to Join</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonTextSecondary: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    marginTop: 'auto',
    padding: 16,
  },
  logoutText: {
    textAlign: 'center',
    color: '#FF3B30',
    fontSize: 16,
  },
});
```

### Step 3: Create Room Screen (basic structure)

Create `mobile/src/screens/RoomScreen.tsx`:
```typescript
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { useSocket } from '../hooks/useSocket';
import { ClockSyncManager } from '../services/ClockSyncManager';
import { SyncedAudioPlayer } from '../services/SyncedAudioPlayer';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

export const RoomScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { roomCode } = route.params;
  const socket = useSocket();
  const syncManagerRef = useRef<ClockSyncManager | null>(null);
  const audioPlayerRef = useRef<SyncedAudioPlayer | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [syncOffset, setSyncOffset] = useState<number>(0);
  const [syncRtt, setSyncRtt] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Initialize sync services
    syncManagerRef.current = new ClockSyncManager(socket);
    audioPlayerRef.current = new SyncedAudioPlayer(syncManagerRef.current);

    // Join room
    socket.emit('room:join', { roomCode });

    // Start clock sync
    syncManagerRef.current.startSync(false);

    // Listen for playback events
    socket.on('playback:start', (event) => {
      console.log('[Room] Playback start event:', event);
      audioPlayerRef.current?.handlePlaybackStart(event);
      setIsPlaying(true);
      syncManagerRef.current?.startSync(true); // Increase sync frequency
    });

    socket.on('playback:pause', () => {
      audioPlayerRef.current?.handlePlaybackPause();
      setIsPlaying(false);
      syncManagerRef.current?.startSync(false);
    });

    socket.on('playback:stop', () => {
      audioPlayerRef.current?.handlePlaybackStop();
      setIsPlaying(false);
    });

    socket.on('room:state', (state) => {
      console.log('[Room] Room state:', state);
      if (state.playback?.playing) {
        audioPlayerRef.current?.joinMidSong(state.playback);
        setIsPlaying(true);
      }
    });

    socket.on('chat:message', (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          username: data.username,
          message: data.message,
          timestamp: data.timestamp,
        },
      ]);
    });

    // Update sync metrics for UI
    const metricsInterval = setInterval(() => {
      if (syncManagerRef.current) {
        setSyncOffset(syncManagerRef.current.getOffset());
        setSyncRtt(syncManagerRef.current.getRtt());
      }
    }, 1000);

    return () => {
      clearInterval(metricsInterval);
      syncManagerRef.current?.stopSync();
      syncManagerRef.current?.destroy();
      audioPlayerRef.current?.destroy();
      socket.emit('room:leave');
      socket.off('playback:start');
      socket.off('playback:pause');
      socket.off('playback:stop');
      socket.off('room:state');
      socket.off('chat:message');
    };
  }, [socket, roomCode]);

  const sendMessage = () => {
    if (!inputMessage.trim() || !socket) return;

    socket.emit('chat:message', { message: inputMessage });
    setInputMessage('');
  };

  const handlePlay = () => {
    if (!socket) return;

    // For testing: use a placeholder track
    socket.emit('playback:start', {
      trackId: 'test-track',
      trackSource: 'local',
      position: 0,
    });
  };

  const handlePause = () => {
    if (!socket) return;
    socket.emit('playback:pause');
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageContainer}>
      <Text style={styles.messageUsername}>{item.username}:</Text>
      <Text style={styles.messageText}>{item.message}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.roomCode}>Room: {roomCode}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.leaveButton}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Metrics */}
      <View style={styles.syncMetrics}>
        <Text style={styles.metricText}>
          Offset: {syncOffset.toFixed(1)}ms | RTT: {syncRtt.toFixed(1)}ms
        </Text>
        <Text style={styles.metricText}>
          Status: {isPlaying ? 'Playing' : 'Stopped'}
        </Text>
      </View>

      {/* DJ Controls (simplified for Phase 2) */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={handlePlay}>
          <Text style={styles.controlButtonText}>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={handlePause}>
          <Text style={styles.controlButtonText}>Pause</Text>
        </TouchableOpacity>
      </View>

      {/* Chat */}
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
      />

      {/* Chat Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={inputMessage}
          onChangeText={setInputMessage}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  roomCode: {
    fontSize: 18,
    fontWeight: '600',
  },
  leaveButton: {
    color: '#FF3B30',
    fontSize: 16,
  },
  syncMetrics: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  metricText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  controls: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  controlButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
  },
  messageContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageUsername: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#007AFF',
  },
  messageText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
```

### Step 4: Commit

```bash
git add src/screens/LobbyScreen.tsx src/screens/RoomScreen.tsx src/types/room.types.ts
git commit -m "feat: add lobby and room screens with sync integration"
```

Expected: Changes committed

---

## Task 7: App Navigation Setup

**Goal:** Set up React Navigation with auth flow.

**Files:**
- Modify: `mobile/App.tsx`
- Create: `mobile/src/navigation/RootNavigator.tsx`

### Step 1: Create Root Navigator

Create `mobile/src/navigation/RootNavigator.tsx`:
```typescript
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { LobbyScreen } from '../screens/LobbyScreen';
import { RoomScreen } from '../screens/RoomScreen';
import { ActivityIndicator, View } from 'react-native';

const Stack = createNativeStackNavigator();

export const RootNavigator: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Lobby" component={LobbyScreen} />
            <Stack.Screen name="Room" component={RoomScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
```

### Step 2: Update App.tsx

Modify `mobile/App.tsx`:
```typescript
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

export default App;
```

### Step 3: Commit

```bash
git add App.tsx src/navigation/RootNavigator.tsx
git commit -m "feat: set up navigation with auth flow"
```

Expected: Changes committed

---

## Task 8: Setup react-native-track-player Service

**Goal:** Configure track player service for background playback.

**Files:**
- Create: `mobile/index.js` (register playback service)
- Create: `mobile/src/services/trackPlayerService.ts`

### Step 1: Create track player service

Create `mobile/src/services/trackPlayerService.ts`:
```typescript
import TrackPlayer, { Event } from 'react-native-track-player';

export async function setupTrackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
}
```

### Step 2: Register service in index.js

Modify `mobile/index.js` to add:
```javascript
import TrackPlayer from 'react-native-track-player';
import { setupTrackPlayerService } from './src/services/trackPlayerService';

// Register playback service
TrackPlayer.registerPlaybackService(() => setupTrackPlayerService);
```

### Step 3: Commit

```bash
git add index.js src/services/trackPlayerService.ts
git commit -m "feat: configure track player service"
```

Expected: Changes committed

---

## Task 9: Final Testing & Documentation

**Goal:** Verify build, create testing documentation.

**Files:**
- Create: `mobile/README.md`
- Create: `mobile/TESTING.md`

### Step 1: Create README

Create `mobile/README.md`:
```markdown
# GrooveBox Mobile App

React Native mobile application for synchronized audio playback.

## Setup

### Prerequisites
- Node.js 18+
- React Native development environment (Xcode for iOS, Android Studio for Android)
- Running GrooveBox backend

### Installation

\`\`\`bash
npm install
\`\`\`

### Configuration

Update `src/config/api.ts` with your backend URL:

\`\`\`typescript
export const API_CONFIG = {
  BASE_URL: 'http://YOUR_BACKEND_IP:3000',
  WS_URL: 'ws://YOUR_BACKEND_IP:3000',
};
\`\`\`

### Running

\`\`\`bash
# iOS
npx react-native run-ios

# Android
npx react-native run-android
\`\`\`

## Architecture

- **ClockSyncManager**: NTP-style clock synchronization with server
- **SyncedAudioPlayer**: Scheduled playback with drift correction
- **useSocket**: WebSocket connection management
- **AuthContext**: Authentication state management

## Features

- User authentication (login/register)
- Create/join password-protected rooms
- Real-time chat
- Synchronized audio playback (<50ms target drift)
- Clock sync metrics display
- Mid-song join support
- Automatic drift correction

## Testing

See TESTING.md for physical device testing procedures.
```

### Step 2: Create testing guide

Create `mobile/TESTING.md`:
```markdown
# GrooveBox Phase 2 Frontend Testing Guide

## Prerequisites for Testing

- 3+ physical devices (iOS or Android)
- All devices on same WiFi network
- Backend running and accessible
- Test audio file prepared

## Test Procedure

### 1. Setup

1. Build and install app on all test devices
2. Update `src/config/api.ts` with backend IP address
3. Register user accounts on each device
4. Verify all devices can connect to backend

### 2. Basic Flow Test

**Device 1 (DJ):**
1. Login
2. Create room (note room code)
3. Verify sync metrics show reasonable offset/RTT

**Devices 2-3:**
1. Login
2. Join room using code
3. Verify sync metrics displayed

### 3. Synchronized Playback Test

**Device 1 (DJ):**
1. Press "Play" button
2. Observe sync metrics during playback

**All Devices:**
1. Verify playback starts at same time (audibly)
2. Place devices close together to detect echo/drift
3. Listen for ~30 seconds
4. Check sync metrics - should show drift <50ms

**Expected:** No audible echo or drift

### 4. Mid-Song Join Test

**Setup:** Playback already active on Devices 1-2

**Device 3:**
1. Join room during playback
2. Verify playback catches up to current position
3. Verify sync with other devices within 5-10 seconds

**Expected:** Device 3 syncs with others, no restart

### 5. Drift Correction Test

1. Let playback run for 5+ minutes
2. Monitor drift metrics
3. Observe drift correction events in logs

**Expected:** Drift stays below 100ms, periodic corrections occur

### 6. Network Stress Test

1. Start playback on all devices
2. Toggle WiFi off/on on one device
3. Verify reconnection and re-sync

**Expected:** Device reconnects, re-syncs within 10-20 seconds

## Measuring Actual Sync Accuracy

### Method 1: Audio Recording

1. Start synchronized playback on all devices
2. Record audio with external microphone (all devices audible)
3. Import recording into DAW (Audacity, Ableton, etc.)
4. Align waveforms visually
5. Measure time difference between peaks

**Target:** <50ms difference (95th percentile)

### Method 2: Visual Observation

1. Use test track with strong transients (drum hits)
2. Place all devices in circle
3. Listen for echo/phase cancellation
4. Adjust positions to detect drift

**Target:** No audible echo

## Known Issues & Debugging

### High RTT (>500ms)
- Check WiFi signal strength
- Verify backend accessible
- Test with device closer to router

### Drift Increasing Over Time
- Check drift correction logs
- Verify clock sync frequency
- Check device CPU usage (throttling)

### Playback Not Starting
- Check backend logs for errors
- Verify JWT token valid
- Check WebSocket connection status

## Metrics to Track

Record these for each test session:

- Number of devices: ___
- Average RTT: ___ms
- Average clock offset: ___ms
- Maximum observed drift: ___ms
- Test duration: ___minutes
- Network conditions: ___
- Issues encountered: ___

## Success Criteria

✅ All devices start playback within 100ms of each other
✅ Drift stays below 50ms during 5-minute playback
✅ Mid-song join syncs within 10 seconds
✅ No crashes or connection failures
✅ Drift correction occurs automatically
✅ Sync metrics displayed accurately
```

### Step 3: Commit

```bash
git add README.md TESTING.md
git commit -m "docs: add README and testing guide"
```

Expected: Changes committed

---

## Final Verification

### Step 1: Run all tests

```bash
npm test
```

Expected: All tests pass

### Step 2: Type check

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors

### Step 3: Build check (skip until ready for device testing)

Skip for now - requires full RN environment setup.

### Step 4: Push to branch

```bash
git push -u origin claude/phase-2-backend-completion-01Urm8ih21B9q6DjE6xszX25
```

Expected: Changes pushed successfully

---

## Success Criteria

✅ React Native project initialized with TypeScript
✅ ClockSyncManager implemented and tested
✅ SyncedAudioPlayer implemented and tested
✅ Auth screens and context working
✅ Room management screens created
✅ WebSocket integration complete
✅ Sync metrics displayed in UI
✅ All TypeScript types defined
✅ Navigation flow working
✅ README and testing documentation complete
✅ All commits pushed to branch

**Next Steps:**
1. Set up physical devices for testing
2. Deploy backend to accessible server
3. Build app on physical devices
4. Run synchronization tests with 3+ devices
5. Measure actual sync accuracy (<50ms target)
6. Iterate on drift correction if needed

---

**Document Version**: 1.0
**Created**: 2025-11-22
**For**: Phase 2 Frontend - Synchronized Audio Playback
