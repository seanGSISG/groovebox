import { IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class CastVoteDto {
  @IsUUID()
  voteSessionId: string;

  @IsUUID()
  @IsOptional()
  targetUserId?: string; // For DJ_ELECTION

  @IsBoolean()
  @IsOptional()
  voteValue?: boolean; // For MUTINY (true=yes, false=no)
}
