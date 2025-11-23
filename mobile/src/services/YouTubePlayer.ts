import { ClockSyncManager } from './ClockSyncManager';

export interface YouTubePlayerInterface {
  loadVideoById(videoId: string, startSeconds?: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  getPlayerState(): Promise<number>;
}

export class YouTubePlayer {
  private playerRef: YouTubePlayerInterface | null = null;
  private syncManager: ClockSyncManager;
  private syncCheckInterval: NodeJS.Timeout | null = null;
  private scheduledPlaybackTimeout: NodeJS.Timeout | null = null;
  private currentVideoId: string | null = null;
  private startAtServerTime: number | null = null;
  private durationSeconds: number = 0;

  // Timing constants
  private readonly FUTURE_START_THRESHOLD_MS = 100;
  private readonly PAST_START_THRESHOLD_MS = -500;
  private readonly DRIFT_CHECK_INTERVAL_MS = 5000;
  private readonly DRIFT_CORRECTION_THRESHOLD_MS = 200;

  constructor(syncManager: ClockSyncManager) {
    this.syncManager = syncManager;
  }

  /**
   * Set player reference (from YouTube component)
   */
  setPlayerRef(playerRef: YouTubePlayerInterface): void {
    this.playerRef = playerRef;
    console.log('[YouTubePlayer] Player reference set');
  }

  /**
   * Handle playback start with synchronized timing
   */
  async handlePlaybackStart(event: {
    youtubeVideoId: string;
    trackId: string;
    trackName: string;
    artist: string;
    thumbnailUrl: string;
    durationSeconds: number;
    startAtServerTime: number;
    serverTimestamp: number;
  }): Promise<void> {
    if (!this.playerRef) {
      console.error('[YouTubePlayer] Player ref not set');
      return;
    }

    try {
      console.log('[YouTubePlayer] Handling playback start:', event.trackName);

      // Validate inputs before setting state
      if (event.durationSeconds <= 0) {
        throw new Error(`Invalid duration: ${event.durationSeconds}`);
      }

      // Stop any ongoing drift correction and scheduled playback
      this.stopDriftCorrection();
      if (this.scheduledPlaybackTimeout) {
        clearTimeout(this.scheduledPlaybackTimeout);
        this.scheduledPlaybackTimeout = null;
      }

      // Convert server time to local time
      const localStartTime = this.syncManager.serverTimeToLocal(
        event.startAtServerTime,
      );
      const nowLocal = Date.now();
      const delayMs = localStartTime - nowLocal;

      console.log(`[YouTubePlayer] Server start: ${event.startAtServerTime}`);
      console.log(`[YouTubePlayer] Local start: ${localStartTime}`);
      console.log(`[YouTubePlayer] Delay: ${delayMs}ms`);

      if (delayMs > this.FUTURE_START_THRESHOLD_MS) {
        // Future start - load video and schedule playback
        console.log(
          `[YouTubePlayer] Scheduling playback in ${delayMs}ms (future start)`,
        );
        this.playerRef.loadVideoById(event.youtubeVideoId, 0);

        // Store video metadata AFTER validation and successful load
        this.currentVideoId = event.youtubeVideoId;
        this.startAtServerTime = event.startAtServerTime;
        this.durationSeconds = event.durationSeconds;

        this.scheduledPlaybackTimeout = setTimeout(() => {
          // Check if this is still the current video
          if (this.playerRef && this.currentVideoId === event.youtubeVideoId) {
            this.playerRef.playVideo();
            this.startDriftCorrection();
          }
          this.scheduledPlaybackTimeout = null;
        }, delayMs);
      } else if (delayMs < this.PAST_START_THRESHOLD_MS) {
        // Past start - calculate catch-up position
        const elapsedMs = Math.abs(delayMs);
        const startSeconds = elapsedMs / 1000;

        console.log(
          `[YouTubePlayer] Catching up, starting at ${startSeconds.toFixed(3)}s (past start)`,
        );

        if (startSeconds < event.durationSeconds) {
          this.playerRef.loadVideoById(event.youtubeVideoId, startSeconds);
          this.playerRef.playVideo();

          // Store video metadata AFTER validation and successful load
          this.currentVideoId = event.youtubeVideoId;
          this.startAtServerTime = event.startAtServerTime;
          this.durationSeconds = event.durationSeconds;

          this.startDriftCorrection();
        } else {
          // Song already finished
          console.log('[YouTubePlayer] Song already finished, not playing');
          return;
        }
      } else {
        // Start immediately
        console.log('[YouTubePlayer] Starting playback immediately');
        this.playerRef.loadVideoById(event.youtubeVideoId, 0);
        this.playerRef.playVideo();

        // Store video metadata AFTER validation and successful load
        this.currentVideoId = event.youtubeVideoId;
        this.startAtServerTime = event.startAtServerTime;
        this.durationSeconds = event.durationSeconds;

        this.startDriftCorrection();
      }
    } catch (error) {
      // Reset state on error
      this.currentVideoId = null;
      this.startAtServerTime = null;
      this.durationSeconds = 0;
      this.stopDriftCorrection();

      console.error(
        '[YouTubePlayer] Playback start error:',
        error,
        error instanceof Error ? error.stack : 'No stack trace',
      );
      // Re-throw to notify caller
      throw error;
    }
  }

  /**
   * Handle playback pause
   */
  async handlePlaybackPause(): Promise<void> {
    if (!this.playerRef) {
      return;
    }

    try {
      this.playerRef.pauseVideo();
      this.stopDriftCorrection();
      console.log('[YouTubePlayer] Playback paused');
    } catch (error) {
      console.error(
        '[YouTubePlayer] Pause error:',
        error,
        error instanceof Error ? error.stack : 'No stack trace',
      );
    }
  }

  /**
   * Handle playback stop
   */
  async handlePlaybackStop(): Promise<void> {
    if (!this.playerRef) {
      return;
    }

    try {
      this.playerRef.pauseVideo();
      this.stopDriftCorrection();
      this.currentVideoId = null;
      this.startAtServerTime = null;
      console.log('[YouTubePlayer] Playback stopped');
    } catch (error) {
      console.error(
        '[YouTubePlayer] Stop error:',
        error,
        error instanceof Error ? error.stack : 'No stack trace',
      );
    }
  }

  /**
   * Start drift correction loop
   */
  private startDriftCorrection(): void {
    this.stopDriftCorrection();

    this.syncCheckInterval = setInterval(async () => {
      await this.checkAndCorrectDrift();
    }, this.DRIFT_CHECK_INTERVAL_MS);

    console.log('[YouTubePlayer] Drift correction started');
  }

  /**
   * Stop drift correction loop
   */
  private stopDriftCorrection(): void {
    if (this.syncCheckInterval) {
      clearInterval(this.syncCheckInterval);
      this.syncCheckInterval = null;
      console.log('[YouTubePlayer] Drift correction stopped');
    }
  }

  /**
   * Check and correct drift if necessary
   */
  private async checkAndCorrectDrift(): Promise<void> {
    if (!this.playerRef || !this.startAtServerTime) {
      return;
    }

    try {
      // Check player state (1 = playing)
      const playerState = await this.playerRef.getPlayerState();
      if (playerState !== 1) {
        console.log('[YouTubePlayer] Player not playing, skipping drift correction');
        return;
      }

      // Get current playback position from YouTube player
      const actualPositionSeconds = await this.playerRef.getCurrentTime();

      // Calculate expected position using server time
      const nowLocal = Date.now();
      const serverNow = this.syncManager.localTimeToServer(nowLocal);
      const expectedPositionSeconds =
        (serverNow - this.startAtServerTime) / 1000;

      const driftSeconds = actualPositionSeconds - expectedPositionSeconds;
      const driftMs = driftSeconds * 1000;

      console.log(
        `[YouTubePlayer] Drift check: expected=${expectedPositionSeconds.toFixed(3)}s, actual=${actualPositionSeconds.toFixed(3)}s, drift=${driftMs.toFixed(2)}ms`,
      );

      // Correct if drift exceeds threshold
      if (Math.abs(driftMs) > this.DRIFT_CORRECTION_THRESHOLD_MS) {
        // Clamp position to valid range
        const clampedPosition = Math.max(0, Math.min(expectedPositionSeconds, this.durationSeconds));

        if (clampedPosition !== expectedPositionSeconds) {
          console.warn(
            `[YouTubePlayer] Seek position out of bounds: expected=${expectedPositionSeconds.toFixed(3)}s, clamped=${clampedPosition.toFixed(3)}s, duration=${this.durationSeconds}s`,
          );
        }

        console.log(
          `[YouTubePlayer] Correcting drift: ${driftMs.toFixed(2)}ms, seeking to ${clampedPosition.toFixed(3)}s`,
        );
        this.playerRef.seekTo(clampedPosition, true);
      }
    } catch (error) {
      console.error(
        '[YouTubePlayer] Drift check error:',
        error,
        error instanceof Error ? error.stack : 'No stack trace',
      );
    }
  }

  /**
   * Cleanup when destroying
   */
  destroy(): void {
    this.stopDriftCorrection();
    if (this.scheduledPlaybackTimeout) {
      clearTimeout(this.scheduledPlaybackTimeout);
      this.scheduledPlaybackTimeout = null;
    }
    this.playerRef = null;
    this.currentVideoId = null;
    this.startAtServerTime = null;
    console.log('[YouTubePlayer] Destroyed');
  }
}
