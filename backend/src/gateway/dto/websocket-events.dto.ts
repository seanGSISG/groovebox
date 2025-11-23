import { IsString, IsNotEmpty, MaxLength, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class RoomJoinDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;
}

export class RoomLeaveDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;
}

export class ChatMessageDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, { message: 'Message content must not exceed 2000 characters' })
  content: string;
}

export class PlaybackStartDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;

  @IsString()
  @IsNotEmpty()
  trackId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  position?: number;
}

export class PlaybackPauseDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  position?: number;
}

export class PlaybackStopDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;
}

export class SyncPingDto {
  @IsNumber()
  @Min(0)
  clientTimestamp: number;
}

export class SyncPongDto {
  @IsNumber()
  @Min(0)
  clientTimestamp: number;

  @IsNumber()
  @Min(0)
  serverReceiveTime: number;  // T2 - Server time when request received

  @IsNumber()
  @Min(0)
  serverTimestamp: number;  // T3 - Server time when response sent

  @IsOptional()
  @IsNumber()
  @Min(0)
  serverProcessTime?: number;
}

export class SyncUpdateDto {
  @IsNumber()
  @Min(-3600000)
  @Max(3600000)
  offset: number;

  @IsNumber()
  @Min(0)
  @Max(10000)
  rtt: number;
}
