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
