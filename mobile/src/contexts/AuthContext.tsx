import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_CONFIG, API_ENDPOINTS } from '../config/api';
import { User, LoginRequest, RegisterRequest, AuthResponse } from '../types/auth.types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Auto-login on app start
  useEffect(() => {
    const loadAuth = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('jwt_token');
        const storedUser = await AsyncStorage.getItem('user');

        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        }
      } catch (error) {
        console.error('[Auth] Load error:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAuth();
  }, []);

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await axios.post<AuthResponse>(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.AUTH.LOGIN}`,
        credentials,
      );

      const { access_token, user: userData } = response.data;

      await AsyncStorage.setItem('jwt_token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);
    } catch (error) {
      console.error('[Auth] Login error:', error);
      throw error;
    }
  };

  const register = async (data: RegisterRequest) => {
    try {
      const response = await axios.post<AuthResponse>(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.AUTH.REGISTER}`,
        data,
      );

      const { access_token, user: userData } = response.data;

      await AsyncStorage.setItem('jwt_token', access_token);
      await AsyncStorage.setItem('user', JSON.stringify(userData));

      setToken(access_token);
      setUser(userData);
    } catch (error) {
      console.error('[Auth] Register error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('jwt_token');
    await AsyncStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
