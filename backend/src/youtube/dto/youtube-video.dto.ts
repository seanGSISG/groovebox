export interface YouTubeVideoDto {
  videoId: string;
  url: string;
  title: string;
  artist: string; // Channel name
  thumbnailUrl: string;
  durationSeconds: number;
}

export interface YouTubeVideoDetailsDto {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnails: {
    default: { url: string; width: number; height: number };
    medium: { url: string; width: number; height: number };
    high: { url: string; width: number; height: number };
  };
  duration: string; // ISO 8601 format
  durationSeconds: number;
}
