export enum VoteType {
  DJ_ELECTION = 'dj_election',
  MUTINY = 'mutiny',
}

export interface VoteCounts {
  [userId: string]: number;
}

export interface MutinyVoteCounts {
  yes: number;
  no: number;
}

export interface VoteSession {
  voteSessionId: string;
  voteType: VoteType;
  isComplete: boolean;
  totalVoters: number;
  voteCounts?: VoteCounts;
  mutinyVotes?: MutinyVoteCounts;
  threshold?: number;
  winner?: string;
  mutinyPassed?: boolean;
  initiatorId?: string;
  targetDjId?: string;
}

export interface RoomMember {
  userId: string;
  username: string;
  displayName: string;
  isOnline: boolean;
}

export interface MutinySuccessEvent {
  voteSessionId: string;
  newDjId: string;
  oldDjId: string;
  yesVotes: number;
  totalVoters: number;
}

export interface MutinyFailedEvent {
  voteSessionId: string;
  yesVotes: number;
  noVotes: number;
  totalVoters: number;
  threshold: number;
}
