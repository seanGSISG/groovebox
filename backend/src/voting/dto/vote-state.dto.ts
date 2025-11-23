import { VoteType } from '../../entities/vote.entity';

export class VoteStateDto {
  readonly voteSessionId: string;
  readonly voteType: VoteType;
  readonly targetUserId: string | null;
  readonly targetUsername: string | null;
  readonly votesFor: number;
  readonly votesAgainst: number;
  readonly totalEligibleVoters: number;
  readonly requiredVotes: number;
  readonly threshold: number;
  readonly isActive: boolean;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly passed: boolean | null;
}
