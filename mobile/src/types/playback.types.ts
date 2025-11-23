// YouTube playback event
export interface YouTubePlaybackStartEvent {
  youtubeVideoId: string;
  trackId: string;
  trackName: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number;
  startAtServerTime: number; // Unix timestamp (ms)
  serverTimestamp: number; // Current server time
  syncBufferMs?: number; // Optional sync buffer info
}

// TrackPlayer playback event (Spotify, local files, etc.)
export interface TrackPlayerPlaybackStartEvent {
  trackId: string;
  trackSource: string;
  startAtServerTime: number; // Unix timestamp (ms)
  startPosition: number; // Seconds
  serverTimestamp: number; // Current server time
  syncBufferMs?: number; // Optional sync buffer info
}

// Union type for all playback start events
export type PlaybackStartEvent = YouTubePlaybackStartEvent | TrackPlayerPlaybackStartEvent;

export interface RoomStatePlayback {
  playing: boolean;
  trackId: string | null;
  startAtServerTime: number | null;
  currentPosition: number | null; // milliseconds
  serverTimestamp: number;
}
