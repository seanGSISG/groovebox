import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { QueueEntry } from '../entities/queue-entry.entity';
import { Room } from '../entities/room.entity';
import { User } from '../entities/user.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RedisModule } from '../redis/redis.module';
import { YouTubeModule } from '../youtube/youtube.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([QueueEntry, Room, User, RoomMember]),
    RedisModule,
    YouTubeModule,
  ],
  controllers: [QueueController],
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
