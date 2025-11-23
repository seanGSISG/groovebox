import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { QueueEntry } from '../types/queue.types';

interface QueueItemProps {
  entry: QueueEntry;
  onUpvote: (entryId: string) => void;
  onDownvote: (entryId: string) => void;
  currentUserId: string;
}

export const QueueItem: React.FC<QueueItemProps> = ({
  entry,
  onUpvote,
  onDownvote,
  currentUserId,
}) => {
  const isOwnSong = entry.addedBy.id === currentUserId;
  const hasUpvoted = entry.userVote === 'up';
  const hasDownvoted = entry.userVote === 'down';
  const hasVoted = entry.userVote !== null;

  const handleUpvote = () => {
    if (!isOwnSong && !hasVoted) {
      onUpvote(entry.id);
    }
  };

  const handleDownvote = () => {
    if (!isOwnSong && !hasVoted) {
      onDownvote(entry.id);
    }
  };

  return (
    <View style={styles.container}>
      {/* Vote buttons column */}
      <View style={styles.voteColumn}>
        <TouchableOpacity
          style={[
            styles.voteButton,
            hasUpvoted && styles.voteButtonActive,
            (isOwnSong || hasVoted) && styles.voteButtonDisabled,
          ]}
          onPress={handleUpvote}
          disabled={isOwnSong || hasVoted}
        >
          <Text style={[styles.voteArrow, hasUpvoted && styles.voteArrowActive]}>▲</Text>
        </TouchableOpacity>
        <Text style={[styles.netScore, entry.netScore > 0 && styles.netScorePositive]}>
          {entry.netScore > 0 ? '+' : ''}
          {entry.netScore}
        </Text>
        <TouchableOpacity
          style={[
            styles.voteButton,
            hasDownvoted && styles.voteButtonActive,
            (isOwnSong || hasVoted) && styles.voteButtonDisabled,
          ]}
          onPress={handleDownvote}
          disabled={isOwnSong || hasVoted}
        >
          <Text style={[styles.voteArrow, hasDownvoted && styles.voteArrowActive]}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* Thumbnail */}
      <Image source={{ uri: entry.thumbnailUrl }} style={styles.thumbnail} />

      {/* Song info */}
      <View style={styles.songInfo}>
        <Text style={styles.title} numberOfLines={1}>
          {entry.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {entry.artist}
        </Text>
        <Text style={styles.addedBy} numberOfLines={1}>
          Added by {entry.addedBy.displayName}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1f3a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  voteColumn: {
    alignItems: 'center',
    marginRight: 12,
    width: 40,
  },
  voteButton: {
    padding: 4,
  },
  voteButtonActive: {
    // Active state handled by arrow color
  },
  voteButtonDisabled: {
    opacity: 0.5,
  },
  voteArrow: {
    fontSize: 20,
    color: '#666',
  },
  voteArrowActive: {
    color: '#8b5cf6',
  },
  netScore: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    marginVertical: 4,
  },
  netScorePositive: {
    color: '#8b5cf6',
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  songInfo: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  artist: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
  addedBy: {
    fontSize: 12,
    color: '#666',
  },
});
