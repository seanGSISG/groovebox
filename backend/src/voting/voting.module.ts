import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VotingService } from './voting.service';
import { Vote, Room, RoomMember, RoomDjHistory, User } from '../entities';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vote, Room, RoomMember, RoomDjHistory, User]),
    RedisModule,
  ],
  providers: [VotingService],
  exports: [VotingService],
})
export class VotingModule {}
