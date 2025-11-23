import { IsUUID } from 'class-validator';

export class VoteSubmissionDto {
  @IsUUID()
  submissionId: string;
}
