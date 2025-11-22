import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class JoinRoomDto {
  @IsString()
  @IsOptional()
  @MinLength(4)
  @MaxLength(50)
  password?: string;
}
