export class SongSubmissionDto {
  id: string;
  roomId: string;
  submittedBy: string;
  submitterUsername: string;
  submitterDisplayName: string;
  youtubeUrl: string;
  songTitle: string | null;
  artist: string | null;
  voteCount: number;
  hasVoted: boolean; // Has current user voted for this
  createdAt: Date;
}
