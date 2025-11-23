import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { VoteState, VoteType } from '../types/voting.types';

interface VoteCardProps {
  voteState: VoteState;
  onVote: (voteFor: boolean) => void;
  hasVoted: boolean;
  currentUserId: string | null;
}

export const VoteCard: React.FC<VoteCardProps> = ({
  voteState,
  onVote,
  hasVoted,
  currentUserId,
}) => {
  const handleVote = (voteFor: boolean) => {
    if (hasVoted) {
      Alert.alert('Already Voted', 'You have already cast your vote.');
      return;
    }

    const voteText = voteFor ? 'FOR' : 'AGAINST';
    const message =
      voteState.voteType === VoteType.DJ_ELECTION
        ? `Vote ${voteText} electing ${voteState.targetUsername} as DJ?`
        : `Vote ${voteText} removing the current DJ?`;

    Alert.alert('Confirm Vote', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Vote',
        onPress: () => onVote(voteFor),
      },
    ]);
  };

  const getVoteTitle = () => {
    if (voteState.voteType === VoteType.DJ_ELECTION) {
      return `DJ Election: ${voteState.targetUsername || 'Unknown'}`;
    }
    return 'Mutiny: Remove Current DJ';
  };

  const getVoteDescription = () => {
    if (voteState.voteType === VoteType.DJ_ELECTION) {
      return `Vote to elect ${voteState.targetUsername} as the new DJ`;
    }
    return 'Vote to remove the current DJ';
  };

  const progress = (voteState.votesFor / voteState.requiredVotes) * 100;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{getVoteTitle()}</Text>
      <Text style={styles.description}>{getVoteDescription()}</Text>

      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {voteState.votesFor} / {voteState.requiredVotes} votes
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>For</Text>
          <Text style={styles.statValue}>{voteState.votesFor}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Against</Text>
          <Text style={styles.statValue}>{voteState.votesAgainst}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Needed</Text>
          <Text style={styles.statValue}>{voteState.requiredVotes}</Text>
        </View>
      </View>

      {voteState.isActive && !hasVoted && (
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.againstButton]}
            onPress={() => handleVote(false)}
          >
            <Text style={styles.buttonText}>Vote Against</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.forButton]}
            onPress={() => handleVote(true)}
          >
            <Text style={styles.buttonText}>Vote For</Text>
          </TouchableOpacity>
        </View>
      )}

      {hasVoted && voteState.isActive && (
        <Text style={styles.votedText}>You have voted</Text>
      )}

      {!voteState.isActive && (
        <View style={styles.resultContainer}>
          <Text style={[styles.resultText, voteState.passed ? styles.passed : styles.failed]}>
            {voteState.passed ? 'VOTE PASSED' : 'VOTE FAILED'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e1e2e',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#2a2a3e',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#5865F2',
  },
  progressText: {
    fontSize: 12,
    color: '#808080',
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#808080',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  forButton: {
    backgroundColor: '#43b581',
  },
  againstButton: {
    backgroundColor: '#f04747',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  votedText: {
    fontSize: 14,
    color: '#5865F2',
    textAlign: 'center',
    fontWeight: '600',
    padding: 12,
  },
  resultContainer: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resultText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  passed: {
    color: '#43b581',
  },
  failed: {
    color: '#f04747',
  },
});
