import React, { createContext, useContext, useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { VoteSession, VoteType, RoomMember } from '../types/vote.types';

interface VoteContextType {
  currentVote: VoteSession | null;
  hasVoted: boolean;
  startElection: (roomCode: string) => void;
  voteForDj: (voteSessionId: string, targetUserId: string) => void;
  startMutiny: (roomCode: string) => void;
  voteOnMutiny: (voteSessionId: string, voteValue: boolean) => void;
  randomizeDj: (roomCode: string) => void;
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

    socket.on('mutiny:success', (data: any) => {
      console.log('[Vote] Mutiny succeeded:', data);
      setCurrentVote(null);
      setHasVoted(false);
    });

    socket.on('mutiny:failed', (data: any) => {
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

  const startElection = (roomCode: string) => {
    if (!socket) return;
    socket.emit('vote:start-election', roomCode);
  };

  const voteForDj = (voteSessionId: string, targetUserId: string) => {
    if (!socket) return;
    socket.emit('vote:cast-dj', { voteSessionId, targetUserId });
    setHasVoted(true);
  };

  const startMutiny = (roomCode: string) => {
    if (!socket) return;
    socket.emit('vote:start-mutiny', roomCode);
  };

  const voteOnMutiny = (voteSessionId: string, voteValue: boolean) => {
    if (!socket) return;
    socket.emit('vote:cast-mutiny', { voteSessionId, voteValue });
    setHasVoted(true);
  };

  const randomizeDj = (roomCode: string) => {
    if (!socket) return;
    socket.emit('dj:randomize', roomCode);
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
