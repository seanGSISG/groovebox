import { Module } from '@nestjs/common';
import { SyncGateway } from './sync.gateway';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [SyncGateway],
  exports: [SyncGateway],
})
export class SyncModule {}
