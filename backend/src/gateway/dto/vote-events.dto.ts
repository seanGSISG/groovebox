import { IsUUID, IsEnum, IsOptional, IsBoolean } from 'class-validator';
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
