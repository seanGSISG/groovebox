import { Controller, Post, Get, Body, Param, UseGuards, Req } from '@nestjs/common';
import { VotesService } from './votes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CastVoteDto, VoteResultsDto } from './dto';

@Controller('votes')
@UseGuards(JwtAuthGuard)
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post(':sessionId/cast')
  async castVote(
    @Param('sessionId') sessionId: string,
    @Body() castVoteDto: CastVoteDto,
    @Req() req: any,
  ): Promise<VoteResultsDto> {
    const userId = req.user.userId;
    // Need to get roomId from session - will be handled by WebSocket primarily
    // This endpoint is for backup/manual testing
    throw new Error('Use WebSocket events for voting');
  }

  @Get(':sessionId')
  async getVoteResults(@Param('sessionId') sessionId: string): Promise<VoteResultsDto> {
    return this.votesService.getVoteResults(sessionId);
  }
}
