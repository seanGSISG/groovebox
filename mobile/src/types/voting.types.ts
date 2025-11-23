export enum VoteType {
  DJ_ELECTION = 'dj_election',
  MUTINY = 'mutiny',
}

export interface VoteState {
  voteSessionId: string;
  voteType: VoteType;
  targetUserId: string | null;
  targetUsername: string | null;
  votesFor: number;
  votesAgainst: number;
  totalEligibleVoters: number;
  requiredVotes: number;
  threshold: number;
  isActive: boolean;
  startedAt: Date;
  endedAt: Date | null;
  passed: boolean | null;
}

export interface StartVotePayload {
  roomCode: string;
  voteType: VoteType;
  targetUserId?: string;
}

export interface CastVotePayload {
  roomCode: string;
  voteSessionId: string;
  voteFor: boolean;
}
