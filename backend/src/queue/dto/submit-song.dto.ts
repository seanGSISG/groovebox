import { IsString, IsUrl, Matches, IsOptional, MaxLength } from 'class-validator';

export class SubmitSongDto {
  @IsString()
  @IsUrl()
  @Matches(/^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]{11}(\?.*)?$/, {
    message: 'Must be a valid YouTube URL',
  })
  youtubeUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  songTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  artist?: string;
}
