import { VoteSession, MutinySuccessEvent, MutinyFailedEvent } from './vote.types';
import { QueueState, QueueEntry } from './queue.types';

export interface ServerToClientEvents {
  'sync:pong': (data: any) => void;
  'playback:start': (data: any) => void;
  'playback:pause': () => void;
  'playback:stop': () => void;
  'playback:sync': (data: any) => void;
  'room:state': (data: any) => void;
  'chat:message': (data: any) => void;
  'room:members-changed': (data: any) => void;
  'vote:election-started': (data: VoteSession) => void;
  'vote:mutiny-started': (data: VoteSession) => void;
  'vote:results-updated': (data: VoteSession) => void;
  'vote:complete': (data: VoteSession) => void;
  'mutiny:success': (data: MutinySuccessEvent) => void;
  'mutiny:failed': (data: MutinyFailedEvent) => void;
  'dj:changed': (data: any) => void;
  'queue:state': (data: QueueState) => void;
  'queue:updated': (data: QueueState) => void;
  'queue:vote-updated': (data: { entryId: string; upvoteCount: number; downvoteCount: number; netScore: number; userVote: 'up' | 'down' | null }) => void;
  'queue:entry-removed': (data: { entryId: string; reason?: string }) => void;
  'exception': (data: { message: string; context?: any }) => void;
}

export interface ClientToServerEvents {
  'sync:ping': (data: { clientT0: number }) => void;
  'sync:report': (data: { offset: number; rtt: number }) => void;
  'playback:start': (data: any) => void;
  'playback:pause': () => void;
  'playback:stop': () => void;
  'room:join': (data: { roomCode: string }) => void;
  'room:leave': () => void;
  'chat:message': (data: { message: string }) => void;
  'vote:start-election': (roomCode: string) => void;
  'vote:cast-dj': (data: { voteSessionId: string; targetUserId: string }) => void;
  'vote:start-mutiny': (roomCode: string) => void;
  'vote:cast-mutiny': (data: { voteSessionId: string; voteValue: boolean }) => void;
  'dj:randomize': (roomCode: string) => void;
  'queue:get': () => void;
  'queue:add': (data: { youtubeUrl: string }) => void;
  'queue:upvote': (data: { entryId: string }) => void;
  'queue:downvote': (data: { entryId: string }) => void;
  'queue:remove': (data: { entryId: string }) => void;
}
