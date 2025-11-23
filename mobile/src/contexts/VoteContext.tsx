import React, { createContext, useContext, useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { VoteSession, VoteType, RoomMember, MutinySuccessEvent, MutinyFailedEvent } from '../types/vote.types';

interface VoteContextType {
  currentVote: VoteSession | null;
  hasVoted: boolean;
  startElection: (roomCode: string) => boolean;
  voteForDj: (voteSessionId: string, targetUserId: string) => boolean;
  startMutiny: (roomCode: string) => boolean;
  voteOnMutiny: (voteSessionId: string, voteValue: boolean) => boolean;
  randomizeDj: (roomCode: string) => boolean;
}

const VoteContext = createContext<VoteContextType | undefined>(undefined);

interface VoteProviderProps {
  children: React.ReactNode;
  socket: Socket | null;
  userId: string | null;
}

export const VoteProvider: React.FC<VoteProviderProps> = ({ children, socket, userId }) => {
  const [currentVote, setCurrentVote] = useState<VoteSession | null>(null);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    if (!socket) return;

    // Listen for vote events
    socket.on('vote:election-started', (data: VoteSession) => {
      console.log('[Vote] Election started:', data);
      setCurrentVote(data);
      setHasVoted(false);
    });

    socket.on('vote:mutiny-started', (data: VoteSession) => {
      console.log('[Vote] Mutiny started:', data);
      setCurrentVote(data);
      setHasVoted(false);
    });

    socket.on('vote:results-updated', (data: VoteSession) => {
      console.log('[Vote] Results updated:', data);
      setCurrentVote(data);
    });

    socket.on('vote:complete', (data: VoteSession) => {
      console.log('[Vote] Vote complete:', data);
      setCurrentVote(null);
      setHasVoted(false);
    });

    socket.on('mutiny:success', (data: MutinySuccessEvent) => {
      console.log('[Vote] Mutiny succeeded:', data);
      setCurrentVote(null);
      setHasVoted(false);
    });

    socket.on('mutiny:failed', (data: MutinyFailedEvent) => {
      console.log('[Vote] Mutiny failed:', data);
      setCurrentVote(null);
      setHasVoted(false);
    });

    return () => {
      socket.off('vote:election-started');
      socket.off('vote:mutiny-started');
      socket.off('vote:results-updated');
      socket.off('vote:complete');
      socket.off('mutiny:success');
      socket.off('mutiny:failed');
    };
  }, [socket]);

  const startElection = (roomCode: string): boolean => {
    if (!socket) {
      console.error('[Vote] Cannot start election: socket not connected');
      return false;
    }
    socket.emit('vote:start-election', roomCode);
    return true;
  };

  const voteForDj = (voteSessionId: string, targetUserId: string): boolean => {
    if (!socket) {
      console.error('[Vote] Cannot vote for DJ: socket not connected');
      return false;
    }

    if (!currentVote || currentVote.voteSessionId !== voteSessionId) {
      console.error('[Vote] Cannot vote: no active vote session or session ID mismatch');
      return false;
    }

    if (hasVoted) {
      console.error('[Vote] Cannot vote: already voted in this session');
      return false;
    }

    if (userId && targetUserId === userId) {
      console.error('[Vote] Cannot vote for yourself');
      return false;
    }

    socket.emit('vote:cast-dj', { voteSessionId, targetUserId });
    setHasVoted(true);
    return true;
  };

  const startMutiny = (roomCode: string): boolean => {
    if (!socket) {
      console.error('[Vote] Cannot start mutiny: socket not connected');
      return false;
    }
    socket.emit('vote:start-mutiny', roomCode);
    return true;
  };

  const voteOnMutiny = (voteSessionId: string, voteValue: boolean): boolean => {
    if (!socket) {
      console.error('[Vote] Cannot vote on mutiny: socket not connected');
      return false;
    }

    if (!currentVote || currentVote.voteSessionId !== voteSessionId) {
      console.error('[Vote] Cannot vote: no active vote session or session ID mismatch');
      return false;
    }

    if (hasVoted) {
      console.error('[Vote] Cannot vote: already voted in this session');
      return false;
    }

    socket.emit('vote:cast-mutiny', { voteSessionId, voteValue });
    setHasVoted(true);
    return true;
  };

  const randomizeDj = (roomCode: string): boolean => {
    if (!socket) {
      console.error('[Vote] Cannot randomize DJ: socket not connected');
      return false;
    }
    socket.emit('dj:randomize', roomCode);
    return true;
  };

  return (
    <VoteContext.Provider
      value={{
        currentVote,
        hasVoted,
        startElection,
        voteForDj,
        startMutiny,
        voteOnMutiny,
        randomizeDj,
      }}
    >
      {children}
    </VoteContext.Provider>
  );
};

export const useVote = (): VoteContextType => {
  const context = useContext(VoteContext);
  if (!context) {
    throw new Error('useVote must be used within VoteProvider');
  }
  return context;
};
