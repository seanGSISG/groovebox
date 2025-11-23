import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, JoinRoomDto, RoomDetailsDto, RoomMemberDto, UserRoomDto } from './dto';
import { MessageDto, SetDjDto } from './dto/message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  /**
   * POST /rooms - Create a new room
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRoom(
    @Request() req,
    @Body() createRoomDto: CreateRoomDto,
  ): Promise<RoomDetailsDto> {
    return this.roomsService.createRoom(req.user.id, createRoomDto);
  }

  /**
   * POST /rooms/:code/join - Join a room
   */
  @Post(':code/join')
  @HttpCode(HttpStatus.OK)
  async joinRoom(
    @Request() req,
    @Param('code') code: string,
    @Body() joinRoomDto: JoinRoomDto,
  ): Promise<{ room: RoomDetailsDto; member: RoomMemberDto }> {
    return this.roomsService.joinRoom(req.user.id, code.toUpperCase(), joinRoomDto);
  }

  /**
   * POST /rooms/:code/leave - Leave a room
   */
  @Post(':code/leave')
  @HttpCode(HttpStatus.OK)
  async leaveRoom(
    @Request() req,
    @Param('code') code: string,
  ): Promise<{ message: string }> {
    return this.roomsService.leaveRoom(req.user.id, code.toUpperCase());
  }

  /**
   * GET /rooms/my-rooms - Get all rooms where user is a member
   */
  @Get('my-rooms')
  @HttpCode(HttpStatus.OK)
  async getMyRooms(@Request() req): Promise<UserRoomDto[]> {
    return this.roomsService.getMyRooms(req.user.id);
  }

  /**
   * GET /rooms/:code - Get room details
   */
  @Get(':code')
  @HttpCode(HttpStatus.OK)
  async getRoomDetails(
    @Request() req,
    @Param('code') code: string,
  ): Promise<RoomDetailsDto> {
    return this.roomsService.getRoomDetails(req.user.id, code.toUpperCase());
  }

  /**
   * GET /rooms/:code/messages - Get recent messages
   */
  @Get(':code/messages')
  @HttpCode(HttpStatus.OK)
  async getMessages(
    @Request() req,
    @Param('code') code: string,
    @Query('limit') limit?: number,
  ): Promise<MessageDto[]> {
    const messageLimit = limit ? Math.min(limit, 100) : 50;
    return this.roomsService.getMessages(req.user.id, code.toUpperCase(), messageLimit);
  }

  /**
   * POST /rooms/:code/set-dj - Set the current DJ (owner only)
   */
  @Post(':code/set-dj')
  @HttpCode(HttpStatus.OK)
  async setDj(
    @Request() req,
    @Param('code') code: string,
    @Body() setDjDto: SetDjDto,
  ): Promise<{ success: boolean; djId: string }> {
    return this.roomsService.setDj(req.user.id, code.toUpperCase(), setDjDto);
  }

  /**
   * POST /rooms/:code/randomize-dj - Randomly select a DJ (owner or current DJ only)
   */
  @Post(':code/randomize-dj')
  @HttpCode(HttpStatus.OK)
  async randomizeDj(
    @Request() req,
    @Param('code') code: string,
  ): Promise<{ newDjId: string }> {
    const userId = req.user.id;
    const room = await this.roomsService.getRoomByCode(code.toUpperCase());

    // Verify user is owner or current DJ
    if (room.ownerId !== userId) {
      const currentDj = await this.roomsService.getCurrentDj(room.id);
      if (!currentDj || currentDj.userId !== userId) {
        throw new ForbiddenException('Only room owner or current DJ can randomize DJ');
      }
    }

    const djHistory = await this.roomsService.randomizeDj(room.id);

    return {
      newDjId: djHistory.userId,
    };
  }
}
