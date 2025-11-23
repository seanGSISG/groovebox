import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueueService } from './queue.service';
import { QueueStateDto } from './dto';
import { Room, RoomMember } from '../entities';

@Controller('queue')
@UseGuards(JwtAuthGuard)
export class QueueController {
  constructor(
    private queueService: QueueService,
    @InjectRepository(Room)
    private roomRepository: Repository<Room>,
    @InjectRepository(RoomMember)
    private roomMemberRepository: Repository<RoomMember>,
  ) {}

  @Get(':roomCode')
  async getQueueState(
    @Param('roomCode') roomCode: string,
    @Request() req,
  ): Promise<QueueStateDto> {
    // Look up room by roomCode
    const room = await this.roomRepository.findOne({
      where: { roomCode },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify user is a member of the room
    const membership = await this.roomMemberRepository.findOne({
      where: {
        roomId: room.id,
        userId: req.user.userId,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You are not a member of this room');
    }

    // Pass room.id (UUID) to queueService.getQueueState()
    return this.queueService.getQueueState(room.id, req.user.userId);
  }
}
