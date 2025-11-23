import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { AddToQueueDto, QueueEntryDto, QueueStateDto } from './dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('rooms/:roomCode/queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  /**
   * Get queue state for a room
   */
  @Get()
  async getQueue(
    @Param('roomCode') roomCode: string,
    @Request() req,
  ): Promise<QueueStateDto> {
    return this.queueService.getQueueForRoom(roomCode, req.user.userId);
  }

  /**
   * Add a song to the queue
   */
  @Post()
  async addToQueue(
    @Param('roomCode') roomCode: string,
    @Body() dto: AddToQueueDto,
    @Request() req,
  ): Promise<QueueEntryDto> {
    return this.queueService.addToQueue(roomCode, req.user.userId, dto);
  }

  /**
   * Upvote a queue entry
   */
  @Post(':entryId/upvote')
  async upvote(
    @Param('roomCode') roomCode: string,
    @Param('entryId') entryId: string,
    @Request() req,
  ): Promise<QueueEntryDto> {
    return this.queueService.upvoteEntry(roomCode, entryId, req.user.userId);
  }

  /**
   * Downvote a queue entry
   */
  @Post(':entryId/downvote')
  async downvote(
    @Param('roomCode') roomCode: string,
    @Param('entryId') entryId: string,
    @Request() req,
  ): Promise<QueueEntryDto> {
    return this.queueService.downvoteEntry(roomCode, entryId, req.user.userId);
  }

  /**
   * Remove a queue entry
   */
  @Delete(':entryId')
  async removeFromQueue(
    @Param('roomCode') roomCode: string,
    @Param('entryId') entryId: string,
    @Request() req,
  ): Promise<{ message: string }> {
    return this.queueService.removeFromQueue(roomCode, entryId, req.user.userId);
  }
}
