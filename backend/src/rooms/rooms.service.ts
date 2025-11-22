import {
  Injectable,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Room } from '../entities/room.entity';
import { RoomMember, RoomMemberRole } from '../entities/room-member.entity';
import { User } from '../entities/user.entity';
import { CreateRoomDto, JoinRoomDto, RoomDetailsDto, RoomMemberDto, UserRoomDto } from './dto';

@Injectable()
export class RoomsService {
  private readonly SALT_ROUNDS = 10;
  private readonly ROOM_CODE_LENGTH = 6;
  private readonly MAX_RETRIES = 10;

  constructor(
    @InjectRepository(Room)
    private readonly roomRepository: Repository<Room>,
    @InjectRepository(RoomMember)
    private readonly roomMemberRepository: Repository<RoomMember>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Generate a unique 6-character alphanumeric room code
   */
  private generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar-looking characters
    let code = '';
    for (let i = 0; i < this.ROOM_CODE_LENGTH; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Generate a unique room code that doesn't exist in the database
   */
  private async generateUniqueRoomCode(): Promise<string> {
    for (let i = 0; i < this.MAX_RETRIES; i++) {
      const code = this.generateRoomCode();
      const existing = await this.roomRepository.findOne({
        where: { roomCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    throw new ConflictException('Unable to generate unique room code. Please try again.');
  }

  /**
   * Create a new room with the authenticated user as owner
   */
  async createRoom(userId: string, createRoomDto: CreateRoomDto): Promise<RoomDetailsDto> {
    const { roomName, password, settings } = createRoomDto;

    // Hash password if provided
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);
    }

    // Retry logic to handle race conditions in room code generation
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        // Generate unique room code
        const roomCode = await this.generateUniqueRoomCode();

        // Create room with default settings merged with provided settings
        const room = this.roomRepository.create({
          roomCode,
          roomName,
          passwordHash,
          ownerId: userId,
          settings: {
            maxMembers: settings?.maxMembers ?? 50,
            mutinyThreshold: settings?.mutinyThreshold ?? 0.51,
            djCooldownMinutes: settings?.djCooldownMinutes ?? 5,
            autoRandomizeDJ: settings?.autoRandomizeDJ ?? false,
          },
          isActive: true,
        });

        await this.roomRepository.save(room);

        // Create initial RoomMember with owner role
        const roomMember = this.roomMemberRepository.create({
          roomId: room.id,
          userId,
          role: RoomMemberRole.OWNER,
        });

        await this.roomMemberRepository.save(roomMember);

        // Return room details
        return this.mapRoomToDetailsDto(room, false);
      } catch (error) {
        // If it's a unique constraint violation, retry with a new code
        if (error.code === '23505' || error.code === 'ER_DUP_ENTRY') {
          if (attempt === this.MAX_RETRIES - 1) {
            throw new ConflictException('Unable to generate unique room code. Please try again.');
          }
          // Continue to next iteration
          continue;
        }
        // If it's a different error, rethrow
        throw error;
      }
    }

    // This should never be reached due to the throw in the loop
    throw new ConflictException('Unable to generate unique room code. Please try again.');
  }

  /**
   * Join an existing room
   */
  async joinRoom(userId: string, roomCode: string, joinRoomDto: JoinRoomDto): Promise<{ room: RoomDetailsDto; member: RoomMemberDto }> {
    const { password } = joinRoomDto;

    // Find room by code
    const room = await this.roomRepository.findOne({
      where: { roomCode },
      relations: ['members'],
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    if (!room.isActive) {
      throw new BadRequestException('Room is no longer active');
    }

    // Check if user is already a member
    const existingMember = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });

    if (existingMember) {
      throw new ConflictException('You are already a member of this room');
    }

    // Check password if room is password-protected
    if (room.passwordHash) {
      if (!password) {
        throw new UnauthorizedException('Password required');
      }
      const isPasswordValid = await bcrypt.compare(password, room.passwordHash);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    // Check if room is full
    const memberCount = await this.roomMemberRepository.count({
      where: { roomId: room.id },
    });

    if (memberCount >= room.settings.maxMembers) {
      throw new BadRequestException('Room is full');
    }

    // Create RoomMember with listener role
    const roomMember = this.roomMemberRepository.create({
      roomId: room.id,
      userId,
      role: RoomMemberRole.LISTENER,
    });

    await this.roomMemberRepository.save(roomMember);

    // Get user details for member DTO
    const user = await this.userRepository.findOne({ where: { id: userId } });

    // Return room details and member info
    return {
      room: await this.getRoomDetails(userId, roomCode),
      member: {
        id: roomMember.id,
        userId: roomMember.userId,
        username: user?.username || '',
        displayName: user?.displayName || '',
        role: roomMember.role,
        joinedAt: roomMember.joinedAt,
        lastActive: roomMember.lastActive,
      },
    };
  }

  /**
   * Leave a room
   */
  async leaveRoom(userId: string, roomCode: string): Promise<{ message: string }> {
    // Find room by code
    const room = await this.roomRepository.findOne({
      where: { roomCode },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Find user's membership
    const roomMember = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });

    if (!roomMember) {
      throw new NotFoundException('You are not a member of this room');
    }

    // Use transaction to ensure atomicity when leaving room
    const queryRunner = this.roomRepository.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Remove user from room members
      await queryRunner.manager.remove(roomMember);

      // If user is owner, handle ownership transfer or room deactivation
      if (roomMember.role === RoomMemberRole.OWNER) {
        // Find remaining members
        const remainingMembers = await queryRunner.manager.find(RoomMember, {
          where: { roomId: room.id },
          order: { joinedAt: 'ASC' },
        });

        if (remainingMembers.length > 0) {
          // Transfer ownership to the oldest member
          const newOwner = remainingMembers[0];
          newOwner.role = RoomMemberRole.OWNER;
          await queryRunner.manager.save(newOwner);
          room.ownerId = newOwner.userId;
          await queryRunner.manager.save(room);
        } else {
          // No members left, deactivate room
          room.isActive = false;
          room.ownerId = null;
          await queryRunner.manager.save(room);
        }
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      return { message: 'Successfully left the room' };
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Get room details (only accessible to room members)
   */
  async getRoomDetails(userId: string, roomCode: string): Promise<RoomDetailsDto> {
    // Find room by code
    const room = await this.roomRepository.findOne({
      where: { roomCode },
      relations: ['members', 'members.user'],
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user is a member
    const isMember = await this.roomMemberRepository.findOne({
      where: { roomId: room.id, userId },
    });

    if (!isMember) {
      throw new ForbiddenException('You must be a member to view room details');
    }

    // Map members to DTOs
    const members: RoomMemberDto[] = room.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      username: member.user?.username || '',
      displayName: member.user?.displayName || '',
      role: member.role,
      joinedAt: member.joinedAt,
      lastActive: member.lastActive,
    }));

    return {
      id: room.id,
      roomCode: room.roomCode,
      roomName: room.roomName,
      isPasswordProtected: !!room.passwordHash,
      ownerId: room.ownerId,
      settings: room.settings,
      createdAt: room.createdAt,
      isActive: room.isActive,
      memberCount: members.length,
      members,
    };
  }

  /**
   * Get all rooms where user is a member
   */
  async getMyRooms(userId: string): Promise<UserRoomDto[]> {
    // Use query builder to fetch rooms with member counts in a single query
    const membershipsWithCounts = await this.roomMemberRepository
      .createQueryBuilder('rm')
      .leftJoinAndSelect('rm.room', 'room')
      .leftJoin('room.members', 'members')
      .addSelect('COUNT(members.id)', 'memberCount')
      .where('rm.userId = :userId', { userId })
      .groupBy('rm.id')
      .addGroupBy('room.id')
      .orderBy('rm.joinedAt', 'DESC')
      .getRawAndEntities();

    // Map to UserRoomDto
    const rooms: UserRoomDto[] = membershipsWithCounts.entities.map((membership, index) => {
      const memberCount = parseInt(membershipsWithCounts.raw[index].memberCount, 10);

      return {
        id: membership.room.id,
        roomCode: membership.room.roomCode,
        roomName: membership.room.roomName,
        isPasswordProtected: !!membership.room.passwordHash,
        ownerId: membership.room.ownerId,
        settings: membership.room.settings,
        createdAt: membership.room.createdAt,
        isActive: membership.room.isActive,
        memberCount,
        myRole: membership.role,
        joinedAt: membership.joinedAt,
      };
    });

    return rooms;
  }

  /**
   * Helper method to map Room entity to RoomDetailsDto
   */
  private mapRoomToDetailsDto(room: Room, includeMembers: boolean = false): RoomDetailsDto {
    return {
      id: room.id,
      roomCode: room.roomCode,
      roomName: room.roomName,
      isPasswordProtected: !!room.passwordHash,
      ownerId: room.ownerId,
      settings: room.settings,
      createdAt: room.createdAt,
      isActive: room.isActive,
      memberCount: includeMembers && room.members ? room.members.length : undefined,
      members: includeMembers && room.members
        ? room.members.map((member) => ({
            id: member.id,
            userId: member.userId,
            username: member.user?.username || '',
            displayName: member.user?.displayName || '',
            role: member.role,
            joinedAt: member.joinedAt,
            lastActive: member.lastActive,
          }))
        : undefined,
    };
  }
}
