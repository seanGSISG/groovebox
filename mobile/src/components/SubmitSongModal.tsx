import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';

interface SubmitSongModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (youtubeUrl: string, songTitle?: string, artist?: string) => Promise<void>;
}

export const SubmitSongModal: React.FC<SubmitSongModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [songTitle, setSongTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!youtubeUrl.trim()) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    // Basic YouTube URL validation
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
    if (!youtubeRegex.test(youtubeUrl)) {
      Alert.alert('Error', 'Please enter a valid YouTube URL');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(
        youtubeUrl.trim(),
        songTitle.trim() || undefined,
        artist.trim() || undefined,
      );
      // Reset form
      setYoutubeUrl('');
      setSongTitle('');
      setArtist('');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit song');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Submit a Song</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeIcon}>×</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>YouTube URL *</Text>
            <TextInput
              style={styles.input}
              value={youtubeUrl}
              onChangeText={setYoutubeUrl}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor="#666"
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.label}>Song Title (optional)</Text>
            <TextInput
              style={styles.input}
              value={songTitle}
              onChangeText={setSongTitle}
              placeholder="Enter song title"
              placeholderTextColor="#666"
              maxLength={200}
            />

            <Text style={styles.label}>Artist (optional)</Text>
            <TextInput
              style={styles.input}
              value={artist}
              onChangeText={setArtist}
              placeholder="Enter artist name"
              placeholderTextColor="#666"
              maxLength={200}
            />

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Submitting...' : 'Submit Song'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    paddingBottom: 34,
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
  form: {
    padding: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b0b0b0',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#2a2a3e',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#fff',
    borderWidth: 1,
    borderColor: '#3a3a4e',
  },
  submitButton: {
    backgroundColor: '#5865F2',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
});
