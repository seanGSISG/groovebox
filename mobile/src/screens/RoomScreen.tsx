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
import { ClockSyncManager } from '../services/ClockSyncManager';
import { SyncedAudioPlayer } from '../services/SyncedAudioPlayer';
import { VoteProvider } from '../contexts/VoteContext';
import { DjElectionModal } from '../components/DjElectionModal';
import { RoomMember } from '../types/vote.types';
import { useAuth } from '../contexts/AuthContext';

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
  const [showDjElection, setShowDjElection] = useState(false);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [currentDjId, setCurrentDjId] = useState<string | null>(null);

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

    // Listen for DJ changes
    socket.on('dj:changed', (data) => {
      console.log('[Room] DJ changed:', data);
      setCurrentDjId(data.newDjId);
    });

    socket.on('room:members-changed', (data) => {
      console.log('[Room] Members changed:', data);
      setRoomMembers(data.members || []);
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
      socket.off('dj:changed');
      socket.off('room:members-changed');
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

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageContainer}>
      <Text style={styles.messageUsername}>{item.username}:</Text>
      <Text style={styles.messageText}>{item.message}</Text>
    </View>
  );

  return (
    <VoteProvider socket={socket} userId={user?.id || null}>
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
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => setShowDjElection(true)}
        >
          <Text style={styles.controlButtonText}>Vote for DJ</Text>
        </TouchableOpacity>
      </View>

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

      <DjElectionModal
        visible={showDjElection}
        onClose={() => setShowDjElection(false)}
        members={roomMembers}
        roomCode={roomCode}
      />
    </View>
    </VoteProvider>
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
});
