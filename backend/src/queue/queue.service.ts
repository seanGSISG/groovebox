import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { SongSubmission, SongSubmissionVote, User } from '../entities';
import { SubmitSongDto, SongSubmissionDto, QueueStateDto } from './dto';

@Injectable()
export class QueueService {
  private readonly MAX_QUEUE_SIZE = 50;
  private readonly MAX_USER_SUBMISSIONS = 5;

  constructor(
    @InjectRepository(SongSubmission)
    private songSubmissionRepository: Repository<SongSubmission>,
    @InjectRepository(SongSubmissionVote)
    private voteRepository: Repository<SongSubmissionVote>,
    private dataSource: DataSource,
  ) {}

  async submitSong(
    roomId: string,
    userId: string,
    submitSongDto: SubmitSongDto,
  ): Promise<SongSubmission> {
    // Check if URL already submitted and active in this room
    const existing = await this.songSubmissionRepository.findOne({
      where: {
        roomId,
        youtubeUrl: submitSongDto.youtubeUrl,
        isActive: true,
      },
    });

    if (existing) {
      throw new BadRequestException('This song is already in the queue');
    }

    // Check queue size limit
    const activeCount = await this.songSubmissionRepository.count({
      where: { roomId, isActive: true },
    });

    if (activeCount >= this.MAX_QUEUE_SIZE) {
      throw new BadRequestException('Queue is full (maximum 50 songs)');
    }

    // Check user submission rate limit
    const userActiveCount = await this.songSubmissionRepository.count({
      where: { roomId, submittedBy: userId, isActive: true },
    });

    if (userActiveCount >= this.MAX_USER_SUBMISSIONS) {
      throw new BadRequestException('You can only have 5 active submissions at a time');
    }

    // Use transaction to ensure submission and vote are created atomically
    return await this.dataSource.transaction(async (manager) => {
      const submission = manager.create(SongSubmission, {
        roomId,
        submittedBy: userId,
        youtubeUrl: submitSongDto.youtubeUrl,
        songTitle: submitSongDto.songTitle,
        artist: submitSongDto.artist,
        voteCount: 1, // Auto-upvote by submitter
      });

      const saved = await manager.save(SongSubmission, submission);

      // Auto-vote by submitter
      const vote = manager.create(SongSubmissionVote, {
        submissionId: saved.id,
        userId,
      });
      await manager.save(SongSubmissionVote, vote);

      return saved;
    });
  }

  async getQueueState(roomId: string, currentUserId: string): Promise<QueueStateDto> {
    const submissions = await this.songSubmissionRepository
      .createQueryBuilder('submission')
      .leftJoinAndSelect('submission.submitter', 'submitter')
      .leftJoin('submission.room', 'room')
      .where('submission.roomId = :roomId', { roomId })
      .andWhere('submission.isActive = :isActive', { isActive: true })
      .orderBy('submission.voteCount', 'DESC')
      .addOrderBy('submission.createdAt', 'ASC')
      .getMany();

    // Get user's votes for all submissions
    const userVotes = await this.voteRepository.find({
      where: {
        userId: currentUserId,
        submissionId: In(submissions.map(s => s.id)),
      },
    });

    const userVoteMap = new Set(userVotes.map(v => v.submissionId));

    const submissionDtos: SongSubmissionDto[] = submissions.map(sub => ({
      id: sub.id,
      roomId: sub.roomId,
      submittedBy: sub.submittedBy,
      submitterUsername: (sub.submitter as User).username,
      submitterDisplayName: (sub.submitter as User).displayName,
      youtubeUrl: sub.youtubeUrl,
      songTitle: sub.songTitle,
      artist: sub.artist,
      voteCount: sub.voteCount,
      hasVoted: userVoteMap.has(sub.id),
      createdAt: sub.createdAt,
    }));

    return {
      submissions: submissionDtos,
      totalSubmissions: submissions.length,
    };
  }

  async voteForSubmission(submissionId: string, userId: string): Promise<SongSubmission> {
    const submission = await this.songSubmissionRepository.findOne({
      where: { id: submissionId, isActive: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Use transaction to prevent race conditions
    return await this.dataSource.transaction(async (manager) => {
      // Check if already voted
      const existingVote = await manager.findOne(SongSubmissionVote, {
        where: { submissionId, userId },
      });

      if (existingVote) {
        throw new BadRequestException('You have already voted for this song');
      }

      // Create vote
      const vote = manager.create(SongSubmissionVote, {
        submissionId,
        userId,
      });
      await manager.save(SongSubmissionVote, vote);

      // Increment vote count
      submission.voteCount += 1;
      return await manager.save(SongSubmission, submission);
    });
  }

  async unvoteSubmission(submissionId: string, userId: string): Promise<SongSubmission> {
    const submission = await this.songSubmissionRepository.findOne({
      where: { id: submissionId, isActive: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Use transaction to prevent race conditions
    return await this.dataSource.transaction(async (manager) => {
      const vote = await manager.findOne(SongSubmissionVote, {
        where: { submissionId, userId },
      });

      if (!vote) {
        throw new BadRequestException('You have not voted for this song');
      }

      // Remove vote
      await manager.remove(SongSubmissionVote, vote);

      // Decrement vote count
      submission.voteCount = Math.max(0, submission.voteCount - 1);
      return await manager.save(SongSubmission, submission);
    });
  }

  async getTopSubmission(roomId: string): Promise<SongSubmission | null> {
    return await this.songSubmissionRepository.findOne({
      where: { roomId, isActive: true },
      order: {
        voteCount: 'DESC',
        createdAt: 'ASC',
      },
    });
  }

  async markAsPlayed(submissionId: string): Promise<void> {
    await this.songSubmissionRepository.update(submissionId, {
      isActive: false,
      playedAt: new Date(),
    });
  }

  async removeSubmission(submissionId: string, userId: string): Promise<void> {
    const submission = await this.songSubmissionRepository.findOne({
      where: { id: submissionId, isActive: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    // Only submitter can remove their own submission
    if (submission.submittedBy !== userId) {
      throw new BadRequestException('You can only remove your own submissions');
    }

    await this.songSubmissionRepository.remove(submission);
  }
}
