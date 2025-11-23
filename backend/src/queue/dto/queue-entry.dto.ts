export interface QueueEntryDto {
  id: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  artist: string;
  thumbnailUrl: string;
  durationSeconds: number;
  addedBy: {
    id: string;
    username: string;
    displayName: string;
  };
  upvoteCount: number;
  downvoteCount: number;
  netScore: number;
  userVote: 'up' | 'down' | null;
  isPlayed: boolean;
  createdAt: Date;
}

export interface QueueStateDto {
  entries: QueueEntryDto[];
  currentlyPlaying: QueueEntryDto | null;
  totalEntries: number;
}
