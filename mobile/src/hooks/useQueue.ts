import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import { QueueState, SongSubmission } from '../types/queue.types';

export const useQueue = (roomCode: string | null) => {
  const { socket } = useSocket();
  const [queueState, setQueueState] = useState<QueueState>({
    submissions: [],
    totalSubmissions: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Fetch initial queue state
  const fetchQueue = useCallback(() => {
    if (!socket || !roomCode) return;

    setIsLoading(true);
    socket.emit('queue:get', { roomCode }, (response: any) => {
      setIsLoading(false);
      if (!response.error) {
        setQueueState(response);
      }
    });
  }, [socket, roomCode]);

  // Submit a new song
  const submitSong = useCallback(
    (youtubeUrl: string, songTitle?: string, artist?: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit(
          'queue:submit',
          { roomCode, youtubeUrl, songTitle, artist },
          (response: any) => {
            if (response.error) {
              reject(new Error(response.error));
            } else {
              resolve();
            }
          },
        );
      });
    },
    [socket, roomCode],
  );

  // Vote for a submission
  const voteForSubmission = useCallback(
    (submissionId: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit('queue:vote', { roomCode, submissionId }, (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        });
      });
    },
    [socket, roomCode],
  );

  // Unvote a submission
  const unvoteSubmission = useCallback(
    (submissionId: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit('queue:unvote', { roomCode, submissionId }, (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        });
      });
    },
    [socket, roomCode],
  );

  // Remove own submission
  const removeSubmission = useCallback(
    (submissionId: string) => {
      return new Promise<void>((resolve, reject) => {
        if (!socket || !roomCode) {
          reject(new Error('Not connected'));
          return;
        }

        socket.emit('queue:remove', { roomCode, submissionId }, (response: any) => {
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve();
          }
        });
      });
    },
    [socket, roomCode],
  );

  // Listen for queue updates
  useEffect(() => {
    if (!socket) return;

    const handleQueueUpdated = (newQueueState: QueueState) => {
      setQueueState(newQueueState);
    };

    socket.on('queue:updated', handleQueueUpdated);

    return () => {
      socket.off('queue:updated', handleQueueUpdated);
    };
  }, [socket]);

  // Fetch queue on mount
  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  return {
    queueState,
    isLoading,
    submitSong,
    voteForSubmission,
    unvoteSubmission,
    removeSubmission,
    refetchQueue: fetchQueue,
  };
};
