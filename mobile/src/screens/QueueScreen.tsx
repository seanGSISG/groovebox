import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../hooks/useToast';
import { QueueEntry, QueueState } from '../types/queue.types';
import { QueueItem } from '../components/QueueItem';
import { AddSongModal } from '../components/AddSongModal';
import { Toast } from '../components/Toast';

export const QueueScreen: React.FC = () => {
  const socket = useSocket();
  const { user } = useAuth();
  const { toast, showToast, hideToast } = useToast();

  const [queueState, setQueueState] = useState<QueueState>({
    entries: [],
    currentlyPlaying: null,
    totalEntries: 0,
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch queue state
  const fetchQueue = useCallback(() => {
    if (socket) {
      socket.emit('queue:get');
    }
  }, [socket]);

  // Handle queue state updates
  useEffect(() => {
    if (!socket) return;

    // Request initial queue state
    fetchQueue();

    // Listen for queue state events
    const handleQueueState = (data: QueueState) => {
      console.log('[Queue] Queue state received:', data);
      setQueueState(data);
      setRefreshing(false);
    };

    const handleQueueUpdated = (data: QueueState) => {
      console.log('[Queue] Queue updated:', data);
      setQueueState(data);
    };

    const handleVoteUpdated = (data: {
      entryId: string;
      upvoteCount: number;
      downvoteCount: number;
      netScore: number;
      userVote: 'up' | 'down' | null;
    }) => {
      console.log('[Queue] Vote updated:', data);
      setQueueState((prev) => ({
        ...prev,
        entries: prev.entries.map((entry) =>
          entry.id === data.entryId
            ? {
                ...entry,
                upvoteCount: data.upvoteCount,
                downvoteCount: data.downvoteCount,
                netScore: data.netScore,
                userVote: data.userVote,
              }
            : entry
        ),
      }));
    };

    const handleEntryRemoved = (data: { entryId: string; reason?: string }) => {
      console.log('[Queue] Entry removed:', data);
      setQueueState((prev) => {
        const removedEntry = prev.entries.find((entry) => entry.id === data.entryId);

        // Show toast notification for auto-removal
        if (removedEntry && data.reason) {
          showToast({
            message: `"${removedEntry.title}" was removed: ${data.reason}`,
            type: 'warning',
          });
        }

        return {
          ...prev,
          entries: prev.entries.filter((entry) => entry.id !== data.entryId),
          totalEntries: prev.totalEntries - 1,
        };
      });
    };

    const handleQueueError = (error: { message: string }) => {
      console.error('[Queue] Error:', error);
      showToast({
        message: error.message || 'Queue operation failed',
        type: 'error'
      });
    };

    socket.on('queue:state', handleQueueState);
    socket.on('queue:updated', handleQueueUpdated);
    socket.on('queue:vote-updated', handleVoteUpdated);
    socket.on('queue:entry-removed', handleEntryRemoved);
    socket.on('exception', handleQueueError);

    return () => {
      socket.off('queue:state', handleQueueState);
      socket.off('queue:updated', handleQueueUpdated);
      socket.off('queue:vote-updated', handleVoteUpdated);
      socket.off('queue:entry-removed', handleEntryRemoved);
      socket.off('exception', handleQueueError);
    };
  }, [socket, fetchQueue, showToast]);

  // Handle upvote
  const handleUpvote = useCallback(
    (entryId: string) => {
      if (!socket) {
        showToast({ message: 'Not connected to server', type: 'error' });
        return;
      }

      // Store previous state for potential reversion
      let previousEntry: QueueEntry | null = null;

      setQueueState((prev) => {
        const entry = prev.entries.find((e) => e.id === entryId);

        if (!entry) {
          return prev;
        }

        if (entry.addedBy.id === user?.id) {
          showToast({ message: 'You cannot vote on your own song', type: 'warning' });
          return prev;
        }

        if (entry.userVote) {
          showToast({ message: 'You have already voted on this song', type: 'warning' });
          return prev;
        }

        // Store previous state
        previousEntry = entry;

        // Optimistic update
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === entryId
              ? { ...e, upvoteCount: e.upvoteCount + 1, netScore: e.netScore + 1, userVote: 'up' as const }
              : e
          ),
        };
      });

      // Only emit if we actually updated
      if (previousEntry) {
        // Listen for error to revert optimistic update
        const handleVoteError = (error: any) => {
          if (error.context?.entryId === entryId) {
            // Revert optimistic update
            setQueueState((prev) => ({
              ...prev,
              entries: prev.entries.map((e) =>
                e.id === entryId ? previousEntry! : e
              ),
            }));
            showToast({ message: error.message || 'Failed to vote', type: 'error' });
            socket.off('exception', handleVoteError);
          }
        };

        socket.once('exception', handleVoteError);

        // Remove error listener after timeout
        setTimeout(() => {
          socket.off('exception', handleVoteError);
        }, 5000);

        socket.emit('queue:upvote', { entryId });
      }
    },
    [socket, user?.id, showToast]
  );

  // Handle downvote
  const handleDownvote = useCallback(
    (entryId: string) => {
      if (!socket) {
        showToast({ message: 'Not connected to server', type: 'error' });
        return;
      }

      // Store previous state for potential reversion
      let previousEntry: QueueEntry | null = null;

      setQueueState((prev) => {
        const entry = prev.entries.find((e) => e.id === entryId);

        if (!entry) {
          return prev;
        }

        if (entry.addedBy.id === user?.id) {
          showToast({ message: 'You cannot vote on your own song', type: 'warning' });
          return prev;
        }

        if (entry.userVote) {
          showToast({ message: 'You have already voted on this song', type: 'warning' });
          return prev;
        }

        // Store previous state
        previousEntry = entry;

        // Optimistic update
        return {
          ...prev,
          entries: prev.entries.map((e) =>
            e.id === entryId
              ? { ...e, downvoteCount: e.downvoteCount + 1, netScore: e.netScore - 1, userVote: 'down' as const }
              : e
          ),
        };
      });

      // Only emit if we actually updated
      if (previousEntry) {
        // Listen for error to revert optimistic update
        const handleVoteError = (error: any) => {
          if (error.context?.entryId === entryId) {
            // Revert optimistic update
            setQueueState((prev) => ({
              ...prev,
              entries: prev.entries.map((e) =>
                e.id === entryId ? previousEntry! : e
              ),
            }));
            showToast({ message: error.message || 'Failed to vote', type: 'error' });
            socket.off('exception', handleVoteError);
          }
        };

        socket.once('exception', handleVoteError);

        // Remove error listener after timeout
        setTimeout(() => {
          socket.off('exception', handleVoteError);
        }, 5000);

        socket.emit('queue:downvote', { entryId });
      }
    },
    [socket, user?.id, showToast]
  );

  // Handle add song
  const handleAddSong = async (youtubeUrl: string) => {
    if (!socket) {
      throw new Error('Not connected to server');
    }

    return new Promise<void>((resolve, reject) => {
      let timeout: NodeJS.Timeout;

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('exception', handleError);
      };

      const handleError = (error: any) => {
        cleanup();
        reject(new Error(error.message || 'Failed to add song'));
      };

      timeout = setTimeout(() => {
        cleanup();
        // Assume success if no error event received within timeout
        showToast({ message: 'Song added to queue', type: 'success' });
        resolve();
      }, 3000);

      socket.once('exception', handleError);
      socket.emit('queue:add', { youtubeUrl });
    });
  };

  // Handle pull to refresh
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchQueue();
  }, [fetchQueue]);

  // Render queue item
  const renderQueueItem = ({ item }: { item: QueueEntry }) => (
    <QueueItem
      entry={item}
      onUpvote={handleUpvote}
      onDownvote={handleDownvote}
      currentUserId={user?.id || ''}
    />
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateText}>No songs in queue</Text>
      <Text style={styles.emptyStateSubtext}>Be the first to add a song!</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Queue</Text>
        <Text style={styles.headerSubtitle}>Next up based on votes</Text>
      </View>

      {/* Currently Playing */}
      {queueState.currentlyPlaying && (
        <View style={styles.currentlyPlayingContainer}>
          <View style={styles.playingBadge}>
            <Text style={styles.playingBadgeText}>Playing</Text>
          </View>
          <QueueItem
            entry={queueState.currentlyPlaying}
            onUpvote={() => {}} // Disabled for currently playing song
            onDownvote={() => {}}
            currentUserId={user?.id || ''}
          />
        </View>
      )}

      {/* Queue List */}
      <FlatList
        data={queueState.entries}
        renderItem={renderQueueItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8b5cf6"
          />
        }
      />

      {/* Add Song Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <Text style={styles.addButtonText}>+ Add Song</Text>
      </TouchableOpacity>

      {/* Add Song Modal */}
      <AddSongModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddSong}
      />

      {/* Toast */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onHide={hideToast}
        duration={toast.duration}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1329',
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#1a1f3a',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#999',
  },
  currentlyPlayingContainer: {
    padding: 16,
    backgroundColor: '#1a1f3a',
    marginBottom: 8,
  },
  playingBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  playingBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
  },
  addButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#1a1f3a',
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '600',
  },
});
