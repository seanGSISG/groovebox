# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GrooveBox is a mobile application that transforms multiple smartphones into a synchronized speaker system. It enables shared listening experiences with millisecond-precision audio synchronization across multiple devices, featuring democratic DJ controls, voting systems, and real-time chat.

**Tech Stack:**
- **Mobile**: React Native (iOS + Android) with TypeScript
- **Backend**: NestJS with Socket.io for WebSocket communication
- **Database**: PostgreSQL (persistent data) + Redis (real-time state)
- **Audio**: react-native-track-player for synchronized playback

## Common Development Commands

### Backend (NestJS)

```bash
cd backend

# Development
npm run start:dev          # Start with hot reload
npm run start:debug        # Start with debugger

# Build & Production
npm run build              # Compile TypeScript
npm run start:prod         # Run production build

# Testing
npm run test               # Run unit tests
npm run test:watch         # Run tests in watch mode
npm run test:cov           # Run tests with coverage
npm run test:e2e           # Run end-to-end tests

# Code Quality
npm run lint               # Lint and auto-fix
npm run format             # Format with Prettier

# Database Migrations
npm run migration:run      # Apply pending migrations
npm run migration:revert   # Rollback last migration
npm run migration:generate # Generate migration from entities
npm run migration:create   # Create empty migration

# Docker Services
docker-compose up -d       # Start PostgreSQL + Redis
docker-compose down        # Stop services
docker-compose logs -f     # Follow service logs
```

### Mobile (React Native)

```bash
cd mobile

# Development
npm start                  # Start Metro bundler
npm run ios                # Run on iOS simulator
npm run android            # Run on Android emulator

# Testing
npm run test               # Run unit tests
npm run lint               # Lint JavaScript/TypeScript
```

### Running a Single Test

**Backend:**
```bash
cd backend
npm run test -- auth.service.spec.ts           # Single test file
npm run test -- --testNamePattern="should create user"  # Specific test
```

**Mobile:**
```bash
cd mobile
npm run test -- ClockSyncManager.test.ts       # Single test file
```

## High-Level Architecture

### Core Synchronization System

The most critical architectural component is the **audio synchronization system**, which requires understanding across multiple files:

**Clock Synchronization (NTP-inspired protocol):**
- Server provides authoritative time source
- Clients periodically calculate clock offset via RTT measurement
- Uses exponential smoothing to filter network jitter
- Sync frequency increases during playback (30s idle → 10s playing)

**Synchronized Playback Flow:**
1. DJ issues play command via WebSocket
2. Server calculates future start time: `serverNow + syncBuffer` (typically 1000ms)
3. Server broadcasts `startAtServerTime` to all clients
4. Each client converts to local time: `localStartTime = serverTime - clockOffset`
5. Clients schedule playback using `setTimeout` to start at exact local moment
6. Periodic drift correction checks actual vs expected position every 5-10s

**Key Files:**
- Backend: `backend/src/sync/` (clock sync), `backend/src/gateway/services/playback-sync.service.ts` (coordinated playback)
- Mobile: `mobile/src/services/ClockSyncManager.ts`, `mobile/src/services/SyncedAudioPlayer.ts`

### Module Organization

**Backend Modules (NestJS):**

- `auth/` - JWT-based authentication, user registration/login
- `rooms/` - Room creation, joining, membership management
- `gateway/` - WebSocket event handling (Socket.io gateway)
  - `services/playback-sync.service.ts` - Coordinates synchronized playback
  - `helpers/sync-buffer.helper.ts` - Calculates adaptive sync buffers
- `sync/` - Clock synchronization protocol implementation
- `queue/` - YouTube song submission and voting system
- `voting/` - DJ election and mutiny voting system
- `entities/` - TypeORM database entities
- `redis/` - Redis client and real-time state management
- `database/` - TypeORM configuration and migrations

**Mobile Structure:**

- `screens/` - UI screens (RoomScreen, ChatScreen, etc.)
- `services/` - Business logic
  - `ClockSyncManager.ts` - Client-side clock synchronization
  - `SyncedAudioPlayer.ts` - Audio playback with drift correction
- `contexts/` - React contexts for global state
- `hooks/` - Custom React hooks
- `components/` - Reusable UI components
- `navigation/` - React Navigation setup
- `types/` - TypeScript type definitions
- `config/` - App configuration (API URLs, etc.)

### Real-Time State Management

**PostgreSQL (Durable Storage):**
- Users, rooms, room_members, room_dj_history
- Messages (chat history)
- Votes (election/mutiny history)
- song_submissions, song_submission_votes

**Redis (Transient State):**
- `room:{roomId}:state` - Current track, DJ, playback position
- `room:{roomId}:members` - Active members (Set)
- `socket:{socketId}:user` - Socket-to-user mapping
- `room:{roomId}:vote:{sessionId}` - Active voting sessions
- `room:{roomId}:dj:cooldown:{userId}` - DJ cooldown enforcement

### WebSocket Event Patterns

All real-time features use Socket.io events following this pattern:

**Naming Convention:**
- `<module>:<action>` (e.g., `playback:start`, `vote:cast`, `queue:submit`)

**Common Event Flow:**
1. Client emits event to server
2. Server validates (authentication, permissions, rate limits)
3. Server updates state (Redis + PostgreSQL)
4. Server broadcasts to room: `this.server.to(roomId).emit(...)`
5. All clients receive and update local state

**Critical Events:**
- `sync:ping` / `sync:pong` - Clock synchronization
- `playback:start` / `playback:pause` / `playback:stop` - Playback control
- `vote:start` / `vote:cast` / `vote:passed` - Voting system
- `queue:submit` / `queue:vote` / `queue:auto-play` - Song queue
- `chat:message` - Real-time chat

## Key Implementation Patterns

### Drift Correction Algorithm

Audio drift is corrected every 5 seconds during playback:

```typescript
// Calculate expected position based on start time
const expectedPosition = startPosition + (Date.now() - startedAtLocalTime) / 1000;
const actualPosition = await audioPlayer.getPosition();
const driftMs = (actualPosition - expectedPosition) * 1000;

// Only correct if drift exceeds threshold
if (Math.abs(driftMs) > DRIFT_THRESHOLD_MS) {
  await audioPlayer.seekTo(expectedPosition);
}
```

This prevents echo effects caused by devices playing at slightly different speeds.

### Adaptive Sync Buffer

The server adjusts the synchronization buffer based on room's maximum RTT:

```typescript
const maxRtt = await getMaxRttForRoom(roomId);
const syncBuffer = Math.max(DEFAULT_SYNC_BUFFER, maxRtt * 2);
const startAtServerTime = Date.now() + syncBuffer;
```

This ensures even clients with poor network connections have time to receive and process playback commands.

### Join Mid-Song

When a user joins during playback:

```typescript
// Calculate elapsed time since track started
const elapsedMs = (currentServerTime - clockOffset) - (startedAtServerTime - clockOffset);
const currentPosition = startPosition + (elapsedMs / 1000);

// Seek to correct position and start playback
await audioPlayer.seekTo(currentPosition);
await audioPlayer.play();
```

### Vote Threshold Calculation

Votes pass when FOR votes reach the configured threshold:

```typescript
const requiredVotes = Math.ceil(totalMembers * mutinyThreshold); // e.g., 0.51 = 51%
if (votesFor >= requiredVotes) {
  // Vote passes - execute DJ change
}
```

Votes automatically fail when mathematically impossible to pass.

## Important Technical Details

### Time Representation

**Always use Unix milliseconds for time synchronization:**
- Server: `Date.now()` returns Unix ms
- Client: `Date.now()` returns Unix ms
- Store timestamps as `bigint` or `string` in Redis to avoid precision loss

**Never use:**
- JavaScript `Date` objects across network (timezone issues)
- Seconds instead of milliseconds (insufficient precision)

### Audio Precision Requirements

Target synchronization: **<50ms drift** between devices

**Critical thresholds:**
- `DRIFT_THRESHOLD_MS = 50` - Ignore drift below this
- `SEEK_THRESHOLD_MS = 200` - Use seek for large corrections
- `SYNC_BUFFER_MS = 1000` - Default playback scheduling buffer

### WebSocket Authentication

All WebSocket connections require JWT authentication:

```typescript
// Client must send JWT in handshake
const socket = io(WS_URL, {
  auth: { token: jwtToken }
});

// Server validates in WsJwtGuard before allowing connection
```

### Database Migrations

**Always create migrations for schema changes:**

```bash
npm run migration:generate src/database/migrations/DescriptiveName
npm run migration:run
```

TypeORM will auto-generate migrations by comparing entities to current schema.

### Redis Key TTLs

Set appropriate TTLs to prevent memory leaks:
- Room state: 24 hours
- Socket mappings: 1 hour
- Vote sessions: 1 hour
- DJ cooldowns: Configurable (default 5 minutes)

## Testing Sync Accuracy

To verify audio synchronization:

1. **Multi-Device Test:**
   - Run app on 3+ physical devices (not simulators)
   - Join same room
   - Play a track with clear beat
   - Listen for echo - should be imperceptible

2. **Metrics Dashboard:**
   - Check sync metrics endpoint: `GET /rooms/:code/sync-metrics`
   - Monitor RTT values (should be <200ms)
   - Check clock offset distribution (should be stable)

3. **Drift Logs:**
   - Enable debug logging in `SyncedAudioPlayer.ts`
   - Verify drift stays <50ms over 5+ minute playback

## Common Gotchas

**1. Android Network Security:**
Mobile app needs network security config for local development. Ensure `android/app/src/main/res/xml/network_security_config.xml` allows cleartext for localhost.

**2. iOS Audio Session:**
Configure audio session for background playback in `react-native-track-player` setup, otherwise audio stops when app backgrounds.

**3. Redis Connection Pool:**
Use connection pooling for Redis (`ioredis` cluster mode) when scaling horizontally with multiple backend instances.

**4. Clock Sync on Reconnect:**
Always trigger immediate clock sync when WebSocket reconnects - don't wait for next periodic sync interval.

**5. Race Conditions:**
Use Redis transactions (MULTI/EXEC) for vote counting to prevent race conditions when multiple clients vote simultaneously.

**6. Migration Order:**
Migrations must be run in order. Never modify existing migrations - create new ones for schema changes.

## Performance Considerations

**Backend:**
- Limit room size to 50 members (configurable)
- Use Redis Pub/Sub for multi-server scaling
- Index frequently queried columns (room_code, user_id, room_id)
- Use connection pooling for PostgreSQL

**Mobile:**
- Minimize WebSocket message frequency
- Cache room state locally
- Debounce vote button clicks
- Optimize re-renders with React.memo and useMemo

**Audio:**
- Preload tracks before playback
- Use appropriate audio quality (balance size vs quality)
- Clean up audio player resources on unmount

## Environment Variables

**Backend (.env):**
```bash
PORT=3000
DATABASE_URL=postgresql://groovebox:password@localhost:5432/groovebox
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
```

**Mobile (src/config/api.ts):**
```typescript
BASE_URL: 'http://localhost:3000'     // iOS simulator
BASE_URL: 'http://10.0.2.2:3000'      // Android emulator
BASE_URL: 'http://192.168.x.x:3000'   // Physical devices (use local IP)
```

## Project Status

**Completed Features:**
- ✅ Phase 1: MVP foundations (rooms, chat, basic playback)
- ✅ Phase 2: Audio synchronization (clock sync, drift correction)
- ✅ Phase 3: Democratic governance (elections, mutiny)
- ✅ YouTube queue system with voting

**In Progress:**
- ⏳ Phase 4: Music integration (Spotify, YouTube Music SDKs)

**Future:**
- Phase 5: Production hardening (monitoring, security, optimization)

## Additional Documentation

- **ARCHITECTURE.md** - Complete technical architecture, database schema, sync algorithms
- **SYNC_REFERENCE.md** - Deep dive into synchronization protocols
- **docs/QUEUE_SYSTEM.md** - YouTube queue and voting system details
- **docs/VOTING_SYSTEM.md** - DJ election and mutiny system details
- **GETTING_STARTED.md** - Development environment setup guide
- **IMPLEMENTATION_CHECKLIST.md** - Phase-by-phase implementation tasks
