import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { User } from '../entities/user.entity';
import { Message } from '../entities/message.entity';
import { RoomDjHistory } from '../entities/room-dj-history.entity';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { RedisModule } from '../redis/redis.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomMember, User, Message, RoomDjHistory]),
    RedisModule,
    forwardRef(() => GatewayModule),
  ],
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
