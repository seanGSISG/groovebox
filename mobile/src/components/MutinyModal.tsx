import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useVote } from '../contexts/VoteContext';
import { VoteType } from '../types/vote.types';

interface MutinyModalProps {
  visible: boolean;
  onClose: () => void;
  roomCode: string;
  currentDjName: string | null;
}

export const MutinyModal: React.FC<MutinyModalProps> = ({
  visible,
  onClose,
  roomCode,
  currentDjName,
}) => {
  const { currentVote, hasVoted, startMutiny, voteOnMutiny } = useVote();

  const isMutinyActive = currentVote?.voteType === VoteType.MUTINY;

  const handleStartMutiny = () => {
    Alert.alert(
      'Call Mutiny?',
      `Are you sure you want to start a vote to remove ${currentDjName || 'the current DJ'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Start Mutiny',
          style: 'destructive',
          onPress: () => startMutiny(roomCode),
        },
      ],
    );
  };

  const handleVote = (voteValue: boolean) => {
    if (!currentVote) return;
    voteOnMutiny(currentVote.voteSessionId, voteValue);
  };

  const getProgressPercentage = (): number => {
    if (!currentVote?.mutinyVotes) return 0;
    const total = currentVote.mutinyVotes.yes + currentVote.mutinyVotes.no;
    if (total === 0) return 0;
    return (currentVote.mutinyVotes.yes / total) * 100;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Mutiny</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>Close</Text>
            </TouchableOpacity>
          </View>

          {!isMutinyActive ? (
            <View style={styles.startMutinyContainer}>
              <Text style={styles.description}>
                Start a vote to remove {currentDjName || 'the current DJ'}.
              </Text>
              <Text style={styles.warning}>
                Requires {((currentVote?.threshold || 0.51) * 100).toFixed(0)}% approval
              </Text>
              <TouchableOpacity style={styles.startButton} onPress={handleStartMutiny}>
                <Text style={styles.startButtonText}>Call Mutiny</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.activeVoteContainer}>
              <Text style={styles.voteQuestion}>
                Remove {currentDjName || 'the current DJ'}?
              </Text>

              {/* Vote Progress */}
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[styles.progressFill, { width: `${getProgressPercentage()}%` }]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {currentVote.mutinyVotes?.yes || 0} Yes / {currentVote.mutinyVotes?.no || 0} No
                </Text>
                <Text style={styles.thresholdText}>
                  Need {((currentVote.threshold || 0.51) * 100).toFixed(0)}% to pass
                </Text>
              </View>

              {/* Vote Buttons */}
              {!hasVoted ? (
                <View style={styles.voteButtons}>
                  <TouchableOpacity
                    style={[styles.voteButton, styles.yesButton]}
                    onPress={() => handleVote(true)}
                  >
                    <Text style={styles.voteButtonText}>Yes - Remove DJ</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.voteButton, styles.noButton]}
                    onPress={() => handleVote(false)}
                  >
                    <Text style={styles.voteButtonText}>No - Keep DJ</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.votedContainer}>
                  <Text style={styles.votedText}>You have voted!</Text>
                  <Text style={styles.votedSubtext}>Waiting for others...</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  startMutinyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
    color: '#333',
  },
  warning: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
  },
  startButton: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  activeVoteContainer: {
    paddingVertical: 20,
  },
  voteQuestion: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 24,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF3B30',
  },
  progressText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
    fontWeight: '600',
  },
  thresholdText: {
    fontSize: 12,
    textAlign: 'center',
    color: '#666',
  },
  voteButtons: {
    gap: 12,
  },
  voteButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  yesButton: {
    backgroundColor: '#FF3B30',
  },
  noButton: {
    backgroundColor: '#4CAF50',
  },
  voteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  votedContainer: {
    alignItems: 'center',
    padding: 20,
  },
  votedText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#4CAF50',
  },
  votedSubtext: {
    fontSize: 14,
    color: '#666',
  },
});
