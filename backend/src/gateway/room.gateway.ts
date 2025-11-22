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
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room, RoomMember, User, Message, RoomDjHistory, RoomMemberRole, RemovalReason } from '../entities';
import { RedisService } from '../redis/redis.service';
import { WsJwtGuard } from './ws-jwt.guard';

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
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
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
      // Extract token from handshake auth or query params
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        client.handshake.query?.token;

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
  @SubscribeMessage('room:join')
  async handleRoomJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomCode: string },
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
  @SubscribeMessage('room:leave')
  async handleRoomLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomCode: string },
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
  @SubscribeMessage('chat:message')
  async handleChatMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomCode: string; content: string },
  ) {
    try {
      const { roomCode, content } = data;
      const userId = client.data.userId;

      if (!content || content.trim().length === 0) {
        return { error: 'Message content is required' };
      }

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

      // Store message in database
      const message = this.messageRepository.create({
        roomId: room.id,
        userId,
        content: content.trim(),
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
  @SubscribeMessage('playback:start')
  async handlePlaybackStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomCode: string; trackId: string; position?: number },
  ) {
    try {
      const { roomCode, trackId, position = 0 } = data;
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

      // Update Redis room state
      await this.redisService.setPlaybackState(room.id, 'playing', trackId, position);

      // Broadcast to all room members
      const payload = {
        roomId: room.id,
        trackId,
        position,
        timestamp: Date.now(),
      };

      this.server.to(`room:${room.id}`).emit('playback:start', payload);

      this.logger.log(`Playback started in room ${roomCode} by ${client.data.username}`);

      return { success: true, ...payload };
    } catch (error) {
      this.logger.error(`Error starting playback: ${error.message}`);
      return { error: 'Failed to start playback' };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('playback:pause')
  async handlePlaybackPause(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomCode: string; position?: number },
  ) {
    try {
      const { roomCode, position } = data;
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

      // Update Redis room state
      await this.redisService.setPlaybackState(room.id, 'paused', undefined, position);

      // Broadcast to all room members
      const payload = {
        roomId: room.id,
        position,
        timestamp: Date.now(),
      };

      this.server.to(`room:${room.id}`).emit('playback:pause', payload);

      this.logger.log(`Playback paused in room ${roomCode} by ${client.data.username}`);

      return { success: true, ...payload };
    } catch (error) {
      this.logger.error(`Error pausing playback: ${error.message}`);
      return { error: 'Failed to pause playback' };
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('playback:stop')
  async handlePlaybackStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomCode: string },
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

      // Broadcast to all room members
      const payload = {
        roomId: room.id,
        timestamp: Date.now(),
      };

      this.server.to(`room:${room.id}`).emit('playback:stop', payload);

      this.logger.log(`Playback stopped in room ${roomCode} by ${client.data.username}`);

      return { success: true, ...payload };
    } catch (error) {
      this.logger.error(`Error stopping playback: ${error.message}`);
      return { error: 'Failed to stop playback' };
    }
  }
}
