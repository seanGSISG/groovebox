import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { RoomsService } from './rooms.service';
import { Room } from '../entities/room.entity';
import { RoomMember, RoomMemberRole } from '../entities/room-member.entity';
import { User } from '../entities/user.entity';
import { CreateRoomDto, JoinRoomDto } from './dto';

describe('RoomsService', () => {
  let service: RoomsService;
  let roomRepository: Repository<Room>;
  let roomMemberRepository: Repository<RoomMember>;
  let userRepository: Repository<User>;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: {
      remove: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    },
  };

  const mockRoomRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    manager: {
      connection: {
        createQueryRunner: jest.fn(() => mockQueryRunner),
      },
    },
  };

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawAndEntities: jest.fn(),
  };

  const mockRoomMemberRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        {
          provide: getRepositoryToken(Room),
          useValue: mockRoomRepository,
        },
        {
          provide: getRepositoryToken(RoomMember),
          useValue: mockRoomMemberRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
    roomRepository = module.get<Repository<Room>>(getRepositoryToken(Room));
    roomMemberRepository = module.get<Repository<RoomMember>>(
      getRepositoryToken(RoomMember),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRoom', () => {
    it('should successfully create a room with default settings', async () => {
      const userId = 'user-1';
      const createRoomDto: CreateRoomDto = {
        roomName: 'Test Room',
      };

      const mockRoom = {
        id: 'room-1',
        roomCode: 'ABC123',
        roomName: 'Test Room',
        passwordHash: null,
        ownerId: userId,
        settings: {
          maxMembers: 50,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
          autoRandomizeDJ: false,
        },
        createdAt: new Date(),
        isActive: true,
      };

      const mockRoomMember = {
        id: 'member-1',
        roomId: 'room-1',
        userId,
        role: RoomMemberRole.OWNER,
        joinedAt: new Date(),
        lastActive: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(null);
      mockRoomRepository.create.mockReturnValue(mockRoom);
      mockRoomRepository.save.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.create.mockReturnValue(mockRoomMember);
      mockRoomMemberRepository.save.mockResolvedValue(mockRoomMember);

      const result = await service.createRoom(userId, createRoomDto);

      expect(result).toMatchObject({
        roomCode: expect.any(String),
        roomName: 'Test Room',
        isPasswordProtected: false,
        ownerId: userId,
      });
      expect(result.roomCode).toHaveLength(6);
      expect(mockRoomRepository.save).toHaveBeenCalled();
      expect(mockRoomMemberRepository.save).toHaveBeenCalled();
    });

    it('should create a password-protected room', async () => {
      const userId = 'user-1';
      const createRoomDto: CreateRoomDto = {
        roomName: 'Secret Room',
        password: 'secret123',
      };

      const mockRoom = {
        id: 'room-1',
        roomCode: 'ABC123',
        roomName: 'Secret Room',
        passwordHash: 'hashed-password',
        ownerId: userId,
        settings: {
          maxMembers: 50,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
          autoRandomizeDJ: false,
        },
        createdAt: new Date(),
        isActive: true,
      };

      mockRoomRepository.findOne.mockResolvedValue(null);
      mockRoomRepository.create.mockReturnValue(mockRoom);
      mockRoomRepository.save.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.create.mockReturnValue({});
      mockRoomMemberRepository.save.mockResolvedValue({});

      const result = await service.createRoom(userId, createRoomDto);

      expect(result.isPasswordProtected).toBe(true);
    });

    it('should create room with custom settings', async () => {
      const userId = 'user-1';
      const createRoomDto: CreateRoomDto = {
        roomName: 'Custom Room',
        settings: {
          maxMembers: 20,
          mutinyThreshold: 0.6,
          djCooldownMinutes: 10,
          autoRandomizeDJ: true,
        },
      };

      const mockRoom = {
        id: 'room-1',
        roomCode: 'ABC123',
        roomName: 'Custom Room',
        passwordHash: null,
        ownerId: userId,
        settings: createRoomDto.settings,
        createdAt: new Date(),
        isActive: true,
      };

      mockRoomRepository.findOne.mockResolvedValue(null);
      mockRoomRepository.create.mockReturnValue(mockRoom);
      mockRoomRepository.save.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.create.mockReturnValue({});
      mockRoomMemberRepository.save.mockResolvedValue({});

      const result = await service.createRoom(userId, createRoomDto);

      expect(result.settings).toEqual(createRoomDto.settings);
    });
  });

  describe('joinRoom', () => {
    it('should successfully join a public room', async () => {
      const userId = 'user-2';
      const roomCode = 'ABC123';
      const joinRoomDto: JoinRoomDto = {};

      const mockRoom = {
        id: 'room-1',
        roomCode,
        roomName: 'Test Room',
        passwordHash: null,
        ownerId: 'user-1',
        settings: {
          maxMembers: 50,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
          autoRandomizeDJ: false,
        },
        isActive: true,
        members: [],
      };

      const mockUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Test User',
      };

      const mockRoomMember = {
        id: 'member-2',
        roomId: 'room-1',
        userId,
        role: RoomMemberRole.LISTENER,
        joinedAt: new Date(),
        lastActive: new Date(),
      };

      mockRoomRepository.findOne
        .mockResolvedValueOnce(mockRoom)
        .mockResolvedValueOnce({ ...mockRoom, members: [mockRoomMember] });
      mockRoomMemberRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockRoomMember);
      mockRoomMemberRepository.count.mockResolvedValue(1);
      mockRoomMemberRepository.create.mockReturnValue(mockRoomMember);
      mockRoomMemberRepository.save.mockResolvedValue(mockRoomMember);
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockRoomMemberRepository.find.mockResolvedValue([mockRoomMember]);

      const result = await service.joinRoom(userId, roomCode, joinRoomDto);

      expect(result.room).toBeDefined();
      expect(result.member).toBeDefined();
      expect(result.member.role).toBe(RoomMemberRole.LISTENER);
      expect(mockRoomMemberRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if room does not exist', async () => {
      const userId = 'user-2';
      const roomCode = 'INVALID';
      const joinRoomDto: JoinRoomDto = {};

      mockRoomRepository.findOne.mockResolvedValue(null);

      await expect(
        service.joinRoom(userId, roomCode, joinRoomDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if room is not active', async () => {
      const userId = 'user-2';
      const roomCode = 'ABC123';
      const joinRoomDto: JoinRoomDto = {};

      const mockRoom = {
        id: 'room-1',
        roomCode,
        isActive: false,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);

      await expect(
        service.joinRoom(userId, roomCode, joinRoomDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user is already a member', async () => {
      const userId = 'user-2';
      const roomCode = 'ABC123';
      const joinRoomDto: JoinRoomDto = {};

      const mockRoom = {
        id: 'room-1',
        roomCode,
        isActive: true,
      };

      const existingMember = {
        id: 'member-1',
        roomId: 'room-1',
        userId,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(existingMember);

      await expect(
        service.joinRoom(userId, roomCode, joinRoomDto),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw UnauthorizedException if password is required but not provided', async () => {
      const userId = 'user-2';
      const roomCode = 'ABC123';
      const joinRoomDto: JoinRoomDto = {};

      const mockRoom = {
        id: 'room-1',
        roomCode,
        passwordHash: 'hashed-password',
        isActive: true,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.joinRoom(userId, roomCode, joinRoomDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is incorrect', async () => {
      const userId = 'user-2';
      const roomCode = 'ABC123';
      const joinRoomDto: JoinRoomDto = {
        password: 'wrongpassword',
      };

      const mockRoom = {
        id: 'room-1',
        roomCode,
        passwordHash: await bcrypt.hash('correctpassword', 10),
        isActive: true,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.joinRoom(userId, roomCode, joinRoomDto),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if room is full', async () => {
      const userId = 'user-2';
      const roomCode = 'ABC123';
      const joinRoomDto: JoinRoomDto = {};

      const mockRoom = {
        id: 'room-1',
        roomCode,
        passwordHash: null,
        isActive: true,
        settings: {
          maxMembers: 5,
        },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(null);
      mockRoomMemberRepository.count.mockResolvedValue(5);

      await expect(
        service.joinRoom(userId, roomCode, joinRoomDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('leaveRoom', () => {
    it('should successfully leave a room as a listener', async () => {
      const userId = 'user-2';
      const roomCode = 'ABC123';

      const mockRoom = {
        id: 'room-1',
        roomCode,
      };

      const mockRoomMember = {
        id: 'member-2',
        roomId: 'room-1',
        userId,
        role: RoomMemberRole.LISTENER,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockRoomMember);
      mockQueryRunner.manager.remove.mockResolvedValue(mockRoomMember);

      const result = await service.leaveRoom(userId, roomCode);

      expect(result.message).toBe('Successfully left the room');
      expect(mockQueryRunner.manager.remove).toHaveBeenCalledWith(
        mockRoomMember,
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should transfer ownership when owner leaves', async () => {
      const userId = 'user-1';
      const roomCode = 'ABC123';

      const mockRoom = {
        id: 'room-1',
        roomCode,
        ownerId: userId,
      };

      const ownerMember = {
        id: 'member-1',
        roomId: 'room-1',
        userId,
        role: RoomMemberRole.OWNER,
      };

      const nextMember = {
        id: 'member-2',
        roomId: 'room-1',
        userId: 'user-2',
        role: RoomMemberRole.LISTENER,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(ownerMember);
      mockQueryRunner.manager.remove.mockResolvedValue(ownerMember);
      mockQueryRunner.manager.find.mockResolvedValue([nextMember]);
      mockQueryRunner.manager.save.mockResolvedValueOnce({
        ...nextMember,
        role: RoomMemberRole.OWNER,
      }).mockResolvedValueOnce({
        ...mockRoom,
        ownerId: 'user-2',
      });

      const result = await service.leaveRoom(userId, roomCode);

      expect(result.message).toBe('Successfully left the room');
      expect(mockQueryRunner.manager.save).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should deactivate room when last member (owner) leaves', async () => {
      const userId = 'user-1';
      const roomCode = 'ABC123';

      const mockRoom = {
        id: 'room-1',
        roomCode,
        ownerId: userId,
        isActive: true,
      };

      const ownerMember = {
        id: 'member-1',
        roomId: 'room-1',
        userId,
        role: RoomMemberRole.OWNER,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(ownerMember);
      mockQueryRunner.manager.remove.mockResolvedValue(ownerMember);
      mockQueryRunner.manager.find.mockResolvedValue([]);
      mockQueryRunner.manager.save.mockResolvedValue({
        ...mockRoom,
        isActive: false,
        ownerId: null,
      });

      const result = await service.leaveRoom(userId, roomCode);

      expect(result.message).toBe('Successfully left the room');
      expect(mockQueryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          ownerId: null,
        }),
      );
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should throw NotFoundException if room does not exist', async () => {
      const userId = 'user-1';
      const roomCode = 'INVALID';

      mockRoomRepository.findOne.mockResolvedValue(null);

      await expect(service.leaveRoom(userId, roomCode)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if user is not a member', async () => {
      const userId = 'user-1';
      const roomCode = 'ABC123';

      const mockRoom = {
        id: 'room-1',
        roomCode,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(null);

      await expect(service.leaveRoom(userId, roomCode)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getRoomDetails', () => {
    it('should return room details for a member', async () => {
      const userId = 'user-1';
      const roomCode = 'ABC123';

      const mockUser = {
        id: userId,
        username: 'testuser',
        displayName: 'Test User',
      };

      const mockRoom = {
        id: 'room-1',
        roomCode,
        roomName: 'Test Room',
        passwordHash: null,
        ownerId: userId,
        settings: {
          maxMembers: 50,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
          autoRandomizeDJ: false,
        },
        createdAt: new Date(),
        isActive: true,
        members: [
          {
            id: 'member-1',
            roomId: 'room-1',
            userId,
            role: RoomMemberRole.OWNER,
            joinedAt: new Date(),
            lastActive: new Date(),
            user: mockUser,
          },
        ],
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockRoom.members[0]);

      const result = await service.getRoomDetails(userId, roomCode);

      expect(result).toMatchObject({
        roomCode,
        roomName: 'Test Room',
        memberCount: 1,
      });
      expect(result.members).toHaveLength(1);
      expect(result.members?.[0].role).toBe(RoomMemberRole.OWNER);
    });

    it('should throw NotFoundException if room does not exist', async () => {
      const userId = 'user-1';
      const roomCode = 'INVALID';

      mockRoomRepository.findOne.mockResolvedValue(null);

      await expect(service.getRoomDetails(userId, roomCode)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      const userId = 'user-1';
      const roomCode = 'ABC123';

      const mockRoom = {
        id: 'room-1',
        roomCode,
        members: [],
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(null);

      await expect(service.getRoomDetails(userId, roomCode)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getMyRooms', () => {
    it('should return all rooms where user is a member', async () => {
      const userId = 'user-1';

      const mockMemberships = [
        {
          id: 'member-1',
          userId,
          roomId: 'room-1',
          role: RoomMemberRole.OWNER,
          joinedAt: new Date(),
          room: {
            id: 'room-1',
            roomCode: 'ABC123',
            roomName: 'Room 1',
            passwordHash: null,
            ownerId: userId,
            settings: {
              maxMembers: 50,
              mutinyThreshold: 0.51,
              djCooldownMinutes: 5,
              autoRandomizeDJ: false,
            },
            createdAt: new Date(),
            isActive: true,
          },
        },
        {
          id: 'member-2',
          userId,
          roomId: 'room-2',
          role: RoomMemberRole.LISTENER,
          joinedAt: new Date(),
          room: {
            id: 'room-2',
            roomCode: 'XYZ789',
            roomName: 'Room 2',
            passwordHash: 'hashed',
            ownerId: 'user-2',
            settings: {
              maxMembers: 20,
              mutinyThreshold: 0.6,
              djCooldownMinutes: 10,
              autoRandomizeDJ: true,
            },
            createdAt: new Date(),
            isActive: true,
          },
        },
      ];

      const mockRawResults = [
        { memberCount: '5' },
        { memberCount: '10' },
      ];

      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: mockMemberships,
        raw: mockRawResults,
      });

      const result = await service.getMyRooms(userId);

      expect(result).toHaveLength(2);
      expect(result[0].roomCode).toBe('ABC123');
      expect(result[0].myRole).toBe(RoomMemberRole.OWNER);
      expect(result[0].memberCount).toBe(5);
      expect(result[1].roomCode).toBe('XYZ789');
      expect(result[1].myRole).toBe(RoomMemberRole.LISTENER);
      expect(result[1].isPasswordProtected).toBe(true);
      expect(result[1].memberCount).toBe(10);
    });

    it('should return empty array if user is not in any rooms', async () => {
      const userId = 'user-1';

      mockQueryBuilder.getRawAndEntities.mockResolvedValue({
        entities: [],
        raw: [],
      });

      const result = await service.getMyRooms(userId);

      expect(result).toHaveLength(0);
    });
  });
});
