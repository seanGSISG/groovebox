import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VotesService } from './votes.service';
import { Vote, VoteType } from '../entities/vote.entity';
import { Room } from '../entities/room.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RoomDjHistory } from '../entities/room-dj-history.entity';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';
import { v4 as uuidv4 } from 'uuid';

describe('VotesService', () => {
  let service: VotesService;
  let voteRepository: Repository<Vote>;
  let roomRepository: Repository<Room>;
  let roomMemberRepository: Repository<RoomMember>;
  let redisService: RedisService;

  const mockVoteRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockRoomRepository = {
    findOne: jest.fn(),
  };

  const mockRoomMemberRepository = {
    find: jest.fn(),
    count: jest.fn(),
  };

  const mockRedisClient = {
    hset: jest.fn(),
    hget: jest.fn(),
    hgetall: jest.fn(),
    hincrby: jest.fn(),
    expire: jest.fn(),
    del: jest.fn(),
    setex: jest.fn(),
    get: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(() => mockRedisClient),
  };

  const mockRoomsService = {
    setDj: jest.fn(),
    removeDj: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VotesService,
        {
          provide: getRepositoryToken(Vote),
          useValue: mockVoteRepository,
        },
        {
          provide: getRepositoryToken(Room),
          useValue: mockRoomRepository,
        },
        {
          provide: getRepositoryToken(RoomMember),
          useValue: mockRoomMemberRepository,
        },
        {
          provide: getRepositoryToken(RoomDjHistory),
          useValue: {},
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: RoomsService,
          useValue: mockRoomsService,
        },
      ],
    }).compile();

    service = module.get<VotesService>(VotesService);
    voteRepository = module.get<Repository<Vote>>(getRepositoryToken(Vote));
    roomRepository = module.get<Repository<Room>>(getRepositoryToken(Room));
    roomMemberRepository = module.get<Repository<RoomMember>>(getRepositoryToken(RoomMember));
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startDjElection', () => {
    it('should create a new DJ election vote session', async () => {
      const roomId = uuidv4();
      const voteSessionId = uuidv4();

      mockRoomRepository.findOne.mockResolvedValue({
        id: roomId,
        roomCode: 'ABC123',
        settings: { mutinyThreshold: 0.51 },
      });

      mockRoomMemberRepository.count.mockResolvedValue(5);

      jest.spyOn(service as any, 'generateVoteSessionId').mockReturnValue(voteSessionId);

      const result = await service.startDjElection(roomId);

      expect(result.voteSessionId).toBe(voteSessionId);
      expect(result.voteType).toBe(VoteType.DJ_ELECTION);
      expect(result.totalVoters).toBe(5);
      expect(mockRedisClient.hset).toHaveBeenCalled();
    });
  });

  describe('castVote', () => {
    it('should cast a vote for DJ election', async () => {
      const roomId = uuidv4();
      const userId = uuidv4();
      const targetUserId = uuidv4();
      const voteSessionId = uuidv4();

      mockRedisClient.hget.mockResolvedValue(null); // User hasn't voted yet
      mockRedisClient.hgetall.mockResolvedValue({
        voteType: VoteType.DJ_ELECTION,
        roomId,
        totalVoters: '5',
      });

      mockVoteRepository.create.mockReturnValue({});
      mockVoteRepository.save.mockResolvedValue({});

      await service.castVote(roomId, userId, {
        voteSessionId,
        targetUserId,
      });

      expect(voteRepository.save).toHaveBeenCalled();
      expect(mockRedisClient.hset).toHaveBeenCalled();
      expect(mockRedisClient.hincrby).toHaveBeenCalled();
    });

    it('should not allow voting twice', async () => {
      const roomId = uuidv4();
      const userId = uuidv4();
      const targetUserId = uuidv4();
      const voteSessionId = uuidv4();

      mockRedisClient.hget.mockResolvedValue(targetUserId); // User already voted
      mockRedisClient.hgetall.mockResolvedValue({
        voteType: VoteType.DJ_ELECTION,
        roomId,
        totalVoters: '5',
      });

      await expect(
        service.castVote(roomId, userId, {
          voteSessionId,
          targetUserId,
        }),
      ).rejects.toThrow('You have already voted in this session');
    });
  });

  describe('getVoteResults', () => {
    it('should return vote results for DJ election', async () => {
      const voteSessionId = uuidv4();
      const userId1 = uuidv4();
      const userId2 = uuidv4();

      mockRedisClient.hgetall.mockResolvedValue({
        voteType: VoteType.DJ_ELECTION,
        roomId: uuidv4(),
        totalVoters: '5',
        [`vote_count:${userId1}`]: '3',
        [`vote_count:${userId2}`]: '2',
      });

      const results = await service.getVoteResults(voteSessionId);

      expect(results.voteType).toBe(VoteType.DJ_ELECTION);
      expect(results.voteCounts[userId1]).toBe(3);
      expect(results.voteCounts[userId2]).toBe(2);
    });
  });
});
