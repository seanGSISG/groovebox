import { QueueState, SubmitSongPayload, VotePayload, AutoPlayPayload } from './queue.types';
import { VoteState, StartVotePayload, CastVotePayload } from './voting.types';

export interface ServerToClientEvents {
  'sync:pong': (data: any) => void;
  'playback:start': (data: any) => void;
  'playback:pause': () => void;
  'playback:stop': () => void;
  'playback:sync': (data: any) => void;
  'room:state': (data: any) => void;
  'chat:message': (data: any) => void;
  'room:members-changed': (data: any) => void;
  'queue:updated': (queueState: QueueState) => void;
  'queue:auto-play': (payload: AutoPlayPayload) => void;
  'vote:started': (voteState: VoteState) => void;
  'vote:updated': (voteState: VoteState) => void;
  'vote:passed': (voteState: VoteState) => void;
  'vote:failed': (voteState: VoteState) => void;
  'dj:changed': (payload: { djId: string | null }) => void;
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
  'queue:submit': (payload: SubmitSongPayload, callback: (response: any) => void) => void;
  'queue:vote': (payload: VotePayload, callback: (response: any) => void) => void;
  'queue:unvote': (payload: VotePayload, callback: (response: any) => void) => void;
  'queue:remove': (payload: VotePayload, callback: (response: any) => void) => void;
  'queue:get': (payload: { roomCode: string }, callback: (response: QueueState | { error: string }) => void) => void;
  'playback:ended': (payload: { roomCode: string }, callback: (response: any) => void) => void;
  'vote:start': (payload: StartVotePayload, callback: (response: any) => void) => void;
  'vote:cast': (payload: CastVotePayload, callback: (response: any) => void) => void;
  'vote:get': (payload: { roomCode: string }, callback: (response: VoteState | null) => void) => void;
}
