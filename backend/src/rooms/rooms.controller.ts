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
} from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, JoinRoomDto, RoomDetailsDto, RoomMemberDto, UserRoomDto } from './dto';
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
}
