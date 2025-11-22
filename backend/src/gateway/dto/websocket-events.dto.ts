import { IsString, IsNotEmpty, MaxLength, IsOptional, IsNumber, Min } from 'class-validator';

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

  // Response fields (not validated)
  startAtServerTime?: number;
  syncBufferMs?: number;
  serverTimestamp?: number;
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
