# Getting Started with GrooveBox Development

This guide will help you set up your development environment and start building GrooveBox.

## Prerequisites

### Required Software
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **Docker** and **Docker Compose** ([Download](https://www.docker.com/get-started))
- **Git**

### For Mobile Development
- **React Native CLI**: `npm install -g react-native-cli`
- **Watchman** (macOS): `brew install watchman`

#### iOS Development (macOS only)
- **Xcode** 14+ from Mac App Store
- **CocoaPods**: `sudo gem install cocoapods`

#### Android Development
- **Android Studio** ([Download](https://developer.android.com/studio))
- **JDK** 11 or newer
- Configure Android SDK and emulator

### Optional
- **Postman** or **Insomnia** - for API testing
- **Reactotron** - for React Native debugging

---

## Backend Setup

### 1. Navigate to Backend Directory
```bash
cd backend
```

### 2. Start PostgreSQL and Redis
```bash
docker-compose up -d
```

Verify services are running:
```bash
docker-compose ps
```

You should see:
- `groovebox-postgres` (healthy)
- `groovebox-redis` (healthy)

### 3. Initialize NestJS Project

If you haven't already:
```bash
npm i -g @nestjs/cli
nest new . --skip-git
```

Choose **npm** as package manager.

### 4. Install Dependencies
```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
npm install @nestjs/passport passport passport-jwt @nestjs/jwt
npm install @nestjs/typeorm typeorm pg
npm install ioredis
npm install bcrypt
npm install class-validator class-transformer

# Dev dependencies
npm install -D @types/passport-jwt @types/bcrypt
```

### 5. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and update values if needed (defaults should work for local development).

### 6. Create Database Schema

You can either:
- Use TypeORM migrations (recommended)
- Manually run SQL from `ARCHITECTURE.md` Section 3.1

For quick start, connect to PostgreSQL:
```bash
docker exec -it groovebox-postgres psql -U groovebox -d groovebox
```

Then paste the SQL schema from the architecture document.

### 7. Start Backend Development Server
```bash
npm run start:dev
```

Backend should be running at `http://localhost:3000`

### 8. Test Backend
Open Postman and test:
```
GET http://localhost:3000
```

You should get a response (default NestJS welcome).

---

## Mobile App Setup

### 1. Navigate to Mobile Directory
```bash
cd mobile
```

### 2. Initialize React Native Project

```bash
npx react-native init GrooveBox --template react-native-template-typescript
```

Move contents to current directory:
```bash
mv GrooveBox/* .
mv GrooveBox/.* .
rmdir GrooveBox
```

### 3. Install Dependencies
```bash
npm install @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context
npm install socket.io-client
npm install @react-native-async-storage/async-storage
npm install react-native-track-player
npm install axios

# For iOS
cd ios && pod install && cd ..
```

### 4. Configure Metro Bundler

Update `metro.config.js` to include TypeScript:
```javascript
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

### 5. Configure Backend URL

Create `src/config/api.ts`:
```typescript
export const API_CONFIG = {
  // Use your local IP for physical devices
  // For emulator/simulator:
  // - iOS Simulator: http://localhost:3000
  // - Android Emulator: http://10.0.2.2:3000
  BASE_URL: __DEV__
    ? 'http://localhost:3000'
    : 'https://your-production-domain.com',

  WS_URL: __DEV__
    ? 'ws://localhost:3000'
    : 'wss://your-production-domain.com',
};
```

### 6. Start Metro Bundler
```bash
npm start
```

### 7. Run on iOS (macOS only)
In a new terminal:
```bash
npm run ios
```

Or open `ios/GrooveBox.xcworkspace` in Xcode and press Run.

### 8. Run on Android
In a new terminal:
```bash
npm run android
```

Make sure you have an Android emulator running or device connected.

---

## Development Workflow

### Backend Development

1. **Create a new module**:
   ```bash
   cd backend
   nest generate module auth
   nest generate controller auth
   nest generate service auth
   ```

2. **Run in watch mode**:
   ```bash
   npm run start:dev
   ```

   Changes will auto-reload.

3. **View logs**:
   Console output shows all logs. For Docker services:
   ```bash
   docker-compose logs -f
   ```

### Mobile Development

1. **Start Metro**:
   ```bash
   npm start
   ```

2. **Reload app**:
   - iOS: `Cmd + R` in simulator
   - Android: `R + R` in emulator, or shake device

3. **Open developer menu**:
   - iOS: `Cmd + D` in simulator
   - Android: `Cmd + M` (Mac) or `Ctrl + M` (Windows/Linux)

4. **Debug**:
   - Enable Remote JS Debugging
   - Install React Native Debugger for better experience

---

## Testing Your Setup

### Backend Health Check

1. Check if services are running:
   ```bash
   curl http://localhost:3000
   ```

2. Check WebSocket connection (using Postman or Socket.io client):
   ```javascript
   const io = require('socket.io-client');
   const socket = io('http://localhost:3000');

   socket.on('connect', () => {
     console.log('Connected!');
   });
   ```

3. Check database:
   ```bash
   docker exec -it groovebox-postgres psql -U groovebox -d groovebox -c "\dt"
   ```

4. Check Redis:
   ```bash
   docker exec -it groovebox-redis redis-cli PING
   ```
   Should return `PONG`.

### Mobile App Health Check

1. App builds and launches without errors
2. You see the default React Native welcome screen
3. Metro bundler shows no errors

---

## Common Issues & Solutions

### Backend Issues

**Issue**: `Error: connect ECONNREFUSED 127.0.0.1:5432`
- **Solution**: PostgreSQL not running. Run `docker-compose up -d`

**Issue**: `Error: ER_ACCESS_DENIED_ERROR`
- **Solution**: Check `.env` database credentials match `docker-compose.yml`

**Issue**: Port 3000 already in use
- **Solution**: Change `PORT` in `.env` or kill process using port 3000

### Mobile Issues

**Issue**: "Unable to resolve module @react-navigation/native"
- **Solution**: Run `npm install` and for iOS also `cd ios && pod install`

**Issue**: Android build fails with "SDK location not found"
- **Solution**: Set `ANDROID_HOME` environment variable
  ```bash
  export ANDROID_HOME=$HOME/Library/Android/sdk
  ```

**Issue**: iOS build fails with "CocoaPods not installed"
- **Solution**: Install CocoaPods: `sudo gem install cocoapods`

**Issue**: Metro bundler shows "Error: EMFILE: too many open files"
- **Solution** (macOS): Install Watchman: `brew install watchman`

**Issue**: Cannot connect to backend from device
- **Solution**: Update `API_CONFIG.BASE_URL` to use your computer's local IP instead of localhost
  ```bash
  # Find your local IP
  ipconfig getifaddr en0  # macOS
  hostname -I             # Linux
  ```
  Then use `http://192.168.x.x:3000`

---

## Next Steps

1. **Follow the Implementation Checklist**: See `IMPLEMENTATION_CHECKLIST.md` for phase-by-phase tasks

2. **Read the Architecture**: Familiarize yourself with the system design in `ARCHITECTURE.md`

3. **Start with Phase 1**:
   - Backend: Implement authentication module
   - Mobile: Create login/register screens

4. **Join the Team**: (Add team communication channels here)

---

## Useful Commands

### Docker
```bash
docker-compose up -d              # Start services
docker-compose down               # Stop services
docker-compose down -v            # Stop and remove volumes (deletes data!)
docker-compose logs -f backend    # Follow logs
docker-compose restart redis      # Restart specific service
```

### Database
```bash
# Access PostgreSQL CLI
docker exec -it groovebox-postgres psql -U groovebox -d groovebox

# Backup database
docker exec groovebox-postgres pg_dump -U groovebox groovebox > backup.sql

# Restore database
docker exec -i groovebox-postgres psql -U groovebox groovebox < backup.sql
```

### Redis
```bash
# Access Redis CLI
docker exec -it groovebox-redis redis-cli

# Common Redis commands
KEYS *                    # List all keys
GET key                   # Get value
HGETALL room:uuid:state   # Get hash
FLUSHALL                  # Delete all data (careful!)
```

### NestJS
```bash
nest generate module rooms        # Create module
nest generate service rooms       # Create service
nest generate controller rooms    # Create controller
nest generate gateway sync        # Create WebSocket gateway
```

### React Native
```bash
npx react-native info             # Show environment info
npx react-native doctor           # Check for issues
npx react-native run-ios --device "iPhone 14 Pro"  # Run on specific simulator
npx react-native log-android      # Show Android logs
npx react-native log-ios          # Show iOS logs
```

---

## Resources

### Official Documentation
- [NestJS Docs](https://docs.nestjs.com/)
- [React Native Docs](https://reactnative.dev/docs/getting-started)
- [Socket.io Docs](https://socket.io/docs/v4/)
- [TypeORM Docs](https://typeorm.io/)
- [React Navigation Docs](https://reactnavigation.org/docs/getting-started)

### Helpful Guides
- [NestJS WebSocket Tutorial](https://docs.nestjs.com/websockets/gateways)
- [React Native Audio](https://github.com/doublesymmetry/react-native-track-player)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)

---

**Need Help?** Open an issue or contact the team.

**Last Updated**: 2025-11-22
