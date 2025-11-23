export interface QueueEntry {
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
  netScore: number; // upvotes - downvotes
  userVote: 'up' | 'down' | null; // Current user's vote
  isPlayed: boolean;
  createdAt: string; // ISO 8601 string from server
}

export interface QueueState {
  entries: QueueEntry[]; // Sorted by netScore desc
  currentlyPlaying: QueueEntry | null;
  totalEntries: number;
}
