export interface SongSubmission {
  id: string;
  roomId: string;
  submittedBy: string;
  submitterUsername: string;
  submitterDisplayName: string;
  youtubeUrl: string;
  songTitle: string | null;
  artist: string | null;
  voteCount: number;
  hasVoted: boolean;
  createdAt: Date;
}

export interface QueueState {
  submissions: SongSubmission[];
  totalSubmissions: number;
}

export interface SubmitSongPayload {
  roomCode: string;
  youtubeUrl: string;
  songTitle?: string;
  artist?: string;
}

export interface VotePayload {
  roomCode: string;
  submissionId: string;
}

export interface AutoPlayPayload {
  submission: {
    id: string;
    youtubeUrl: string;
    songTitle: string | null;
    artist: string | null;
    submittedBy: string;
  };
}
