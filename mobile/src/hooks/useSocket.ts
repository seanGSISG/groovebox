import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';
import { ServerToClientEvents, ClientToServerEvents } from '../types/socket.types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const useSocket = (): TypedSocket | null => {
  const [socket, setSocket] = useState<TypedSocket | null>(null);

  useEffect(() => {
    let newSocket: TypedSocket | null = null;

    const connectSocket = async () => {
      try {
        // Get JWT token from storage
        const token = await AsyncStorage.getItem('jwt_token');

        if (!token) {
          console.log('[Socket] No token found, skipping connection');
          return;
        }

        // Create socket connection with auth
        newSocket = io(API_CONFIG.WS_URL, {
          auth: {
            token,
          },
          transports: ['websocket'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionAttempts: 5,
        }) as TypedSocket;

        newSocket.on('connect', () => {
          console.log('[Socket] Connected:', newSocket?.id);
        });

        newSocket.on('disconnect', (reason) => {
          console.log('[Socket] Disconnected:', reason);
        });

        newSocket.on('connect_error', (error) => {
          console.error('[Socket] Connection error:', error.message);
        });

        setSocket(newSocket);
      } catch (error) {
        console.error('[Socket] Setup error:', error);
      }
    };

    connectSocket();

    return () => {
      if (newSocket) {
        console.log('[Socket] Disconnecting...');
        newSocket.disconnect();
      }
    };
  }, []);

  return socket;
};
