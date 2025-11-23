import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { YouTubeService } from './youtube.service';

@Module({
  imports: [HttpModule],
  providers: [YouTubeService],
  exports: [YouTubeService],
})
export class YouTubeModule {}
