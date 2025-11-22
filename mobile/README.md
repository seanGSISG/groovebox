# GrooveBox Mobile App

React Native mobile application for synchronized audio playback.

## Setup

### Prerequisites
- Node.js 18+
- React Native development environment (Xcode for iOS, Android Studio for Android)
- Running GrooveBox backend

### Installation

```bash
npm install
```

### Configuration

Update `src/config/api.ts` with your backend URL:

```typescript
export const API_CONFIG = {
  BASE_URL: 'http://YOUR_BACKEND_IP:3000',
  WS_URL: 'ws://YOUR_BACKEND_IP:3000',
};
```

### Running

```bash
# iOS
npx react-native run-ios

# Android
npx react-native run-android
```

## Architecture

- **ClockSyncManager**: NTP-style clock synchronization with server
- **SyncedAudioPlayer**: Scheduled playback with drift correction
- **useSocket**: WebSocket connection management
- **AuthContext**: Authentication state management

## Features

- User authentication (login/register)
- Create/join password-protected rooms
- Real-time chat
- Synchronized audio playback (<50ms target drift)
- Clock sync metrics display
- Mid-song join support
- Automatic drift correction

## Testing

See TESTING.md for physical device testing procedures.
