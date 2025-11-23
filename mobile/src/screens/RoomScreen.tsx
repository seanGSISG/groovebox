import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { VoteProvider, useVote } from '../contexts/VoteContext';
import { DjElectionModal } from '../components/DjElectionModal';
import { MutinyModal } from '../components/MutinyModal';
import { RoomMember, VoteType } from '../types/vote.types';
import { useAuth } from '../contexts/AuthContext';
import { Toast } from '../components/Toast';
import { useToast } from '../hooks/useToast';
import { YouTubePlayerView } from '../components/YouTubePlayerView';
import { YouTubePlayer } from '../services/YouTubePlayer';
import { YoutubeIframeRef } from 'react-native-youtube-iframe';

interface ChatMessage {
  id: string;
  username: string;
  message: string;
  timestamp: number;
}

const RoomContent: React.FC<{
  roomCode: string;
  navigation: any;
  socket: any;
  user: any;
}> = ({ roomCode, navigation, socket, user }) => {
  const { currentVote, startElection, randomizeDj, lastError, clearError } = useVote();
  const { toast, showToast, hideToast } = useToast();
  const syncManagerRef = useRef<ClockSyncManager | null>(null);
  const audioPlayerRef = useRef<SyncedAudioPlayer | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayer | null>(null);
  const pendingPlaybackRef = useRef<any>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [syncOffset, setSyncOffset] = useState<number>(0);
  const [syncRtt, setSyncRtt] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showDjElection, setShowDjElection] = useState(false);
  const [showMutiny, setShowMutiny] = useState(false);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [currentDjId, setCurrentDjId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    // Initialize sync services
    syncManagerRef.current = new ClockSyncManager(socket);
    audioPlayerRef.current = new SyncedAudioPlayer(syncManagerRef.current);
    youtubePlayerRef.current = new YouTubePlayer(syncManagerRef.current);

    // Join room
    socket.emit('room:join', { roomCode });

    // Start clock sync
    syncManagerRef.current.startSync(false);

    // Listen for playback events
    socket.on('playback:start', async (event: any) => {
      console.log('[Room] Playback start event:', event);

      if (event.youtubeVideoId && youtubePlayerRef.current) {
        // YouTube playback - stop audio player first
        audioPlayerRef.current?.handlePlaybackStop();
        setCurrentVideoId(event.youtubeVideoId);
        setIsPlaying(true);

        // Store event for when player is ready
        pendingPlaybackRef.current = event;

        // If player ref is already set, start playback immediately
        if (youtubePlayerRef.current.hasPlayerRef()) {
          try {
            await youtubePlayerRef.current.handlePlaybackStart(event);
            pendingPlaybackRef.current = null;
            syncManagerRef.current?.startSync(true); // Increase sync frequency
          } catch (error) {
            console.error('[Room] YouTube playback error:', error);
            Alert.alert('Playback Error', 'Failed to start video playback');
          }
        }
      } else {
        // Regular audio playback - stop YouTube player first
        if (youtubePlayerRef.current && currentVideoId) {
          await youtubePlayerRef.current.handlePlaybackStop();
          setCurrentVideoId(null);
        }
        audioPlayerRef.current?.handlePlaybackStart(event);
        setIsPlaying(true);
        syncManagerRef.current?.startSync(true);
      }
    });

    socket.on('playback:pause', async () => {
      try {
        if (youtubePlayerRef.current && currentVideoId) {
          // YouTube playback pause
          await youtubePlayerRef.current.handlePlaybackPause();
          setIsPlaying(false);
          syncManagerRef.current?.startSync(false);
        } else {
          // Regular audio pause
          audioPlayerRef.current?.handlePlaybackPause();
          setIsPlaying(false);
          syncManagerRef.current?.startSync(false);
        }
      } catch (error) {
        console.error('[Room] Pause error:', error);
        Alert.alert('Playback Error', 'Failed to pause playback');
      }
    });

    socket.on('playback:stop', async () => {
      try {
        if (youtubePlayerRef.current && currentVideoId) {
          // YouTube playback stop
          await youtubePlayerRef.current.handlePlaybackStop();
          setIsPlaying(false);
          setCurrentVideoId(null);
          syncManagerRef.current?.startSync(false);
        } else {
          // Regular audio stop
          audioPlayerRef.current?.handlePlaybackStop();
          setIsPlaying(false);
          syncManagerRef.current?.startSync(false);
        }
      } catch (error) {
        console.error('[Room] Stop error:', error);
        Alert.alert('Playback Error', 'Failed to stop playback');
      }
    });

    socket.on('room:state', (state: any) => {
      console.log('[Room] Room state:', state);
      if (state.ownerId) {
        setOwnerId(state.ownerId);
      }
      if (state.playback?.playing) {
        audioPlayerRef.current?.joinMidSong(state.playback);
        setIsPlaying(true);
      }
    });

    socket.on('chat:message', (data: any) => {
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
    socket.on('dj:changed', (data: any) => {
      console.log('[Room] DJ changed:', data);
      setCurrentDjId(data.newDjId);
      const newDj = roomMembersRef.current.find((m) => m.userId === data.newDjId);
      showToast({
        message: `${newDj?.displayName || 'Someone'} is now the DJ!`,
        type: 'success',
      });
    });

    socket.on('room:members-changed', (data: any) => {
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
      youtubePlayerRef.current?.destroy();
      socket.emit('room:leave');
      socket.off('playback:start');
      socket.off('playback:pause');
      socket.off('playback:stop');
      socket.off('room:state');
      socket.off('chat:message');
      socket.off('dj:changed');
      socket.off('room:members-changed');
    };
  }, [socket, roomCode, showToast]);

  // Use ref to access latest roomMembers without re-registering listeners
  const roomMembersRef = useRef(roomMembers);
  roomMembersRef.current = roomMembers;

  // Toast notifications for vote events
  useEffect(() => {
    if (!socket) return;

    socket.on('vote:election-started', (data: any) => {
      showToast({
        message: 'DJ election started! Vote for your favorite.',
        type: 'info',
      });
    });

    socket.on('vote:mutiny-started', (data: any) => {
      showToast({
        message: 'Mutiny vote started!',
        type: 'warning',
      });
    });

    socket.on('vote:complete', (data: any) => {
      if (data.winner) {
        const winner = roomMembersRef.current.find((m) => m.userId === data.winner);
        showToast({
          message: `${winner?.displayName || 'Someone'} is the new DJ!`,
          type: 'success',
        });
      }
    });

    socket.on('mutiny:success', (data: any) => {
      showToast({
        message: 'Mutiny succeeded! DJ has been removed.',
        type: 'success',
      });
    });

    socket.on('mutiny:failed', (data: any) => {
      showToast({
        message: 'Mutiny failed. DJ remains.',
        type: 'info',
      });
    });

    return () => {
      socket.off('vote:election-started');
      socket.off('vote:mutiny-started');
      socket.off('vote:complete');
      socket.off('mutiny:success');
      socket.off('mutiny:failed');
    };
  }, [socket, showToast]);

  // Auto-open modal when election starts
  useEffect(() => {
    if (currentVote?.voteType === VoteType.DJ_ELECTION && !currentVote.isComplete) {
      setShowDjElection(true);
    }
  }, [currentVote]);

  // Auto-open modal when mutiny starts
  useEffect(() => {
    if (currentVote?.voteType === VoteType.MUTINY && !currentVote.isComplete) {
      setShowMutiny(true);
    }
  }, [currentVote]);

  // Auto-close mutiny modal when vote completes
  useEffect(() => {
    if (!currentVote && showMutiny) {
      setShowMutiny(false);
    }
  }, [currentVote, showMutiny]);

  // Handle vote errors from backend
  useEffect(() => {
    if (lastError) {
      Alert.alert('Error', lastError);
      clearError();
    }
  }, [lastError, clearError]);

  // YouTube player callbacks
  const handlePlayerReady = useCallback((playerRef: YoutubeIframeRef) => {
    if (youtubePlayerRef.current) {
      youtubePlayerRef.current.setPlayerRef(playerRef);

      // If there's a pending playback event, start it now
      if (pendingPlaybackRef.current) {
        const event = pendingPlaybackRef.current;
        pendingPlaybackRef.current = null;

        youtubePlayerRef.current.handlePlaybackStart(event).then(() => {
          syncManagerRef.current?.startSync(true);
        }).catch(error => {
          console.error('[Room] YouTube playback error:', error);
          Alert.alert('Playback Error', 'Failed to start video playback');
        });
      }
    }
  }, []);

  const handleVideoEnd = useCallback(() => {
    if (!socket) return;
    console.log('[Room] Video ended, notifying server');
    socket.emit('playback:stop');
  }, [socket]);

  const handleVideoError = useCallback((error: string) => {
    Alert.alert('YouTube Error', `Video playback failed: ${error}`);
  }, []);

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

  const handleStartElection = () => {
    const success = startElection(roomCode);
    if (success) {
      setShowDjElection(true);
    } else {
      Alert.alert('Error', 'Failed to start election. Please try again.');
    }
  };

  const handleRandomizeDj = () => {
    const success = randomizeDj(roomCode);
    if (!success) {
      Alert.alert('Error', 'Failed to randomize DJ. Please try again.');
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View style={styles.messageContainer}>
      <Text style={styles.messageUsername}>{item.username}:</Text>
      <Text style={styles.messageText}>{item.message}</Text>
    </View>
  );

  const isRoomOwner = ownerId === user?.id;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.roomCode}>Room: {roomCode}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.leaveButton}>Leave</Text>
        </TouchableOpacity>
      </View>

      {/* YouTube Player */}
      <YouTubePlayerView
        videoId={currentVideoId}
        playing={isPlaying}
        onReady={handlePlayerReady}
        onEnd={handleVideoEnd}
        onError={handleVideoError}
      />

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
          onPress={handleStartElection}
        >
          <Text style={styles.controlButtonText}>Vote for DJ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlButton, styles.mutinyButton]}
          onPress={() => setShowMutiny(true)}
        >
          <Text style={styles.controlButtonText}>Call Mutiny</Text>
        </TouchableOpacity>
        {isRoomOwner && (
          <TouchableOpacity
            style={[styles.controlButton, styles.randomizeButton]}
            onPress={handleRandomizeDj}
          >
            <Text style={styles.controlButtonText}>Randomize DJ</Text>
          </TouchableOpacity>
        )}
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
        currentUserId={user?.id}
      />

      <MutinyModal
        visible={showMutiny}
        onClose={() => setShowMutiny(false)}
        roomCode={roomCode}
        currentDjName={
          roomMembers.find((m) => m.userId === currentDjId)?.displayName || null
        }
      />

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

export const RoomScreen: React.FC<{ route: any; navigation: any }> = ({
  route,
  navigation,
}) => {
  const { roomCode } = route.params;
  const socket = useSocket();
  const { user } = useAuth();

  return (
    <VoteProvider socket={socket} userId={user?.id || null}>
      <RoomContent
        roomCode={roomCode}
        navigation={navigation}
        socket={socket}
        user={user}
      />
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
    flexWrap: 'wrap',
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
  mutinyButton: {
    backgroundColor: '#FF3B30',
  },
  randomizeButton: {
    backgroundColor: '#FF9500',
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
