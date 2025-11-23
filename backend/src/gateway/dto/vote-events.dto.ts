import { IsUUID, IsBoolean } from 'class-validator';
import { VoteType } from '../../entities/vote.entity';

export class StartElectionDto {
  // No additional fields needed - initiated by any member
}

export class VoteForDjDto {
  @IsUUID()
  voteSessionId: string;

  @IsUUID()
  targetUserId: string;
}

export class StartMutinyDto {
  // No additional fields needed
}

export class VoteOnMutinyDto {
  @IsUUID()
  voteSessionId: string;

  @IsBoolean()
  voteValue: boolean; // true = yes, false = no
}

export class VoteResultsEventDto {
  voteSessionId: string;
  voteType: string;
  isComplete: boolean;
  voteCounts?: { [userId: string]: number };
  mutinyVotes?: { yes: number; no: number };
  totalVoters: number;
  winner?: string;
  mutinyPassed?: boolean;
}
