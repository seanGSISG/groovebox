import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueueService } from './queue.service';
import { QueueEntry } from '../entities/queue-entry.entity';
import { Room } from '../entities/room.entity';
import { User } from '../entities/user.entity';
import { RoomMember } from '../entities/room-member.entity';
import { RedisService } from '../redis/redis.service';
import { YouTubeService } from '../youtube/youtube.service';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

describe('QueueService', () => {
  let service: QueueService;
  let queueEntryRepository: Repository<QueueEntry>;
  let roomRepository: Repository<Room>;
  let userRepository: Repository<User>;
  let roomMemberRepository: Repository<RoomMember>;
  let redisService: RedisService;
  let youtubeService: YouTubeService;

  const mockQueueEntryRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
  };

  const mockRoomRepository = {
    findOne: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
  };

  const mockRoomMemberRepository = {
    findOne: jest.fn(),
    count: jest.fn(),
  };

  const mockPipeline = {
    scard: jest.fn().mockReturnThis(),
    sismember: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  const mockRedisClient = {
    sadd: jest.fn(),
    srem: jest.fn(),
    scard: jest.fn(),
    sismember: jest.fn(),
    smembers: jest.fn(),
    del: jest.fn(),
    expire: jest.fn(),
    pipeline: jest.fn(() => mockPipeline),
  };

  const mockRedisService = {
    getClient: jest.fn(() => mockRedisClient),
  };

  const mockYoutubeService = {
    validateUrl: jest.fn(),
    getVideoDetails: jest.fn(),
    extractVideoId: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getRepositoryToken(QueueEntry),
          useValue: mockQueueEntryRepository,
        },
        {
          provide: getRepositoryToken(Room),
          useValue: mockRoomRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(RoomMember),
          useValue: mockRoomMemberRepository,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: YouTubeService,
          useValue: mockYoutubeService,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
    queueEntryRepository = module.get<Repository<QueueEntry>>(getRepositoryToken(QueueEntry));
    roomRepository = module.get<Repository<Room>>(getRepositoryToken(Room));
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    roomMemberRepository = module.get<Repository<RoomMember>>(getRepositoryToken(RoomMember));
    redisService = module.get<RedisService>(RedisService);
    youtubeService = module.get<YouTubeService>(YouTubeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('addToQueue', () => {
    const roomCode = 'ABC123';
    const userId = uuidv4();
    const roomId = uuidv4();
    const videoId = 'dQw4w9WgXcQ';
    const youtubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    it('should add a song to the queue successfully', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockVideoDetails = {
        videoId,
        title: 'Test Song',
        channelTitle: 'Test Artist',
        thumbnails: {
          default: { url: 'default.jpg' },
          medium: { url: 'medium.jpg' },
          high: { url: 'high.jpg' },
        },
        durationSeconds: 180,
      };
      const mockUser = { id: userId, username: 'testuser', displayName: 'Test User' };
      const mockQueueEntry = {
        id: uuidv4(),
        roomId,
        youtubeVideoId: videoId,
        youtubeUrl,
        title: 'Test Song',
        artist: 'Test Artist',
        thumbnailUrl: 'high.jpg',
        durationSeconds: 180,
        addedById: userId,
        isPlayed: false,
        createdAt: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockYoutubeService.validateUrl.mockResolvedValue(videoId);
      mockYoutubeService.getVideoDetails.mockResolvedValue(mockVideoDetails);
      mockQueueEntryRepository.findOne.mockResolvedValue(null); // No duplicate
      mockQueueEntryRepository.create.mockReturnValue(mockQueueEntry);
      mockQueueEntryRepository.save.mockResolvedValue(mockQueueEntry);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.addToQueue(roomCode, userId, { youtubeUrl });

      expect(result.id).toBe(mockQueueEntry.id);
      expect(result.title).toBe('Test Song');
      expect(result.artist).toBe('Test Artist');
      expect(mockYoutubeService.validateUrl).toHaveBeenCalledWith(youtubeUrl);
      expect(mockQueueEntryRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if room not found', async () => {
      mockRoomRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addToQueue(roomCode, userId, { youtubeUrl }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      mockRoomRepository.findOne.mockResolvedValue({ id: roomId, roomCode });
      mockRoomMemberRepository.findOne.mockResolvedValue(null);

      await expect(
        service.addToQueue(roomCode, userId, { youtubeUrl }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if song already in queue', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const existingEntry = { id: uuidv4(), youtubeVideoId: videoId, isPlayed: false };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockYoutubeService.validateUrl.mockResolvedValue(videoId);
      mockYoutubeService.getVideoDetails.mockResolvedValue({
        videoId,
        title: 'Test Song',
        channelTitle: 'Test Artist',
        thumbnails: { high: { url: 'high.jpg' } },
        durationSeconds: 180,
      });
      mockQueueEntryRepository.findOne.mockResolvedValue(existingEntry);

      await expect(
        service.addToQueue(roomCode, userId, { youtubeUrl }),
      ).rejects.toThrow(BadRequestException);
      expect(mockQueueEntryRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('getQueueForRoom', () => {
    const roomCode = 'ABC123';
    const userId = uuidv4();
    const roomId = uuidv4();

    it('should return queue sorted by net score', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const entry1 = {
        id: uuidv4(),
        roomId,
        youtubeVideoId: 'video1',
        youtubeUrl: 'url1',
        title: 'Song 1',
        artist: 'Artist 1',
        thumbnailUrl: 'thumb1.jpg',
        durationSeconds: 180,
        addedById: userId,
        addedBy: { id: userId, username: 'user1', displayName: 'User 1' },
        isPlayed: false,
        createdAt: new Date(),
      };
      const entry2 = {
        id: uuidv4(),
        roomId,
        youtubeVideoId: 'video2',
        youtubeUrl: 'url2',
        title: 'Song 2',
        artist: 'Artist 2',
        thumbnailUrl: 'thumb2.jpg',
        durationSeconds: 200,
        addedById: userId,
        addedBy: { id: userId, username: 'user1', displayName: 'User 1' },
        isPlayed: false,
        createdAt: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.find.mockResolvedValue([entry1, entry2]);

      // entry1 has net score of 2 (3 upvotes - 1 downvote)
      // entry2 has net score of -1 (1 upvote - 2 downvotes)
      // Pipeline exec returns array of [error, result] pairs
      mockPipeline.exec.mockResolvedValue([
        [null, 3],  // entry1 upvotes
        [null, 1],  // entry1 downvotes
        [null, 0],  // entry1 user upvote check
        [null, 0],  // entry1 user downvote check
        [null, 1],  // entry2 upvotes
        [null, 2],  // entry2 downvotes
        [null, 0],  // entry2 user upvote check
        [null, 0],  // entry2 user downvote check
      ]);

      const result = await service.getQueueForRoom(roomCode, userId);

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].id).toBe(entry1.id); // Higher score first
      expect(result.entries[0].netScore).toBe(2);
      expect(result.entries[1].id).toBe(entry2.id);
      expect(result.entries[1].netScore).toBe(-1);
    });
  });

  describe('upvoteEntry', () => {
    const roomCode = 'ABC123';
    const userId = uuidv4();
    const roomId = uuidv4();
    const entryId = uuidv4();

    it('should upvote an entry successfully', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        youtubeVideoId: 'video1',
        youtubeUrl: 'url1',
        title: 'Song 1',
        artist: 'Artist 1',
        thumbnailUrl: 'thumb1.jpg',
        durationSeconds: 180,
        addedById: uuidv4(),
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
        isPlayed: false,
        createdAt: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockRedisClient.sismember.mockResolvedValue(0); // Not voted yet
      mockRedisClient.sadd.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.scard.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const result = await service.upvoteEntry(roomCode, entryId, userId);

      expect(result.userVote).toBe('up');
      expect(mockRedisClient.sadd).toHaveBeenCalledWith(`queue:${entryId}:upvotes`, userId);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(`queue:${entryId}:upvotes`, 7 * 24 * 60 * 60);
    });

    it('should throw BadRequestException if already voted', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        isPlayed: false,
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockRedisClient.sismember.mockResolvedValueOnce(1); // Already upvoted

      await expect(
        service.upvoteEntry(roomCode, entryId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if trying to vote on own song', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        addedById: userId, // User is the creator
        isPlayed: false,
        addedBy: { id: userId, username: 'user1', displayName: 'User 1' },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);

      await expect(
        service.upvoteEntry(roomCode, entryId, userId),
      ).rejects.toThrow(BadRequestException);
      expect(mockRedisClient.sadd).not.toHaveBeenCalled();
    });
  });

  describe('downvoteEntry', () => {
    const roomCode = 'ABC123';
    const userId = uuidv4();
    const roomId = uuidv4();
    const entryId = uuidv4();

    it('should downvote an entry successfully', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        youtubeVideoId: 'video1',
        youtubeUrl: 'url1',
        title: 'Song 1',
        artist: 'Artist 1',
        thumbnailUrl: 'thumb1.jpg',
        durationSeconds: 180,
        addedById: uuidv4(),
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
        isPlayed: false,
        createdAt: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne
        .mockResolvedValueOnce(mockEntry)  // Initial findOne
        .mockResolvedValueOnce(mockEntry); // Reload after auto-removal check
      mockRedisClient.sismember.mockResolvedValue(0); // Not voted yet
      mockRedisClient.sadd.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.scard.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      mockRoomMemberRepository.count.mockResolvedValue(10); // Total members

      const result = await service.downvoteEntry(roomCode, entryId, userId);

      expect(result.userVote).toBe('down');
      expect(mockRedisClient.sadd).toHaveBeenCalledWith(`queue:${entryId}:downvotes`, userId);
      expect(mockRedisClient.expire).toHaveBeenCalledWith(`queue:${entryId}:downvotes`, 7 * 24 * 60 * 60);
    });

    it('should throw BadRequestException if already voted', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        isPlayed: false,
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockRedisClient.sismember.mockResolvedValueOnce(0).mockResolvedValueOnce(1); // Already downvoted

      await expect(
        service.downvoteEntry(roomCode, entryId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if trying to vote on own song', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        addedById: userId, // User is the creator
        isPlayed: false,
        addedBy: { id: userId, username: 'user1', displayName: 'User 1' },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);

      await expect(
        service.downvoteEntry(roomCode, entryId, userId),
      ).rejects.toThrow(BadRequestException);
      expect(mockRedisClient.sadd).not.toHaveBeenCalled();
    });
  });

  describe('auto-removal at 51% downvotes', () => {
    const roomCode = 'ABC123';
    const userId = uuidv4();
    const roomId = uuidv4();
    const entryId = uuidv4();

    it('should auto-remove entry when 51% of members downvote', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        youtubeVideoId: 'video1',
        youtubeUrl: 'url1',
        title: 'Song 1',
        artist: 'Artist 1',
        thumbnailUrl: 'thumb1.jpg',
        durationSeconds: 180,
        addedById: uuidv4(),
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
        isPlayed: false,
        createdAt: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne
        .mockResolvedValueOnce(mockEntry) // For downvote
        .mockResolvedValueOnce(mockEntry) // For auto-removal check
        .mockResolvedValueOnce(null); // Reload after auto-removal (entry was removed)
      mockRedisClient.sismember.mockResolvedValue(0); // Not voted yet
      mockRedisClient.sadd.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      // getVoteScore is called in downvoteEntry and in shouldAutoRemove (called by checkAndRemoveDownvoted)
      // Each getVoteScore call makes 2 scard calls (upvotes and downvotes)
      mockRedisClient.scard
        .mockResolvedValueOnce(0) // upvotes for getVoteScore in downvoteEntry
        .mockResolvedValueOnce(6) // downvotes for getVoteScore in downvoteEntry (60%)
        .mockResolvedValueOnce(0) // upvotes for getVoteScore in shouldAutoRemove
        .mockResolvedValueOnce(6); // downvotes for getVoteScore in shouldAutoRemove
      mockRoomMemberRepository.count.mockResolvedValue(10); // 10 total members = 60% downvoted
      mockQueueEntryRepository.remove.mockResolvedValue(mockEntry);

      await service.downvoteEntry(roomCode, entryId, userId);

      expect(mockQueueEntryRepository.remove).toHaveBeenCalled();
      expect(mockRedisClient.del).toHaveBeenCalledWith(`queue:${entryId}:upvotes`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`queue:${entryId}:downvotes`);
    });

    it('should not auto-remove entry when less than 51% downvotes', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        youtubeVideoId: 'video1',
        youtubeUrl: 'url1',
        title: 'Song 1',
        artist: 'Artist 1',
        thumbnailUrl: 'thumb1.jpg',
        durationSeconds: 180,
        addedById: uuidv4(),
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
        isPlayed: false,
        createdAt: new Date(),
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne
        .mockResolvedValueOnce(mockEntry) // Initial findOne
        .mockResolvedValueOnce(mockEntry); // Reload after auto-removal check (not removed)
      mockRedisClient.sismember.mockResolvedValue(0); // Not voted yet
      mockRedisClient.sadd.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockRedisClient.scard
        .mockResolvedValueOnce(0) // upvotes for getVoteScore in downvoteEntry
        .mockResolvedValueOnce(3) // downvotes for getVoteScore in downvoteEntry
        .mockResolvedValueOnce(0) // upvotes for getVoteScore in shouldAutoRemove
        .mockResolvedValueOnce(3); // downvotes for getVoteScore in shouldAutoRemove
      mockRoomMemberRepository.count.mockResolvedValue(10); // 10 total members = 30% downvoted

      await service.downvoteEntry(roomCode, entryId, userId);

      expect(mockQueueEntryRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('removeFromQueue', () => {
    const roomCode = 'ABC123';
    const userId = uuidv4();
    const roomId = uuidv4();
    const entryId = uuidv4();

    it('should allow creator to remove their own song', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockEntry = {
        id: entryId,
        roomId,
        addedById: userId, // Creator
        isPlayed: false,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockQueueEntryRepository.remove.mockResolvedValue(mockEntry);

      const result = await service.removeFromQueue(roomCode, entryId, userId);

      expect(result.message).toBe('Song removed from queue');
      expect(mockQueueEntryRepository.remove).toHaveBeenCalled();
      expect(mockRedisClient.del).toHaveBeenCalledWith(`queue:${entryId}:upvotes`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`queue:${entryId}:downvotes`);
    });

    it('should throw ForbiddenException if not creator and not auto-removable', async () => {
      const mockRoom = { id: roomId, roomCode };
      const mockEntry = {
        id: entryId,
        roomId,
        addedById: uuidv4(), // Different user
        isPlayed: false,
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockRoomMemberRepository.count.mockResolvedValue(10);
      mockRedisClient.scard.mockResolvedValue(2); // Only 20% downvoted

      await expect(
        service.removeFromQueue(roomCode, entryId, userId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markAsPlayed', () => {
    it('should mark entry as played and cleanup votes', async () => {
      const entryId = uuidv4();
      const mockEntry = {
        id: entryId,
        isPlayed: false,
        playedAt: null,
      };

      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockQueueEntryRepository.save.mockResolvedValue({
        ...mockEntry,
        isPlayed: true,
        playedAt: expect.any(Date),
      });

      await service.markAsPlayed(entryId);

      expect(mockQueueEntryRepository.save).toHaveBeenCalled();
      expect(mockEntry.isPlayed).toBe(true);
      expect(mockEntry.playedAt).toBeInstanceOf(Date);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`queue:${entryId}:upvotes`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`queue:${entryId}:downvotes`);
    });
  });

  describe('getNextSong', () => {
    it('should return song with highest net score', async () => {
      const roomId = uuidv4();
      const entry1 = {
        id: uuidv4(),
        roomId,
        isPlayed: false,
        addedBy: {},
      };
      const entry2 = {
        id: uuidv4(),
        roomId,
        isPlayed: false,
        addedBy: {},
      };

      mockQueueEntryRepository.find.mockResolvedValue([entry1, entry2]);

      // entry1 has net score of 5, entry2 has net score of 2
      mockRedisClient.scard
        .mockResolvedValueOnce(7) // entry1 upvotes
        .mockResolvedValueOnce(2) // entry1 downvotes
        .mockResolvedValueOnce(3) // entry2 upvotes
        .mockResolvedValueOnce(1); // entry2 downvotes

      const result = await service.getNextSong(roomId);

      expect(result?.id).toBe(entry1.id);
    });

    it('should return null if no songs in queue', async () => {
      const roomId = uuidv4();
      mockQueueEntryRepository.find.mockResolvedValue([]);

      const result = await service.getNextSong(roomId);

      expect(result).toBeNull();
    });
  });

  describe('vote locking', () => {
    it('should prevent changing vote from upvote to downvote', async () => {
      const roomCode = 'ABC123';
      const userId = uuidv4();
      const roomId = uuidv4();
      const entryId = uuidv4();
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        isPlayed: false,
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockRedisClient.sismember.mockResolvedValueOnce(1); // Already upvoted

      await expect(
        service.downvoteEntry(roomCode, entryId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should prevent changing vote from downvote to upvote', async () => {
      const roomCode = 'ABC123';
      const userId = uuidv4();
      const roomId = uuidv4();
      const entryId = uuidv4();
      const mockRoom = { id: roomId, roomCode };
      const mockMember = { id: uuidv4(), roomId, userId };
      const mockEntry = {
        id: entryId,
        roomId,
        isPlayed: false,
        addedBy: { id: uuidv4(), username: 'user1', displayName: 'User 1' },
      };

      mockRoomRepository.findOne.mockResolvedValue(mockRoom);
      mockRoomMemberRepository.findOne.mockResolvedValue(mockMember);
      mockQueueEntryRepository.findOne.mockResolvedValue(mockEntry);
      mockRedisClient.sismember
        .mockResolvedValueOnce(0) // Not upvoted
        .mockResolvedValueOnce(1); // Already downvoted

      await expect(
        service.upvoteEntry(roomCode, entryId, userId),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
