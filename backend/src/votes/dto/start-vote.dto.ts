import { IsEnum, IsUUID, IsOptional } from 'class-validator';
import { VoteType } from '../../entities/vote.entity';

export class StartVoteDto {
  @IsEnum(VoteType)
  voteType: VoteType;

  @IsUUID()
  @IsOptional()
  targetUserId?: string; // For DJ_ELECTION, the user being voted for
}
