import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards, UsePipes, ValidationPipe, Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room, RoomMember, User, Message, RoomDjHistory, RoomMemberRole, RemovalReason } from '../entities';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';
import { WsJwtGuard } from './ws-jwt.guard';
import {
  RoomJoinDto,
  RoomLeaveDto,
  ChatMessageDto,
  PlaybackStartDto,
  PlaybackPauseDto,
  PlaybackStopDto,
  PlaybackStartEventDto,
  PlaybackPauseEventDto,
  PlaybackStopEventDto,
  PlaybackSyncEventDto,
} from './dto/websocket-events.dto';
import xss from 'xss';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    username: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:19006', 'http://localhost:19000'],
    credentials: true,
  },
})
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomGateway.name);
  private syncIntervals = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => RoomsService))
    private readonly roomsService: RoomsService,
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    @InjectRepository(RoomMember)
    private readonly roomMemberRepository: Repository<RoomMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(RoomDjHistory)
    private readonly roomDjHistoryRepository: Repository<RoomDjHistory>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // SECURITY: Only accept tokens from auth or authorization header (not query params)
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Validate JWT token
      const payload = await this.jwtService.verifyAsync(token);

      if (!payload || !payload.sub) {
        this.logger.warn(`Connection rejected: Invalid token`);
        client.disconnect();
        return;
      }

      // Verify user exists
      const user = await this.userRepository.findOne({ where: { id: payload.sub } });
      if (!user) {
        this.logger.warn(`Connection rejected: User not found for id ${payload.sub}`);
        client.disconnect();
        return;
      }

      // Attach user to socket.data
      (client as AuthenticatedSocket).data = {
        userId: user.id,
        username: user.username,
      };

      this.logger.log(`Client connected: ${client.id} (User: ${user.username})`);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    const userId = client.data?.userId;
    const username = client.data?.username;

    if (userId) {
      this.logger.log(`Client disconnected: ${client.id} (User: ${username})`);

      // Clean up any Redis state if needed
      // For now, we'll keep room state persistent
      // Future: Add timeout-based cleanup for inactive users
    } else {
      this.logger.log(`Client disconnected: ${client.id} (Unauthenticated)`);
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: RoomJoinDto,
  ) {
    try {
      const { roomCode } = data;
      const userId = client.data.userId;

      // Find room
      const room = await this.roomRepository.findOne({ where: { roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is a member
      const member = await this.roomMemberRepository.findOne({
        where: { roomId: room.id, userId },
        relations: ['user'],
      });

      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      // Join the Socket.io room
      await client.join(`room:${room.id}`);

      // Add socket to room membership set for RTT tracking
      await this.redisService.addSocketToRoom(room.id, client.id);

      this.logger.log(`User ${client.data.username} joined room ${roomCode}`);

      // Broadcast to other room members
      client.to(`room:${room.id}`).emit('room:user-joined', {
        userId,
        username: member.user.username,
        displayName: member.user.displayName,
      });

      return { success: true, roomId: room.id };
    } catch (error) {
      this.logger.error(`Error joining room: ${error.message}`);
      return { error: 'Failed to join room' };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: RoomLeaveDto,
  ) {
    try {
      const { roomCode } = data;
      const userId = client.data.userId;

      // Find room
      const room = await this.roomRepository.findOne({ where: { roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Leave the Socket.io room
      await client.leave(`room:${room.id}`);

      // Remove socket from room membership set
      await this.redisService.removeSocketFromRoom(room.id, client.id);

      this.logger.log(`User ${client.data.username} left room ${roomCode}`);

      // Broadcast to other room members
      client.to(`room:${room.id}`).emit('room:user-left', {
        userId,
        username: client.data.username,
      });

      return { success: true };
    } catch (error) {
      this.logger.error(`Error leaving room: ${error.message}`);
      return { error: 'Failed to leave room' };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('chat:message')
  async handleChatMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: ChatMessageDto,
  ) {
    try {
      const { roomCode, content } = data;
      const userId = client.data.userId;

      // Find room
      const room = await this.roomRepository.findOne({ where: { roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is a member
      const member = await this.roomMemberRepository.findOne({
        where: { roomId: room.id, userId },
        relations: ['user'],
      });

      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      // SECURITY: Sanitize message content to prevent XSS attacks
      const sanitizedContent = xss(content.trim());

      // Store sanitized message in database
      const message = this.messageRepository.create({
        roomId: room.id,
        userId,
        content: sanitizedContent,
      });

      await this.messageRepository.save(message);

      // Broadcast message to all room members
      const messagePayload = {
        id: message.id,
        roomId: room.id,
        userId,
        username: member.user.username,
        displayName: member.user.displayName,
        content: message.content,
        createdAt: message.createdAt,
      };

      this.server.to(`room:${room.id}`).emit('chat:message', messagePayload);

      return { success: true, message: messagePayload };
    } catch (error) {
      this.logger.error(`Error sending chat message: ${error.message}`);
      return { error: 'Failed to send message' };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('playback:start')
  async handlePlaybackStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: PlaybackStartDto,
  ) {
    try {
      const { roomCode, trackId, position = 0, trackDuration } = data;
      const userId = client.data.userId;

      // Find room
      const room = await this.roomRepository.findOne({ where: { roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is the current DJ
      const currentDjId = await this.redisService.getCurrentDj(room.id);
      if (currentDjId !== userId) {
        return { error: 'Only the current DJ can start playback' };
      }

      // Calculate adaptive sync buffer based on room RTT
      const syncBuffer = await this.roomsService.calculateSyncBuffer(room.id);

      // Calculate future start time
      const now = Date.now();
      const startAtServerTime = now + syncBuffer;

      // Update Redis room state with enhanced playback data
      await this.redisService.setPlaybackState(
        room.id,
        'playing',
        trackId,
        position,
        startAtServerTime,
        trackDuration,
        syncBuffer,
      );

      // Broadcast to all room members with timing metadata
      const payload: PlaybackStartEventDto = {
        roomId: room.id,
        trackId,
        position,
        startAtServerTime,
        trackDuration,
        syncBuffer,
        serverTimestamp: now,
      };

      this.server.to(`room:${room.id}`).emit('playback:start', payload);

      // Start periodic sync broadcasts
      this.startPeriodicSync(room.id);

      this.logger.log(
        `Playback started in room ${roomCode} by ${client.data.username} ` +
        `(syncBuffer: ${syncBuffer}ms, startAt: ${startAtServerTime})`,
      );

      return { success: true, ...payload };
    } catch (error) {
      this.logger.error(`Error starting playback: ${error.message}`);
      return { error: 'Failed to start playback' };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('playback:pause')
  async handlePlaybackPause(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: PlaybackPauseDto,
  ) {
    try {
      const { roomCode, position = 0 } = data;
      const userId = client.data.userId;

      // Find room
      const room = await this.roomRepository.findOne({ where: { roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is the current DJ
      const currentDjId = await this.redisService.getCurrentDj(room.id);
      if (currentDjId !== userId) {
        return { error: 'Only the current DJ can pause playback' };
      }

      // Update Redis room state with paused position
      await this.redisService.setPlaybackState(room.id, 'paused', undefined, position);

      // Also store the position separately for easy retrieval
      await this.redisService.setPlaybackPosition(room.id, position);

      // Broadcast to all room members with server timestamp
      const serverTimestamp = Date.now();
      const payload: PlaybackPauseEventDto = {
        roomId: room.id,
        position,
        serverTimestamp,
      };

      this.server.to(`room:${room.id}`).emit('playback:pause', payload);

      // Stop periodic sync broadcasts
      this.stopPeriodicSync(room.id);

      this.logger.log(`Playback paused in room ${roomCode} by ${client.data.username} at position ${position}ms`);

      return { success: true, ...payload };
    } catch (error) {
      this.logger.error(`Error pausing playback: ${error.message}`);
      return { error: 'Failed to pause playback' };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('playback:stop')
  async handlePlaybackStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: PlaybackStopDto,
  ) {
    try {
      const { roomCode } = data;
      const userId = client.data.userId;

      // Find room
      const room = await this.roomRepository.findOne({ where: { roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is the current DJ
      const currentDjId = await this.redisService.getCurrentDj(room.id);
      if (currentDjId !== userId) {
        return { error: 'Only the current DJ can stop playback' };
      }

      // Update Redis room state
      await this.redisService.setPlaybackState(room.id, 'stopped');

      // Broadcast to all room members with server timestamp
      const serverTimestamp = Date.now();
      const payload: PlaybackStopEventDto = {
        roomId: room.id,
        serverTimestamp,
      };

      this.server.to(`room:${room.id}`).emit('playback:stop', payload);

      // Stop periodic sync broadcasts
      this.stopPeriodicSync(room.id);

      this.logger.log(`Playback stopped in room ${roomCode} by ${client.data.username}`);

      return { success: true, ...payload };
    } catch (error) {
      this.logger.error(`Error stopping playback: ${error.message}`);
      return { error: 'Failed to stop playback' };
    }
  }

  /**
   * Broadcasts current playback state to all room members for drift correction
   */
  private async broadcastPlaybackSync(roomId: string): Promise<void> {
    try {
      // Retrieve playback state from Redis
      const playbackState = await this.redisService.getPlaybackState(roomId);

      // Only broadcast if actively playing
      if (playbackState.playbackState !== 'playing') {
        this.logger.debug(`Stopping sync broadcast for room ${roomId}: not playing`);
        this.stopPeriodicSync(roomId);
        return;
      }

      // Ensure we have all required data
      if (!playbackState.trackId || !playbackState.startAtServerTime || !playbackState.trackDuration) {
        this.logger.warn(`Missing playback data for room ${roomId}, stopping sync`);
        this.stopPeriodicSync(roomId);
        return;
      }

      // Calculate theoretical current position
      const now = Date.now();
      const elapsedMs = now - playbackState.startAtServerTime;
      const position = (playbackState.position || 0) + elapsedMs;

      // Check if track has ended
      if (position >= playbackState.trackDuration) {
        this.logger.log(`Track ended in room ${roomId}, stopping sync and emitting track:ended`);
        this.stopPeriodicSync(roomId);

        // Emit track:ended event
        this.server.to(`room:${roomId}`).emit('track:ended', {
          roomId,
          trackId: playbackState.trackId,
          serverTimestamp: now,
        });

        // Update playback state to stopped
        await this.redisService.setPlaybackState(roomId, 'stopped');
        return;
      }

      // Broadcast sync event to all room members
      const payload: PlaybackSyncEventDto = {
        roomId,
        trackId: playbackState.trackId,
        position,
        serverTimestamp: now,
        startAtServerTime: playbackState.startAtServerTime,
      };

      this.server.to(`room:${roomId}`).emit('playback:sync', payload);

      this.logger.debug(
        `Broadcasted sync for room ${roomId}: position=${position}ms, elapsed=${elapsedMs}ms`,
      );
    } catch (error) {
      this.logger.error(`Error broadcasting playback sync for room ${roomId}: ${error.message}`);
      // Don't stop the interval on transient errors, but log them
    }
  }

  /**
   * Starts periodic sync broadcasts for a room (every 10 seconds)
   */
  private startPeriodicSync(roomId: string): void {
    // Clear any existing interval
    this.stopPeriodicSync(roomId);

    this.logger.log(`Starting periodic sync for room ${roomId}`);

    // Create new interval (broadcast every 10 seconds)
    const interval = setInterval(() => {
      this.broadcastPlaybackSync(roomId);
    }, 10000);

    this.syncIntervals.set(roomId, interval);

    // Also broadcast immediately to give clients initial sync
    this.broadcastPlaybackSync(roomId);
  }

  /**
   * Stops periodic sync broadcasts for a room
   */
  private stopPeriodicSync(roomId: string): void {
    const interval = this.syncIntervals.get(roomId);

    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(roomId);
      this.logger.log(`Stopped periodic sync for room ${roomId}`);
    }
  }

  /**
   * Cleanup on module destroy - clear all sync intervals
   */
  onModuleDestroy() {
    this.logger.log('Cleaning up all sync intervals on module destroy');

    for (const [roomId, interval] of this.syncIntervals.entries()) {
      clearInterval(interval);
      this.logger.debug(`Cleared sync interval for room ${roomId}`);
    }

    this.syncIntervals.clear();
  }
}
