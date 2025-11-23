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
import { Logger, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Room, RoomMember, User, Message, RoomDjHistory, RoomMemberRole, RemovalReason } from '../entities';
import { RedisService } from '../redis/redis.service';
import { WsJwtGuard } from './ws-jwt.guard';
import {
  RoomJoinDto,
  RoomLeaveDto,
  ChatMessageDto,
  PlaybackStartDto,
  PlaybackPauseDto,
  PlaybackStopDto,
} from './dto/websocket-events.dto';
import { RoomStateDto } from './dto/room-state.dto';
import { SyncBufferHelper } from './helpers/sync-buffer.helper';
import { PlaybackSyncService } from './services/playback-sync.service';
import { QueueService } from '../queue/queue.service';
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
export class RoomGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RoomGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly playbackSyncService: PlaybackSyncService,
    private readonly queueService: QueueService,
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

      // Clean up room-socket memberships in Redis
      // Socket.io rooms include the socket's own room (client.id) and any joined rooms
      for (const room of client.rooms) {
        // Room names are in format "room:{roomId}" - extract roomId
        if (room.startsWith('room:')) {
          const roomId = room.substring(5); // Remove "room:" prefix
          await this.redisService.removeSocketFromRoom(roomId, client.id);
          this.logger.log(`Removed socket ${client.id} from room ${roomId} on disconnect`);
        }
      }
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

      // Track socket membership in Redis for RTT calculations
      await this.redisService.addSocketToRoom(room.id, client.id);

      this.logger.log(`User ${client.data.username} joined room ${roomCode}`);

      // Send current room state to joining user
      const playbackJson = await this.redisService.getClient().get(
        `room:${room.id}:state.playback`
      );
      const currentDjId = await this.redisService.getCurrentDj(room.id);

      const serverTimestamp = Date.now();
      let playbackState = {
        playing: false,
        trackId: null,
        startAtServerTime: null,
        currentPosition: null,
        serverTimestamp,
      };

      if (playbackJson) {
        try {
          const state = JSON.parse(playbackJson);
          if (state.playing && state.startAtServerTime) {
            const elapsed = Math.max(0, serverTimestamp - state.startAtServerTime);
            playbackState = {
              playing: true,
              trackId: state.trackId,
              startAtServerTime: state.startAtServerTime,
              currentPosition: elapsed + (state.initialPosition || 0),
              serverTimestamp,
            };
          }
        } catch (error) {
          this.logger.error(`Error parsing playback state for room ${room.id}: ${error.message}`);
        }
      }

      // Get queue state
      const queueState = await this.queueService.getQueueState(room.id, userId);

      const roomState: RoomStateDto = {
        roomId: room.id,
        members: [], // TODO: fetch from room members
        currentDjId,
        playback: playbackState,
        queueState,
      };

      client.emit('room:state', roomState);

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

      // Remove socket from Redis room membership
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

      // Calculate adaptive sync buffer based on room RTT
      const maxRtt = await this.redisService.getMaxRttForRoom(room.id);
      const syncBufferMs = SyncBufferHelper.calculateSyncBuffer(maxRtt);
      const serverTimestamp = Date.now();
      const startAtServerTime = serverTimestamp + syncBufferMs;

      // Build response with sync timing info
      const response: PlaybackStartDto = {
        roomCode,
        trackId,
        position,
        startAtServerTime,
        syncBufferMs,
        serverTimestamp,
      };

      // Store enhanced playback state in Redis
      await this.redisService.getClient().set(
        `room:${room.id}:state.playback`,
        JSON.stringify({
          playing: true,
          trackId,
          startAtServerTime,
          startedAt: serverTimestamp,
          initialPosition: position,
        })
      );

      // Also update legacy playback state for backward compatibility
      await this.redisService.setPlaybackState(room.id, 'playing', trackId, position);

      // Broadcast to all room members
      this.server.to(`room:${room.id}`).emit('playback:start', response);

      // Start periodic sync broadcasts
      this.playbackSyncService.startSyncBroadcast(room.id);

      this.logger.log(`Playback started in room ${roomCode} by ${client.data.username} (sync buffer: ${syncBufferMs}ms)`);

      return { success: true, ...response };
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

      // Stop periodic sync broadcasts
      this.playbackSyncService.stopSyncBroadcast(room.id);

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

      // Stop periodic sync broadcasts
      this.playbackSyncService.stopSyncBroadcast(room.id);

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

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('queue:submit')
  async handleQueueSubmit(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string; youtubeUrl: string; songTitle?: string; artist?: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is in the room
      const member = await this.roomMemberRepository.findOne({
        where: { roomId: room.id, userId: client.data.userId },
      });
      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      const submission = await this.queueService.submitSong(
        room.id,
        client.data.userId,
        {
          youtubeUrl: payload.youtubeUrl,
          songTitle: payload.songTitle,
          artist: payload.artist,
        },
      );

      // Notify all room members that queue changed - they'll refetch with their own hasVoted
      this.server.to(`room:${room.id}`).emit('queue:updated');

      // Return the full queue state to the requesting client
      const queueState = await this.queueService.getQueueState(room.id, client.data.userId);
      return { success: true, submission, queueState };
    } catch (error) {
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('queue:vote')
  async handleQueueVote(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string; submissionId: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is in the room
      const member = await this.roomMemberRepository.findOne({
        where: { roomId: room.id, userId: client.data.userId },
      });
      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      await this.queueService.voteForSubmission(payload.submissionId, client.data.userId);

      // Notify all room members that queue changed - they'll refetch with their own hasVoted
      this.server.to(`room:${room.id}`).emit('queue:updated');

      // Return the full queue state to the requesting client
      const queueState = await this.queueService.getQueueState(room.id, client.data.userId);
      return { success: true, queueState };
    } catch (error) {
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('queue:unvote')
  async handleQueueUnvote(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string; submissionId: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is in the room
      const member = await this.roomMemberRepository.findOne({
        where: { roomId: room.id, userId: client.data.userId },
      });
      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      await this.queueService.unvoteSubmission(payload.submissionId, client.data.userId);

      // Notify all room members that queue changed - they'll refetch with their own hasVoted
      this.server.to(`room:${room.id}`).emit('queue:updated');

      // Return the full queue state to the requesting client
      const queueState = await this.queueService.getQueueState(room.id, client.data.userId);
      return { success: true, queueState };
    } catch (error) {
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('queue:remove')
  async handleQueueRemove(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string; submissionId: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is in the room
      const member = await this.roomMemberRepository.findOne({
        where: { roomId: room.id, userId: client.data.userId },
      });
      if (!member) {
        return { error: 'You are not a member of this room' };
      }

      await this.queueService.removeSubmission(payload.submissionId, client.data.userId);

      // Notify all room members that queue changed - they'll refetch with their own hasVoted
      this.server.to(`room:${room.id}`).emit('queue:updated');

      // Return the full queue state to the requesting client
      const queueState = await this.queueService.getQueueState(room.id, client.data.userId);
      return { success: true, queueState };
    } catch (error) {
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('queue:get')
  async handleQueueGet(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      const queueState = await this.queueService.getQueueState(room.id, client.data.userId);
      return queueState;
    } catch (error) {
      return { error: error.message };
    }
  }

  @UseGuards(WsJwtGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('playback:ended')
  async handlePlaybackEnded(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: { roomCode: string },
  ) {
    try {
      const room = await this.roomRepository.findOne({ where: { roomCode: payload.roomCode } });
      if (!room) {
        return { error: 'Room not found' };
      }

      // Verify user is the current DJ
      const currentDjId = await this.redisService.getCurrentDj(room.id);
      if (currentDjId !== client.data.userId) {
        return { error: 'Only the DJ can signal playback ended' };
      }

      // Get top voted submission
      const topSubmission = await this.queueService.getTopSubmission(room.id);

      if (topSubmission) {
        // Mark as played
        await this.queueService.markAsPlayed(topSubmission.id);

        // Broadcast auto-play event with the winning song
        this.server.to(`room:${room.id}`).emit('queue:auto-play', {
          submission: {
            id: topSubmission.id,
            youtubeUrl: topSubmission.youtubeUrl,
            songTitle: topSubmission.songTitle,
            artist: topSubmission.artist,
            submittedBy: topSubmission.submittedBy,
          },
        });

        // Broadcast updated queue
        this.server.to(`room:${room.id}`).emit('queue:updated');
      }

      return { success: true, hasNext: !!topSubmission };
    } catch (error) {
      return { error: error.message };
    }
  }
}
