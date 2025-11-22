import { IsString, IsNotEmpty, MinLength, MaxLength, IsOptional, ValidateNested, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class RoomSettingsDto {
  @IsNumber()
  @IsOptional()
  @Min(2)
  @Max(100)
  maxMembers?: number;

  @IsNumber()
  @IsOptional()
  @Min(0.5)
  @Max(1)
  mutinyThreshold?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(60)
  djCooldownMinutes?: number;

  @IsBoolean()
  @IsOptional()
  autoRandomizeDJ?: boolean;
}

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  roomName: string;

  @IsString()
  @IsOptional()
  @MinLength(4)
  @MaxLength(50)
  password?: string;

  @ValidateNested()
  @Type(() => RoomSettingsDto)
  @IsOptional()
  settings?: RoomSettingsDto;
}
