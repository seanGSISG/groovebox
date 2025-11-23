import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RoomGateway } from './room.gateway';
import { Room, RoomMember, User, Message, RoomDjHistory } from '../entities';
import { RedisModule } from '../redis/redis.module';
import { PlaybackSyncService } from './services/playback-sync.service';
import { VotesModule } from '../votes/votes.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Room, RoomMember, User, Message, RoomDjHistory]),
    RedisModule,
    VotesModule,
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
    PlaybackSyncService,
  ],
  exports: ['RoomGateway'],
})
export class GatewayModule {}
