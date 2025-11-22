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
