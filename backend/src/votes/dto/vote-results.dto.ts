export interface VoteCounts {
  [userId: string]: number; // For DJ_ELECTION
}

export interface MutinyVoteCounts {
  yes: number;
  no: number;
}

export class VoteResultsDto {
  voteSessionId: string;
  voteType: string;
  isComplete: boolean;
  voteCounts?: VoteCounts; // For DJ_ELECTION
  mutinyVotes?: MutinyVoteCounts; // For MUTINY
  totalVoters: number;
  threshold?: number; // For MUTINY
  winner?: string; // userId of winner (DJ_ELECTION)
  mutinyPassed?: boolean; // For MUTINY
}
