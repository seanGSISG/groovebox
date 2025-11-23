import { IsString, IsNotEmpty, IsUrl, Matches } from 'class-validator';

export class AddToQueueEventDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;

  @IsUrl()
  @Matches(
    /youtube\.com|youtu\.be/,
    { message: 'Must be a YouTube URL' }
  )
  youtubeUrl: string;
}

export class VoteQueueEntryDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;

  @IsString()
  @IsNotEmpty()
  entryId: string;
}

export class RemoveFromQueueDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;

  @IsString()
  @IsNotEmpty()
  entryId: string;
}

export class GetQueueDto {
  @IsString()
  @IsNotEmpty()
  roomCode: string;
}
