import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { useSocket } from '../hooks/useSocket';
import { useAuth } from '../contexts/AuthContext';
import { useQueue } from '../hooks/useQueue';
import { QueueList } from '../components/QueueList';
import { SubmitSongModal } from '../components/SubmitSongModal';
import { ClockSyncManager } from '../services/ClockSyncManager';
import { SyncedAudioPlayer } from '../services/SyncedAudioPlayer';
import { useVoting } from '../hooks/useVoting';
import { VoteCard } from '../components/VoteCard';
import { StartVoteModal } from '../components/StartVoteModal';
import { VoteType } from '../types/voting.types';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

export const RoomScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { roomCode } = route.params;
  const socket = useSocket();
  const { user } = useAuth();
  const syncManagerRef = useRef<ClockSyncManager | null>(null);
  const audioPlayerRef = useRef<SyncedAudioPlayer | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [syncOffset, setSyncOffset] = useState<number>(0);
  const [syncRtt, setSyncRtt] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [currentDjId, setCurrentDjId] = useState<string | null>(null);
  const [showStartVoteModal, setShowStartVoteModal] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const { queueState, submitSong, voteForSubmission, unvoteSubmission, removeSubmission } = useQueue(roomCode);
  const { activeVote, startVote, castVote } = useVoting(roomCode);

  useEffect(() => {
    if (!socket) return;

    // Initialize sync services
    syncManagerRef.current = new ClockSyncManager(socket);
    audioPlayerRef.current = new SyncedAudioPlayer(syncManagerRef.current);

    // Join room
    socket.emit('room:join', { roomCode });

    // Start clock sync
    syncManagerRef.current.startSync(false);

    // Listen for playback events
    socket.on('playback:start', (event) => {
      console.log('[Room] Playback start event:', event);
      audioPlayerRef.current?.handlePlaybackStart(event);
      setIsPlaying(true);
      syncManagerRef.current?.startSync(true); // Increase sync frequency
    });

    socket.on('playback:pause', () => {
      audioPlayerRef.current?.handlePlaybackPause();
      setIsPlaying(false);
      syncManagerRef.current?.startSync(false);
    });

    socket.on('playback:stop', () => {
      audioPlayerRef.current?.handlePlaybackStop();
      setIsPlaying(false);
    });

    socket.on('room:state', (state) => {
      console.log('[Room] Room state:', state);
      if (state.playback?.playing) {
        audioPlayerRef.current?.joinMidSong(state.playback);
        setIsPlaying(true);
      }
      if (state.members) {
        setMembers(state.members);
      }
      if (state.currentDjId !== undefined) {
        setCurrentDjId(state.currentDjId);
      }
    });

    socket.on('chat:message', (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          username: data.username,
          message: data.message,
          timestamp: data.timestamp,
        },
      ]);
    });

    // Update sync metrics for UI
    const metricsInterval = setInterval(() => {
      if (syncManagerRef.current) {
        setSyncOffset(syncManagerRef.current.getOffset());
        setSyncRtt(syncManagerRef.current.getRtt());
      }
    }, 1000);

    return () => {
      clearInterval(metricsInterval);
      syncManagerRef.current?.stopSync();
      syncManagerRef.current?.destroy();
      audioPlayerRef.current?.destroy();
      socket.emit('room:leave');
      socket.off('playback:start');
      socket.off('playback:pause');
      socket.off('playback:stop');
      socket.off('room:state');
      socket.off('chat:message');
    };
  }, [socket, roomCode]);

  const sendMessage = () => {
    if (!inputMessage.trim() || !socket) return;

    socket.emit('chat:message', { message: inputMessage });
    setInputMessage('');
  };

  const handlePlay = () => {
    if (!socket) return;

    // For testing: use a placeholder track
    socket.emit('playback:start', {
      trackId: 'test-track',
      trackSource: 'local',
      position: 0,
    });
  };

  const handlePause = () => {
    if (!socket) return;
    socket.emit('playback:pause');
  };

  const handleSubmitSong = async (youtubeUrl: string, songTitle?: string, artist?: string) => {
    await submitSong(youtubeUrl, songTitle, artist);
  };

  const handleVote = async (submissionId: string) => {
    try {
      await voteForSubmission(submissionId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleUnvote = async (submissionId: string) => {
    try {
      await unvoteSubmission(submissionId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRemove = async (submissionId: string) => {
    try {
      await removeSubmission(submissionId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleStartVote = async (voteType: VoteType, targetUserId?: string) => {
    try {
      await startVote(voteType, targetUserId);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleCastVote = async (voteFor: boolean) => {
    if (!activeVote) return;

    try {
      await castVote(activeVote.voteSessionId, voteFor);
      setHasVoted(true);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  // Reset hasVoted when new vote starts
  useEffect(() => {
    setHasVoted(false);
  }, [activeVote?.voteSessionId]);

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageContainer}>
      <Text style={styles.messageUsername}>{item.username}:</Text>
      <Text style={styles.messageText}>{item.message}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.roomCode}>Room: {roomCode}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.leaveButton}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* Sync Metrics */}
      <View style={styles.syncMetrics}>
        <Text style={styles.metricText}>
          Offset: {syncOffset.toFixed(1)}ms | RTT: {syncRtt.toFixed(1)}ms
        </Text>
        <Text style={styles.metricText}>
          Status: {isPlaying ? 'Playing' : 'Stopped'}
        </Text>
      </View>

      {/* DJ Controls (simplified for Phase 2) */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={handlePlay}>
          <Text style={styles.controlButtonText}>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={handlePause}>
          <Text style={styles.controlButtonText}>Pause</Text>
        </TouchableOpacity>
      </View>

      {/* Voting UI */}
      {activeVote && (
        <VoteCard
          voteState={activeVote}
          onVote={handleCastVote}
          hasVoted={hasVoted}
          currentUserId={user?.id || null}
        />
      )}

      {/* Start Vote Button - only show if no active vote */}
      {!activeVote && (
        <TouchableOpacity
          style={styles.startVoteButton}
          onPress={() => setShowStartVoteModal(true)}
        >
          <Text style={styles.startVoteButtonText}>Start Vote</Text>
        </TouchableOpacity>
      )}

      <StartVoteModal
        visible={showStartVoteModal}
        onClose={() => setShowStartVoteModal(false)}
        onStartVote={handleStartVote}
        members={members}
        currentDjId={currentDjId}
      />

      {/* Tabs for Chat and Queue */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, !showQueue && styles.activeTab]}
          onPress={() => setShowQueue(false)}
        >
          <Text style={[styles.tabText, !showQueue && styles.activeTabText]}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, showQueue && styles.activeTab]}
          onPress={() => setShowQueue(true)}
        >
          <Text style={[styles.tabText, showQueue && styles.activeTabText]}>
            Queue ({queueState.totalSubmissions})
          </Text>
        </TouchableOpacity>
      </View>

      {showQueue ? (
        <QueueList
          submissions={queueState.submissions}
          onVote={handleVote}
          onUnvote={handleUnvote}
          onRemove={handleRemove}
          currentUserId={user?.id || null}
        />
      ) : (
        <>
          {/* Chat */}
          <FlatList
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            style={styles.messageList}
            contentContainerStyle={styles.messageListContent}
          />

          {/* Chat Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              value={inputMessage}
              onChangeText={setInputMessage}
              onSubmitEditing={sendMessage}
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Floating Action Button for submitting songs */}
      {showQueue && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowSubmitModal(true)}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      {/* Submit Song Modal */}
      <SubmitSongModal
        visible={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onSubmit={handleSubmitSong}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  roomCode: {
    fontSize: 18,
    fontWeight: '600',
  },
  leaveButton: {
    color: '#FF3B30',
    fontSize: 16,
  },
  syncMetrics: {
    backgroundColor: '#fff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  metricText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
  },
  controls: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  controlButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    padding: 16,
  },
  messageContainer: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  messageUsername: {
    fontWeight: '600',
    marginBottom: 4,
    color: '#007AFF',
  },
  messageText: {
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  input: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#5865F2',
  },
  tabText: {
    fontSize: 16,
    color: '#808080',
  },
  activeTabText: {
    color: '#000',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#5865F2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 32,
    color: '#fff',
    fontWeight: 'bold',
  },
  startVoteButton: {
    backgroundColor: '#5865F2',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    margin: 16,
  },
  startVoteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
