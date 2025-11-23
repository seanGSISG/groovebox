import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { QueueItem } from './QueueItem';
import { SongSubmission } from '../types/queue.types';

interface QueueListProps {
  submissions: SongSubmission[];
  onVote: (submissionId: string) => void;
  onUnvote: (submissionId: string) => void;
  onRemove?: (submissionId: string) => void;
  currentUserId: string | null;
}

export const QueueList: React.FC<QueueListProps> = ({
  submissions,
  onVote,
  onUnvote,
  onRemove,
  currentUserId,
}) => {
  if (submissions.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No songs in queue</Text>
        <Text style={styles.emptySubtext}>
          Be the first to submit a song!
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={submissions}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <QueueItem
          submission={item}
          onVote={onVote}
          onUnvote={onUnvote}
          onRemove={onRemove}
          currentUserId={currentUserId}
        />
      )}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#808080',
  },
});
