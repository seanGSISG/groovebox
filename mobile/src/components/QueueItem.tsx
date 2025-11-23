import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SongSubmission } from '../types/queue.types';

interface QueueItemProps {
  submission: SongSubmission;
  onVote: (submissionId: string) => void;
  onUnvote: (submissionId: string) => void;
  onRemove?: (submissionId: string) => void;
  currentUserId: string | null;
}

export const QueueItem: React.FC<QueueItemProps> = ({
  submission,
  onVote,
  onUnvote,
  onRemove,
  currentUserId,
}) => {
  const handleVoteToggle = () => {
    if (submission.hasVoted) {
      onUnvote(submission.id);
    } else {
      onVote(submission.id);
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Song',
      'Are you sure you want to remove this submission?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => onRemove?.(submission.id),
        },
      ],
    );
  };

  const canRemove = currentUserId === submission.submittedBy && onRemove;

  return (
    <View style={styles.container}>
      <View style={styles.leftSection}>
        <TouchableOpacity
          style={[styles.voteButton, submission.hasVoted && styles.votedButton]}
          onPress={handleVoteToggle}
        >
          <Text style={styles.voteIcon}>▲</Text>
          <Text style={styles.voteCount}>{submission.voteCount}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.middleSection}>
        <Text style={styles.songTitle} numberOfLines={1}>
          {submission.songTitle || 'Untitled'}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {submission.artist || 'Unknown Artist'}
        </Text>
        <Text style={styles.submitter} numberOfLines={1}>
          Added by {submission.submitterDisplayName}
        </Text>
      </View>

      {canRemove && (
        <TouchableOpacity style={styles.removeButton} onPress={handleRemove}>
          <Text style={styles.removeIcon}>×</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1e1e2e',
    borderRadius: 8,
    marginBottom: 8,
  },
  leftSection: {
    marginRight: 12,
  },
  voteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 50,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#2a2a3e',
  },
  votedButton: {
    backgroundColor: '#5865F2',
  },
  voteIcon: {
    fontSize: 18,
    color: '#fff',
    marginBottom: 2,
  },
  voteCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  middleSection: {
    flex: 1,
  },
  songTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  artist: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 2,
  },
  submitter: {
    fontSize: 12,
    color: '#808080',
  },
  removeButton: {
    padding: 8,
    marginLeft: 8,
  },
  removeIcon: {
    fontSize: 28,
    color: '#ff5555',
    fontWeight: 'bold',
  },
});
