import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SongSubmission, SongSubmissionVote, User } from '../entities';
import { SubmitSongDto, SongSubmissionDto, QueueStateDto } from './dto';

@Injectable()
export class QueueService {
  constructor(
    @InjectRepository(SongSubmission)
    private songSubmissionRepository: Repository<SongSubmission>,
    @InjectRepository(SongSubmissionVote)
    private voteRepository: Repository<SongSubmissionVote>,
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

    const submission = this.songSubmissionRepository.create({
      roomId,
      submittedBy: userId,
      youtubeUrl: submitSongDto.youtubeUrl,
      songTitle: submitSongDto.songTitle,
      artist: submitSongDto.artist,
      voteCount: 1, // Auto-upvote by submitter
    });

    const saved = await this.songSubmissionRepository.save(submission);

    // Auto-vote by submitter
    const vote = this.voteRepository.create({
      submissionId: saved.id,
      userId,
    });
    await this.voteRepository.save(vote);

    return saved;
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
        submissionId: submissions.map(s => s.id) as any,
      },
    });

    const userVoteMap = new Set(userVotes.map(v => v.submissionId));

    const submissionDtos: SongSubmissionDto[] = submissions.map(sub => ({
      id: sub.id,
      roomId: sub.roomId,
      submittedBy: sub.submittedBy,
      submitterUsername: (sub.submitter as any).username,
      submitterDisplayName: (sub.submitter as any).displayName,
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

    // Check if already voted
    const existingVote = await this.voteRepository.findOne({
      where: { submissionId, userId },
    });

    if (existingVote) {
      throw new BadRequestException('You have already voted for this song');
    }

    // Create vote
    const vote = this.voteRepository.create({
      submissionId,
      userId,
    });
    await this.voteRepository.save(vote);

    // Increment vote count
    submission.voteCount += 1;
    return await this.songSubmissionRepository.save(submission);
  }

  async unvoteSubmission(submissionId: string, userId: string): Promise<SongSubmission> {
    const submission = await this.songSubmissionRepository.findOne({
      where: { id: submissionId, isActive: true },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const vote = await this.voteRepository.findOne({
      where: { submissionId, userId },
    });

    if (!vote) {
      throw new BadRequestException('You have not voted for this song');
    }

    // Remove vote
    await this.voteRepository.remove(vote);

    // Decrement vote count
    submission.voteCount = Math.max(0, submission.voteCount - 1);
    return await this.songSubmissionRepository.save(submission);
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
      where: { id: submissionId },
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
