import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { useVote } from '../contexts/VoteContext';
import { VoteType, RoomMember } from '../types/vote.types';

interface DjElectionModalProps {
  visible: boolean;
  onClose: () => void;
  members: RoomMember[];
  roomCode: string;
}

export const DjElectionModal: React.FC<DjElectionModalProps> = ({
  visible,
  onClose,
  members,
  roomCode,
}) => {
  const { currentVote, hasVoted, voteForDj } = useVote();
  const [showResults, setShowResults] = useState(false);

  const isElectionActive = currentVote?.voteType === VoteType.DJ_ELECTION;

  const handleVote = (userId: string) => {
    if (!currentVote || hasVoted) return;
    voteForDj(currentVote.voteSessionId, userId);
  };

  const getVoteCount = (userId: string): number => {
    if (!currentVote?.voteCounts) return 0;
    return currentVote.voteCounts[userId] || 0;
  };

  const renderMember = ({ item }: { item: RoomMember }) => {
    const voteCount = getVoteCount(item.userId);
    const hasVotes = voteCount > 0;

    return (
      <TouchableOpacity
        style={[styles.memberItem, hasVotes && styles.memberItemHighlight]}
        onPress={() => handleVote(item.userId)}
        disabled={!isElectionActive || hasVoted}
      >
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.displayName}</Text>
          <Text style={styles.memberUsername}>@{item.username}</Text>
        </View>
        {showResults && isElectionActive && (
          <View style={styles.voteCount}>
            <Text style={styles.voteCountText}>{voteCount} votes</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {isElectionActive ? 'Vote for DJ' : 'Select New DJ'}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>Close</Text>
            </TouchableOpacity>
          </View>

          {isElectionActive && (
            <View style={styles.voteStatus}>
              <Text style={styles.voteStatusText}>
                {hasVoted ? 'You have voted!' : 'Tap a member to vote'}
              </Text>
              <TouchableOpacity onPress={() => setShowResults(!showResults)}>
                <Text style={styles.toggleResults}>
                  {showResults ? 'Hide' : 'Show'} Results
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <FlatList
            data={members}
            renderItem={renderMember}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.memberList}
          />

          {currentVote?.isComplete && currentVote.winner && (
            <View style={styles.winnerBanner}>
              <Text style={styles.winnerText}>
                {members.find((m) => m.userId === currentVote.winner)?.displayName} won!
              </Text>
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
    paddingTop: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#007AFF',
    fontSize: 16,
  },
  voteStatus: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  voteStatusText: {
    fontSize: 14,
    color: '#666',
  },
  toggleResults: {
    color: '#007AFF',
    fontSize: 14,
  },
  memberList: {
    padding: 20,
  },
  memberItem: {
    backgroundColor: '#f9f9f9',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberItemHighlight: {
    backgroundColor: '#e3f2fd',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  memberUsername: {
    fontSize: 14,
    color: '#666',
  },
  voteCount: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  voteCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  winnerBanner: {
    backgroundColor: '#4CAF50',
    padding: 16,
    alignItems: 'center',
  },
  winnerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
