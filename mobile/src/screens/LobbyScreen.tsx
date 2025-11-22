import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG, API_ENDPOINTS } from '../config/api';
import { useAuth } from '../contexts/AuthContext';

export const LobbyScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { logout } = useAuth();
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);

  const createRoom = async () => {
    if (!roomName) {
      Alert.alert('Error', 'Please enter room name');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('jwt_token');
      const response = await axios.post(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.ROOMS.CREATE}`,
        {
          roomName,
          password: roomPassword || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const room = response.data;
      Alert.alert('Room Created', `Room code: ${room.roomCode}`);
      navigation.navigate('Room', { roomCode: room.roomCode });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async () => {
    if (!roomCode) {
      Alert.alert('Error', 'Please enter room code');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('jwt_token');
      await axios.post(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.ROOMS.JOIN(roomCode)}`,
        { password: roomPassword || undefined },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      navigation.navigate('Room', { roomCode });
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to join room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>GrooveBox Lobby</Text>

      {!showCreateRoom ? (
        <>
          <Text style={styles.sectionTitle}>Join Room</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter Room Code"
            value={roomCode}
            onChangeText={setRoomCode}
            autoCapitalize="characters"
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={joinRoom}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Join Room</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
            onPress={() => setShowCreateRoom(true)}
            disabled={loading}
          >
            <Text style={styles.buttonTextSecondary}>Create New Room</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Create Room</Text>
          <TextInput
            style={styles.input}
            placeholder="Room Name"
            value={roomName}
            onChangeText={setRoomName}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Password (Optional)"
            value={roomPassword}
            onChangeText={setRoomPassword}
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={createRoom}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Room</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonSecondary, loading && styles.buttonDisabled]}
            onPress={() => setShowCreateRoom(false)}
            disabled={loading}
          >
            <Text style={styles.buttonTextSecondary}>Back to Join</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#007AFF',
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonTextSecondary: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    marginTop: 'auto',
    padding: 16,
  },
  logoutText: {
    textAlign: 'center',
    color: '#FF3B30',
    fontSize: 16,
  },
});
