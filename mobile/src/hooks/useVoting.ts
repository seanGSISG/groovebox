import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import { VoteState, VoteType } from '../types/voting.types';

export const useVoting = (roomCode: string | null) => {
  const { socket } = useSocket();
  const [activeVote, setActiveVote] = useState<VoteState | null>(null);

  // Fetch active vote
  const fetchActiveVote = useCallback(() => {
    if (!socket || !roomCode) return;

    socket.emit('vote:get', { roomCode }, (response: VoteState | null) => {
      setActiveVote(response);
    });
  }, [socket, roomCode]);

  // Start a vote
  const startVote = useCallback(
    (voteType: VoteType, targetUserId?: string) => {
      return new Promise<{ voteSessionId: string; voteState: VoteState }>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit(
          'vote:start',
          { roomCode, voteType, targetUserId },
          (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve({ voteSessionId: response.voteSessionId, voteState: response.voteState });
            }
          },
        );
      });
    },
    [socket, roomCode],
  );

  // Cast a vote
  const castVote = useCallback(
    (voteSessionId: string, voteFor: boolean) => {
      return new Promise<VoteState>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit(
          'vote:cast',
          { roomCode, voteSessionId, voteFor },
          (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve(response.voteState);
            }
          },
        );
      });
    },
    [socket, roomCode],
  );

  // Listen for vote events
  useEffect(() => {
    if (!socket) return;

    const handleVoteStarted = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    const handleVoteUpdated = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    const handleVotePassed = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    const handleVoteFailed = (voteState: VoteState) => {
      setActiveVote(voteState);
    };

    socket.on('vote:started', handleVoteStarted);
    socket.on('vote:updated', handleVoteUpdated);
    socket.on('vote:passed', handleVotePassed);
    socket.on('vote:failed', handleVoteFailed);

    return () => {
      socket.off('vote:started', handleVoteStarted);
      socket.off('vote:updated', handleVoteUpdated);
      socket.off('vote:passed', handleVotePassed);
      socket.off('vote:failed', handleVoteFailed);
    };
  }, [socket]);

  // Fetch on mount
  useEffect(() => {
    fetchActiveVote();
  }, [fetchActiveVote]);

  return {
    activeVote,
    startVote,
    castVote,
    refetchVote: fetchActiveVote,
  };
};
