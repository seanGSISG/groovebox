import { IsEnum, IsUUID, IsOptional, ValidateIf } from 'class-validator';
import { VoteType } from '../../entities/vote.entity';

export class StartVoteDto {
  @IsEnum(VoteType)
  readonly voteType: VoteType;

  @ValidateIf(o => o.voteType === VoteType.DJ_ELECTION)
  @IsUUID()
  readonly targetUserId?: string;
}
