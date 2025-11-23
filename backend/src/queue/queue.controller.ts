import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueueService } from './queue.service';
import { QueueStateDto } from './dto';

@Controller('queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private queueService: QueueService) {}

  @Get(':roomCode')
  async getQueueState(
    @Param('roomCode') roomCode: string,
    @Request() req,
  ): Promise<QueueStateDto> {
    // Note: You'll need to get roomId from roomCode via RoomsService
    // For now, assuming roomCode is passed as roomId
    return this.queueService.getQueueState(roomCode, req.user.userId);
  }
}
