export class SongSubmissionDto {
  readonly id: string;
  readonly roomId: string;
  readonly submittedBy: string;
  readonly submitterUsername: string;
  readonly submitterDisplayName: string;
  readonly youtubeUrl: string;
  readonly songTitle: string | null;
  readonly artist: string | null;
  readonly voteCount: number;
  readonly hasVoted: boolean; // Has current user voted for this
  readonly createdAt: Date;
}
