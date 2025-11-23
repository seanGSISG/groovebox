import { IsString, IsUrl, Matches } from 'class-validator';

export class AddToQueueDto {
  @IsString()
  @IsUrl()
  @Matches(
    /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/,
    { message: 'Must be a valid YouTube URL' }
  )
  youtubeUrl: string;
}
