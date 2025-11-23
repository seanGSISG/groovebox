import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RoomGateway } from './room.gateway';
import { SyncGateway } from './sync.gateway';
import { Room, RoomMember, User, Message, RoomDjHistory } from '../entities';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomMember, User, Message, RoomDjHistory]),
    RedisModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    {
      provide: 'RoomGateway',
      useClass: RoomGateway,
    },
    {
      provide: 'SyncGateway',
      useClass: SyncGateway,
    },
  ],
  exports: ['RoomGateway', 'SyncGateway'],
})
export class GatewayModule {}
