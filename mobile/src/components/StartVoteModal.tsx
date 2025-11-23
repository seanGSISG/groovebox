import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { VoteType } from '../types/voting.types';

interface Member {
  userId: string;
  username: string;
  displayName: string;
}

interface StartVoteModalProps {
  visible: boolean;
  onClose: () => void;
  onStartVote: (voteType: VoteType, targetUserId?: string) => Promise<void>;
  members: Member[];
  currentDjId: string | null;
}

export const StartVoteModal: React.FC<StartVoteModalProps> = ({
  visible,
  onClose,
  onStartVote,
  members,
  currentDjId,
}) => {
  const [voteType, setVoteType] = useState<VoteType | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  const handleStartVote = async () => {
    if (!voteType) {
      Alert.alert('Error', 'Please select a vote type');
      return;
    }

    if (voteType === VoteType.DJ_ELECTION && !selectedMember) {
      Alert.alert('Error', 'Please select a member to elect as DJ');
      return;
    }

    try {
      await onStartVote(voteType, selectedMember?.userId);
      setVoteType(null);
      setSelectedMember(null);
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to start vote');
    }
  };

  const eligibleMembers = members.filter(m => m.userId !== currentDjId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Start a Vote</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Vote Type</Text>
            <View style={styles.voteTypeContainer}>
              <TouchableOpacity
                style={[
                  styles.voteTypeButton,
                  voteType === VoteType.DJ_ELECTION && styles.selectedVoteType,
                ]}
                onPress={() => setVoteType(VoteType.DJ_ELECTION)}
              >
                <Text style={styles.voteTypeText}>Elect DJ</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.voteTypeButton,
                  voteType === VoteType.MUTINY && styles.selectedVoteType,
                ]}
                onPress={() => {
                  setVoteType(VoteType.MUTINY);
                  setSelectedMember(null);
                }}
              >
                <Text style={styles.voteTypeText}>Mutiny</Text>
              </TouchableOpacity>
            </View>

            {voteType === VoteType.DJ_ELECTION && (
              <>
                <Text style={styles.sectionTitle}>Select Member</Text>
                <FlatList
                  data={eligibleMembers}
                  keyExtractor={(item) => item.userId}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[
                        styles.memberItem,
                        selectedMember?.userId === item.userId && styles.selectedMember,
                      ]}
                      onPress={() => setSelectedMember(item)}
                    >
                      <Text style={styles.memberName}>{item.displayName}</Text>
                      <Text style={styles.memberUsername}>@{item.username}</Text>
                    </TouchableOpacity>
                  )}
                  style={styles.memberList}
                />
              </>
            )}

            {voteType === VoteType.MUTINY && (
              <Text style={styles.mutinyDescription}>
                Vote to remove the current DJ. Requires {Math.ceil(members.length * 0.51)} votes to pass.
              </Text>
            )}

            <TouchableOpacity
              style={[styles.startButton, !voteType && styles.startButtonDisabled]}
              onPress={handleStartVote}
              disabled={!voteType}
            >
              <Text style={styles.startButtonText}>Start Vote</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    padding: 4,
  },
  closeIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#b0b0b0',
    marginBottom: 12,
    marginTop: 8,
  },
  voteTypeContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  voteTypeButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedVoteType: {
    borderColor: '#5865F2',
    backgroundColor: '#3a3a4e',
  },
  voteTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  memberList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  memberItem: {
    padding: 12,
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedMember: {
    borderColor: '#5865F2',
    backgroundColor: '#3a3a4e',
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  memberUsername: {
    fontSize: 14,
    color: '#808080',
  },
  mutinyDescription: {
    fontSize: 14,
    color: '#b0b0b0',
    marginBottom: 16,
    lineHeight: 20,
  },
  startButton: {
    backgroundColor: '#5865F2',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
