import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { SongSubmission, SongSubmissionVote, Room, RoomMember } from '../entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SongSubmission,
      SongSubmissionVote,
      Room,
      RoomMember,
    ]),
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
