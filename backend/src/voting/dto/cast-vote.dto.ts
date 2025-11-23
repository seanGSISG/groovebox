import { IsUUID, IsBoolean } from 'class-validator';

export class CastVoteDto {
  @IsUUID()
  readonly voteSessionId: string;

  @IsBoolean()
  readonly voteFor: boolean; // true = for, false = against
}
