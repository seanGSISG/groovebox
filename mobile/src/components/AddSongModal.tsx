import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';

interface AddSongModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (url: string) => Promise<void>;
}

export const AddSongModal: React.FC<AddSongModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const validateYouTubeUrl = (input: string): boolean => {
    const trimmed = input.trim();
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]+/i;
    return youtubeRegex.test(trimmed);
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    if (!validateYouTubeUrl(url)) {
      Alert.alert('Invalid URL', 'Please enter a valid YouTube URL');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(url.trim());
      setUrl('');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add song to queue');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setUrl('');
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <Text style={styles.title}>Add Song to Queue</Text>
          <Text style={styles.subtitle}>Enter a YouTube URL</Text>

          <TextInput
            style={styles.input}
            placeholder="https://youtube.com/watch?v=..."
            placeholderTextColor="#666"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Add to Queue</Text>
              )}
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1a1f3a',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#0f1329',
    borderWidth: 1,
    borderColor: '#2d3351',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#fff',
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#2d3351',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#8b5cf6',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
