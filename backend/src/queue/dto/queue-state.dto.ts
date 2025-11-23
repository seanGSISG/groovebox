import { SongSubmissionDto } from './song-submission.dto';

export class QueueStateDto {
  submissions: SongSubmissionDto[];
  totalSubmissions: number;
}
