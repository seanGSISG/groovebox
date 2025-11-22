import { Test, TestingModule } from '@nestjs/testing';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, JoinRoomDto, RoomDetailsDto, RoomMemberDto, UserRoomDto } from './dto';
import { RoomMemberRole } from '../entities/room-member.entity';

describe('RoomsController', () => {
  let controller: RoomsController;
  let service: RoomsService;

  const mockRoomsService = {
    createRoom: jest.fn(),
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    getRoomDetails: jest.fn(),
    getMyRooms: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoomsController],
      providers: [
        {
          provide: RoomsService,
          useValue: mockRoomsService,
        },
      ],
    }).compile();

    controller = module.get<RoomsController>(RoomsController);
    service = module.get<RoomsService>(RoomsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRoom', () => {
    it('should create a new room', async () => {
      const req = { user: { id: 'user-1' } };
      const createRoomDto: CreateRoomDto = {
        roomName: 'Test Room',
      };

      const mockRoomDetails: RoomDetailsDto = {
        id: 'room-1',
        roomCode: 'ABC123',
        roomName: 'Test Room',
        isPasswordProtected: false,
        ownerId: 'user-1',
        settings: {
          maxMembers: 50,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
          autoRandomizeDJ: false,
        },
        createdAt: new Date(),
        isActive: true,
      };

      mockRoomsService.createRoom.mockResolvedValue(mockRoomDetails);

      const result = await controller.createRoom(req, createRoomDto);

      expect(result).toEqual(mockRoomDetails);
      expect(service.createRoom).toHaveBeenCalledWith('user-1', createRoomDto);
    });
  });

  describe('joinRoom', () => {
    it('should join a room', async () => {
      const req = { user: { id: 'user-2' } };
      const code = 'abc123';
      const joinRoomDto: JoinRoomDto = {};

      const mockRoomDetails: RoomDetailsDto = {
        id: 'room-1',
        roomCode: 'ABC123',
        roomName: 'Test Room',
        isPasswordProtected: false,
        ownerId: 'user-1',
        settings: {
          maxMembers: 50,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
          autoRandomizeDJ: false,
        },
        createdAt: new Date(),
        isActive: true,
      };

      const mockMember: RoomMemberDto = {
        id: 'member-1',
        userId: 'user-2',
        username: 'testuser',
        displayName: 'Test User',
        role: RoomMemberRole.LISTENER,
        joinedAt: new Date(),
        lastActive: new Date(),
      };

      mockRoomsService.joinRoom.mockResolvedValue({
        room: mockRoomDetails,
        member: mockMember,
      });

      const result = await controller.joinRoom(req, code, joinRoomDto);

      expect(result.room).toEqual(mockRoomDetails);
      expect(result.member).toEqual(mockMember);
      expect(service.joinRoom).toHaveBeenCalledWith(
        'user-2',
        'ABC123',
        joinRoomDto,
      );
    });
  });

  describe('leaveRoom', () => {
    it('should leave a room', async () => {
      const req = { user: { id: 'user-2' } };
      const code = 'abc123';

      mockRoomsService.leaveRoom.mockResolvedValue({
        message: 'Successfully left the room',
      });

      const result = await controller.leaveRoom(req, code);

      expect(result.message).toBe('Successfully left the room');
      expect(service.leaveRoom).toHaveBeenCalledWith('user-2', 'ABC123');
    });
  });

  describe('getRoomDetails', () => {
    it('should get room details', async () => {
      const req = { user: { id: 'user-1' } };
      const code = 'abc123';

      const mockRoomDetails: RoomDetailsDto = {
        id: 'room-1',
        roomCode: 'ABC123',
        roomName: 'Test Room',
        isPasswordProtected: false,
        ownerId: 'user-1',
        settings: {
          maxMembers: 50,
          mutinyThreshold: 0.51,
          djCooldownMinutes: 5,
          autoRandomizeDJ: false,
        },
        createdAt: new Date(),
        isActive: true,
        memberCount: 1,
        members: [
          {
            id: 'member-1',
            userId: 'user-1',
            username: 'testuser',
            displayName: 'Test User',
            role: RoomMemberRole.OWNER,
            joinedAt: new Date(),
            lastActive: new Date(),
          },
        ],
      };

      mockRoomsService.getRoomDetails.mockResolvedValue(mockRoomDetails);

      const result = await controller.getRoomDetails(req, code);

      expect(result).toEqual(mockRoomDetails);
      expect(service.getRoomDetails).toHaveBeenCalledWith('user-1', 'ABC123');
    });
  });

  describe('getMyRooms', () => {
    it('should get all user rooms', async () => {
      const req = { user: { id: 'user-1' } };

      const mockUserRooms: UserRoomDto[] = [
        {
          id: 'room-1',
          roomCode: 'ABC123',
          roomName: 'Room 1',
          isPasswordProtected: false,
          ownerId: 'user-1',
          settings: {
            maxMembers: 50,
            mutinyThreshold: 0.51,
            djCooldownMinutes: 5,
            autoRandomizeDJ: false,
          },
          createdAt: new Date(),
          isActive: true,
          memberCount: 5,
          myRole: RoomMemberRole.OWNER,
          joinedAt: new Date(),
        },
        {
          id: 'room-2',
          roomCode: 'XYZ789',
          roomName: 'Room 2',
          isPasswordProtected: true,
          ownerId: 'user-2',
          settings: {
            maxMembers: 20,
            mutinyThreshold: 0.6,
            djCooldownMinutes: 10,
            autoRandomizeDJ: true,
          },
          createdAt: new Date(),
          isActive: true,
          memberCount: 10,
          myRole: RoomMemberRole.LISTENER,
          joinedAt: new Date(),
        },
      ];

      mockRoomsService.getMyRooms.mockResolvedValue(mockUserRooms);

      const result = await controller.getMyRooms(req);

      expect(result).toEqual(mockUserRooms);
      expect(result).toHaveLength(2);
      expect(service.getMyRooms).toHaveBeenCalledWith('user-1');
    });
  });
});
