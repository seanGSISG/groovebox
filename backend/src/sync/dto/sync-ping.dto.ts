import { IsNumber } from 'class-validator';

export class SyncPingDto {
  @IsNumber()
  clientTimestamp: number;
}
