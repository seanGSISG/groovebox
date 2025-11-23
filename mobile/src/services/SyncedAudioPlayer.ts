import TrackPlayer, { State } from 'react-native-track-player';
import { ClockSyncManager } from './ClockSyncManager';
import { PlaybackStartEvent, RoomStatePlayback } from '../types/playback.types';
import { Socket } from 'socket.io-client';

export class SyncedAudioPlayer {
  private syncManager: ClockSyncManager;
  private driftCorrectionInterval: NodeJS.Timeout | null = null;
  private socket: Socket | null = null;
  private roomCode: string | null = null;
  private isDJ: boolean = false;

  // Playback metadata
  private currentTrackId: string | null = null;
  private startedAtLocalTime: number = 0;
  private trackStartPosition: number = 0; // seconds

  // Drift correction thresholds
  private readonly DRIFT_THRESHOLD_MS = 50; // Ignore drift below this
  private readonly SEEK_THRESHOLD_MS = 200; // Seek if drift exceeds this
  private readonly DRIFT_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds

  constructor(
    syncManager: ClockSyncManager,
    socket?: Socket,
    roomCode?: string,
    isDJ?: boolean,
  ) {
    this.syncManager = syncManager;
    this.socket = socket || null;
    this.roomCode = roomCode || null;
    this.isDJ = isDJ || false;
    this.initializePlayer();
  }

  /**
   * Update connection settings for queue notifications
   */
  public setConnectionSettings(socket: Socket, roomCode: string, isDJ: boolean): void {
    this.socket = socket;
    this.roomCode = roomCode;
    this.isDJ = isDJ;
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

    // Stop any ongoing drift correction and reset player for concurrent playback protection
    this.stopDriftCorrection();
    await TrackPlayer.reset();

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

    // Calculate current position from elapsed time (like reference implementation)
    const localStartTime = this.syncManager.serverTimeToLocal(startAtServerTime);
    const nowLocal = Date.now();
    const elapsedMs = nowLocal - localStartTime;
    const elapsedSeconds = elapsedMs / 1000;

    // Assume track started from position 0 (could be extracted from state if available)
    const startPosition = 0;
    const currentPositionCalculated = startPosition + elapsedSeconds;

    // Store metadata for drift correction
    this.currentTrackId = trackId;
    this.startedAtLocalTime = localStartTime;
    this.trackStartPosition = startPosition;

    // Seek and play
    await TrackPlayer.seekTo(currentPositionCalculated);
    await TrackPlayer.play();

    console.log(`[SyncedAudioPlayer] Playing from position ${currentPositionCalculated.toFixed(2)}s`);

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
   * Handle playback end event - notifies server when DJ finishes playing a song
   * This method should be called when the audio player finishes playing a track
   */
  public handlePlaybackEnd = (): void => {
    // Notify server that playback has ended (DJ only)
    if (this.socket && this.roomCode && this.isDJ) {
      console.log('[SyncedAudioPlayer] Notifying server of playback end');
      this.socket.emit('playback:ended', { roomCode: this.roomCode }, (response: any) => {
        if (response?.error) {
          console.error('[SyncedAudioPlayer] Error notifying playback end:', response.error);
        } else {
          console.log('[SyncedAudioPlayer] Playback end notification sent successfully');
        }
      });
    } else {
      console.log('[SyncedAudioPlayer] Skipping playback end notification (not DJ or no connection)');
    }
  };

  /**
   * Clean up when destroying
   */
  public destroy(): void {
    this.stopDriftCorrection();
  }
}
