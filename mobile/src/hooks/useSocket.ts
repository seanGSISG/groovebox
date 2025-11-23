import { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import { ServerToClientEvents, ClientToServerEvents } from '../types/socket.types';
import { AutoPlayPayload } from '../types/queue.types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const useSocket = (): TypedSocket | null => {
  const [socket, setSocket] = useState<TypedSocket | null>(null);
  const socketRef = useRef<TypedSocket | null>(null);

  useEffect(() => {
    let isMounted = true;

    const connectSocket = async () => {
      try {
        // Get JWT token from storage
        const token = await AsyncStorage.getItem('jwt_token');

        if (!token) {
          console.log('[Socket] No token found, skipping connection');
          return;
        }

        // Create socket connection with auth
        const newSocket = io(API_CONFIG.WS_URL, {
          auth: {
            token,
          },
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
        }) as TypedSocket;

        socketRef.current = newSocket;

        newSocket.on('connect', () => {
          console.log('[Socket] Connected:', newSocket?.id);
        });

        newSocket.on('disconnect', (reason) => {
          console.log('[Socket] Disconnected:', reason);
        });

        newSocket.on('connect_error', (error) => {
          console.error('[Socket] Connection error:', error.message);
        });

        if (isMounted) {
          setSocket(newSocket);
        }
      } catch (error) {
        console.error('[Socket] Setup error:', error);
      }
    };

    connectSocket();

    return () => {
      isMounted = false;
      if (socketRef.current) {
        console.log('[Socket] Disconnecting...');
        socketRef.current.off('connect');
        socketRef.current.off('disconnect');
        socketRef.current.off('connect_error');
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Listen for queue auto-play events
  useEffect(() => {
    if (!socket) return;

    const handleAutoPlay = (payload: AutoPlayPayload) => {
      // Emit custom event that SyncedAudioPlayer can listen to
      // or handle via callback passed to hook
      console.log('Auto-playing next song:', payload.submission);
    };

    socket.on('queue:auto-play', handleAutoPlay);

    return () => {
      socket.off('queue:auto-play', handleAutoPlay);
    };
  }, [socket]);

  return socket;
};
