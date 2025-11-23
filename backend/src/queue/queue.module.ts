import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { SongSubmission, SongSubmissionVote } from '../entities';

@Module({
  imports: [TypeOrmModule.forFeature([SongSubmission, SongSubmissionVote])],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
