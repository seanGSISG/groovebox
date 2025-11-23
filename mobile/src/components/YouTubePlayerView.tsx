import React, { useRef, useCallback, useState } from 'react';
import { View, StyleSheet, Text, ActivityIndicator } from 'react-native';
import YoutubePlayer, { YoutubeIframeRef } from 'react-native-youtube-iframe';

interface YouTubePlayerViewProps {
  videoId: string | null;
  playing: boolean;
  onReady: (playerRef: YoutubeIframeRef) => void;
  onEnd: () => void;
  onError?: (error: string) => void;
}

export const YouTubePlayerView: React.FC<YouTubePlayerViewProps> = ({
  videoId,
  playing,
  onReady,
  onEnd,
  onError,
}) => {
  const playerRef = useRef<YoutubeIframeRef>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleReady = useCallback(() => {
    if (playerRef.current) {
      onReady(playerRef.current);
    }
  }, [onReady]);

  const handleChangeState = useCallback((state: string) => {
    console.log('[YouTube] State:', state);

    if (state === 'ended') {
      onEnd();
    } else if (state === 'buffering') {
      setIsLoading(true);
    } else if (state === 'playing') {
      setIsLoading(false);
    }
  }, [onEnd]);

  const handleError = useCallback((error: string) => {
    console.error('[YouTube] Error:', error);
    setIsLoading(false);
    onError?.(error);
  }, [onError]);

  if (!videoId) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No video playing</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <YoutubePlayer
        ref={playerRef}
        videoId={videoId}
        play={playing}
        onReady={handleReady}
        onChangeState={handleChangeState}
        onError={handleError}
        webViewProps={{
          androidLayerType: 'hardware',
        }}
      />
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  placeholder: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#666',
    fontSize: 16,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
