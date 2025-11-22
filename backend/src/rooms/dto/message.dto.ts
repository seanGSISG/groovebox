import { IsString, IsNotEmpty, IsUUID, IsDate } from 'class-validator';

export class MessageDto {
  @IsUUID()
  id: string;

  @IsUUID()
  roomId: string;

  @IsUUID()
  userId: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  displayName: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsDate()
  createdAt: Date;
}

export class SetDjDto {
  @IsUUID()
  userId: string;
}
