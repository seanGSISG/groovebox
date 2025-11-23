import { SongSubmissionDto } from './song-submission.dto';

export class QueueStateDto {
  readonly submissions: SongSubmissionDto[];
  readonly totalSubmissions: number;
}
