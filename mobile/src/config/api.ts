// API configuration for backend connection
export const API_CONFIG = {
  // Update this to your backend URL (development/production)
  BASE_URL: 'http://localhost:3000',
  WS_URL: 'ws://localhost:3000',

  // For physical device testing, use your machine's IP:
  // BASE_URL: 'http://192.168.1.100:3000',
  // WS_URL: 'ws://192.168.1.100:3000',
};

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    PROFILE: '/auth/profile',
  },
  ROOMS: {
    CREATE: '/rooms',
    JOIN: (code: string) => `/rooms/${code}/join`,
    DETAILS: (code: string) => `/rooms/${code}`,
    MY_ROOMS: '/rooms/my-rooms',
    LEAVE: (code: string) => `/rooms/${code}/leave`,
  },
};
