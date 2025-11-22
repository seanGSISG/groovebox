# GrooveBox - Comprehensive Architecture Document

## Executive Summary

GrooveBox is a mobile application that transforms multiple smartphones into a synchronized speaker system, enabling users to create shared, in-sync audio experiences. This document provides a complete technical architecture for building the MVP through production-ready system.

---

## 1. Tech Stack Recommendation

### 1.1 Mobile Framework: **React Native**

**Chosen: React Native**

**Justification:**
- **Audio Control Granularity**: React Native provides excellent access to native audio APIs through libraries like `react-native-sound`, `react-native-track-player`, and `expo-av`, which offer precise playback control needed for synchronization.
- **WebSocket Integration**: First-class support for WebSocket libraries (Socket.io client works seamlessly).
- **Developer Ecosystem**: Larger community, more third-party integrations for music services (Spotify SDK, etc.).
- **Code Sharing**: Can share TypeScript/JavaScript code between mobile app and Node.js backend.
- **Time-to-Market**: Faster development with hot reloading and extensive component libraries.

**Flutter Consideration**: Flutter would be viable if you need:
- Slightly better performance (though not critical for this use case)
- Preference for Dart over JavaScript
- However, music SDK integrations are less mature in Flutter ecosystem

**Verdict**: React Native for faster development and better audio/music service integrations.

---

### 1.2 Backend Stack: **Node.js with NestJS + Socket.io**

**Chosen: Node.js (TypeScript) with NestJS framework**

**Justification:**

#### Why Node.js?
- **Code Sharing**: Same language (TypeScript) as React Native app
- **WebSocket Excellence**: Socket.io is the gold standard for real-time communication
- **Event-Driven Architecture**: Perfect for real-time, high-concurrency scenarios
- **Rich Ecosystem**: npm packages for everything (auth, validation, scheduling)
- **Developer Productivity**: Fast iteration, excellent tooling

#### Why NestJS specifically?
- **Production-Ready Structure**: Built-in dependency injection, modular architecture
- **WebSocket Gateway**: Native Socket.io integration with decorators
- **TypeScript-First**: Strong typing reduces bugs in sync logic
- **Microservices Ready**: Easy to scale horizontally when needed
- **Built-in Validation**: Class-validator and class-transformer for data integrity

#### Alternative Comparison:

**Go (Fiber/Gin + Gorilla WebSocket)**
- ✅ Better raw performance (2-3x throughput)
- ✅ Lower memory footprint
- ❌ Smaller ecosystem for rapid development
- ❌ Less mature WebSocket libraries compared to Socket.io
- ❌ Different language from frontend (reduced code sharing)
- **Use Case**: Choose Go if you expect >100k concurrent connections per server

**Elixir/Phoenix (Channels + Presence)**
- ✅ Excellent for distributed systems (BEAM VM, OTP)
- ✅ Phoenix Presence perfect for room membership tracking
- ✅ Built-in fault tolerance
- ❌ Steeper learning curve
- ❌ Smaller talent pool
- ❌ Different paradigm (functional) from frontend
- **Use Case**: Choose Elixir if building massive-scale, distributed system from day one

**Verdict**: NestJS + Socket.io for optimal developer productivity, code sharing, and production-ready real-time features.

---

### 1.3 Database: **PostgreSQL + Redis**

**PostgreSQL (Primary Data Store)**
- User accounts, room metadata, settings, vote history
- ACID compliance for critical operations (DJ transfers, mutiny votes)
- JSON/JSONB for flexible room settings
- Excellent indexing for lookups by room code

**Redis (Real-Time State + Pub/Sub)**
- Active room state (current DJ, playing track, playback position)
- WebSocket session management (userId → socketId mapping)
- Pub/Sub for cross-server synchronization (if multiple backend instances)
- TTL-based cleanup of inactive rooms
- Vote counting with atomic operations (INCR, MULTI/EXEC)

**Rationale**: PostgreSQL for durability, Redis for speed and real-time state.

---

### 1.4 Additional Technologies

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **API Documentation** | Swagger/OpenAPI | Auto-generated from NestJS decorators |
| **Authentication** | JWT + Passport.js | Stateless auth for mobile clients |
| **Validation** | class-validator | Request/response validation |
| **ORM** | TypeORM or Prisma | Type-safe database access |
| **Time Sync Library** | Custom (see code examples) | NTP-inspired clock sync |
| **Audio Playback** | react-native-track-player | Precise audio control on mobile |
| **Logging** | Winston + Loki/ELK | Structured logging for debugging sync issues |
| **Monitoring** | Prometheus + Grafana | Metrics for latency, drift, connections |
| **Deployment** | Docker + Docker Compose | Consistent environments on Ubuntu 22.04 |
| **Process Manager** | PM2 | Node.js process management and clustering |

---

## 2. Architecture Diagram (Textual Description)

### 2.1 High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Mobile Clients                          │
│  (iOS/Android - React Native + Socket.io Client)                │
│                                                                 │
│  Components:                                                    │
│  - Clock Sync Manager (measures RTT, calculates offset)        │
│  - Audio Playback Engine (schedules precise playback)          │
│  - WebSocket Client (real-time events)                         │
│  - UI Layer (Lobby, Chat, DJ Controls)                         │
└────────────┬────────────────────────────────────────────────────┘
             │ HTTPS (REST) + WSS (WebSocket)
             │
┌────────────▼────────────────────────────────────────────────────┐
│                    Load Balancer (Optional)                     │
│                      (nginx/HAProxy)                            │
└────────────┬────────────────────────────────────────────────────┘
             │
    ┌────────┴────────┐
    │                 │
┌───▼────┐      ┌────▼─────┐
│ Server │      │ Server   │  (Horizontal scaling with Redis Pub/Sub)
│ Node 1 │      │ Node N   │
└───┬────┘      └────┬─────┘
    │                │
    └────────┬───────┘
             │
┌────────────▼────────────────────────────────────────────────────┐
│                       NestJS Backend                            │
│                                                                 │
│  Modules:                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Auth Module     │  │ Rooms Module     │  │ Sync Module   │ │
│  │ - JWT issuing   │  │ - Create/join    │  │ - Clock sync  │ │
│  │ - User sessions │  │ - Membership     │  │ - RTT calc    │ │
│  └─────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ DJ Module       │  │ Playback Module  │  │ Vote Module   │ │
│  │ - Election      │  │ - Play/pause     │  │ - DJ votes    │ │
│  │ - Transfer      │  │ - Seek commands  │  │ - Mutiny      │ │
│  └─────────────────┘  └──────────────────┘  └───────────────┘ │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           WebSocket Gateway (Socket.io)                  │  │
│  │  - Connection handling                                   │  │
│  │  - Room broadcasting                                     │  │
│  │  - Event routing (chat, votes, playback commands)       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────┬────────────────────────────────┬───────────────────┘
             │                                │
     ┌───────▼────────┐              ┌───────▼────────┐
     │  PostgreSQL    │              │     Redis      │
     │                │              │                │
     │ - Users        │              │ - Room state   │
     │ - Rooms        │              │ - Active DJs   │
     │ - Memberships  │              │ - Vote counts  │
     │ - Vote history │              │ - Socket maps  │
     │ - DJ history   │              │ - Pub/Sub      │
     └────────────────┘              └────────────────┘
```

### 2.2 Critical Flow: Play Command Execution

This is the most critical flow for audio synchronization:

```
Step 1: DJ presses "Play"
  ├─> Mobile app sends WebSocket event:
  │   { event: 'playback:start', trackId: 'xyz', startPosition: 0 }
  │
Step 2: Server receives event
  ├─> Validates DJ has permission
  ├─> Gets current server timestamp: serverNow = Date.now()
  ├─> Calculates future start time:
  │   startAtServerTime = serverNow + SYNC_BUFFER (e.g., 1000ms)
  ├─> Updates Redis room state:
  │   - currentTrack = trackId
  │   - playbackState = 'playing'
  │   - startedAtServerTime = startAtServerTime
  │   - startPosition = 0
  │
Step 3: Server broadcasts to all room members
  ├─> Socket.io room emit:
  │   {
  │     event: 'playback:start',
  │     trackId: 'xyz',
  │     startAtServerTime: 1700000001234,  // Unix timestamp (ms)
  │     startPosition: 0,
  │     serverTimestamp: 1700000000234      // Current server time (for verification)
  │   }
  │
Step 4: Each client receives broadcast
  ├─> Retrieves stored clockOffset (calculated from periodic sync)
  ├─> Converts server time to local time:
  │   localStartTime = startAtServerTime - clockOffset
  │
  ├─> Schedules playback:
  │   delayMs = localStartTime - Date.now()
  │   setTimeout(() => {
  │     audioPlayer.play(trackId, { startFrom: startPosition });
  │   }, delayMs);
  │
Step 5: Synchronized playback begins
  ├─> All devices start playing at the same effective moment
  ├─> Periodic sync checks (every 5-10s) adjust for drift
  │   - Compare actual position vs. expected position
  │   - Apply micro-corrections (seek ±50ms if needed, or time-stretching)
```

### 2.3 Clock Synchronization Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                  Clock Sync Protocol (NTP-Inspired)             │
└─────────────────────────────────────────────────────────────────┘

Frequency: Every 30 seconds (configurable, more frequent during playback)

Client Initiates:
  t0 = Date.now()  // Client timestamp when sending
  ──> WebSocket: { event: 'sync:ping', clientT0: t0 }

Server Receives:
  t1 = Date.now()  // Server timestamp when received
  t2 = Date.now()  // Server timestamp when sending response
  <── WebSocket: { event: 'sync:pong', clientT0: t0, serverT1: t1, serverT2: t2 }

Client Receives:
  t3 = Date.now()  // Client timestamp when received

  Calculate RTT (Round-Trip Time):
    rtt = (t3 - t0) - (t2 - t1)

  Calculate Clock Offset:
    offset = ((t1 - t0) + (t2 - t3)) / 2

  Store offset (apply exponential smoothing to filter noise):
    clockOffset = 0.7 * clockOffset + 0.3 * offset

  Store RTT for network quality metrics:
    currentRTT = rtt

Usage:
  - When server broadcasts startAtServerTime, client applies:
    localTime = serverTime - clockOffset
  - Clients with high RTT (>500ms) get earlier schedule buffer
  - Server can reject clients with unstable RTT (jitter >200ms)
```

### 2.4 Join Mid-Song Flow

```
User joins room while music is playing:

1. User connects to WebSocket, authenticates, joins room

2. Server sends current state snapshot:
   {
     event: 'room:state',
     currentTrack: 'xyz',
     playbackState: 'playing',
     startedAtServerTime: 1700000001234,  // When track started
     startPosition: 0,                     // Track start position
     serverTimestamp: 1700000045678        // Current server time
   }

3. Client calculates:
   - timeSinceStart = (serverTimestamp - clockOffset) - (startedAtServerTime - clockOffset)
   - currentPosition = startPosition + (timeSinceStart / 1000)  // Convert to seconds

4. Client seeks to currentPosition and starts playback immediately

5. Within next sync interval (5-10s), client's position converges with others
   through periodic drift correction
```

---

## 3. Database Schema Design

### 3.1 PostgreSQL Schema

```sql
-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255),  -- NULL if using OAuth
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX idx_username (username)
);

-- Rooms table
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(10) NOT NULL UNIQUE,  -- e.g., "GROOVE123"
  room_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255),  -- NULL if no password
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Settings (JSONB for flexibility)
  settings JSONB DEFAULT '{
    "maxMembers": 50,
    "mutinyThreshold": 0.51,
    "djCooldownMinutes": 5,
    "autoRandomizeDJ": false
  }',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,

  INDEX idx_room_code (room_code),
  INDEX idx_active_rooms (is_active, created_at)
);

-- Room memberships
CREATE TABLE room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role VARCHAR(20) DEFAULT 'listener',  -- 'owner', 'dj', 'listener'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Sync metrics (for monitoring/debugging)
  last_clock_offset_ms INTEGER,
  average_rtt_ms INTEGER,

  UNIQUE (room_id, user_id),
  INDEX idx_room_members (room_id, last_active),
  INDEX idx_user_rooms (user_id, joined_at)
);

-- Active DJ tracking
CREATE TABLE room_dj_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  became_dj_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  removed_at TIMESTAMP WITH TIME ZONE,  -- NULL if currently DJ
  removal_reason VARCHAR(50),  -- 'mutiny', 'voluntary', 'disconnect', 'vote'

  INDEX idx_room_current_dj (room_id, removed_at),  -- WHERE removed_at IS NULL
  INDEX idx_dj_history (room_id, became_dj_at DESC)
);

-- Votes table (for DJ selection and mutiny)
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  voter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  vote_type VARCHAR(20) NOT NULL,  -- 'dj_election', 'mutiny'
  target_user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL for mutiny

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  vote_session_id UUID,  -- Groups votes for same election/mutiny
  is_active BOOLEAN DEFAULT true,  -- Invalidate old votes

  UNIQUE (room_id, voter_id, vote_session_id),
  INDEX idx_active_votes (room_id, vote_session_id, is_active)
);

-- Chat messages (optional - could also use Redis only)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  INDEX idx_room_messages (room_id, created_at DESC)
) PARTITION BY RANGE (created_at);  -- Partition by month for performance

-- Playback history (analytics/debugging)
CREATE TABLE playback_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  track_id VARCHAR(255) NOT NULL,
  track_source VARCHAR(50),  -- 'spotify', 'youtube', 'local'

  dj_id UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ended_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  member_count INTEGER,

  INDEX idx_room_playback (room_id, started_at DESC)
);
```

### 3.2 Redis Data Structures

```javascript
// Key patterns and data structures in Redis

// 1. Active room state
// Key: room:{roomId}:state
// Type: Hash
{
  currentTrackId: 'spotify:track:xyz',
  currentTrackSource: 'spotify',
  playbackState: 'playing',  // 'playing', 'paused', 'stopped'
  startedAtServerTime: '1700000001234',  // Unix ms
  startPosition: '0',  // Seconds
  currentDjId: 'user-uuid',
  lastUpdateTime: '1700000045678'
}
// TTL: 24 hours (auto-cleanup inactive rooms)

// 2. Room members (for quick lookup)
// Key: room:{roomId}:members
// Type: Set
// Members: ['userId1', 'userId2', ...]
// TTL: 24 hours

// 3. User to Socket mapping
// Key: user:{userId}:socket
// Type: String
// Value: socketId
// TTL: 1 hour (refreshed on activity)

// 4. Socket to User mapping
// Key: socket:{socketId}:user
// Type: Hash
{
  userId: 'uuid',
  roomId: 'uuid',
  connectedAt: '1700000000000',
  clockOffset: '-45',  // milliseconds
  lastRtt: '120'  // milliseconds
}
// TTL: 1 hour

// 5. Active votes (mutiny/election)
// Key: room:{roomId}:vote:{voteSessionId}
// Type: Hash
{
  voteType: 'mutiny',
  targetUserId: 'uuid or null',
  startedAt: '1700000000000',
  votesFor: '5',
  votesAgainst: '2',
  requiredVotes: '8'  // Based on threshold
}
// TTL: 1 hour

// 6. Vote participants (prevent double voting)
// Key: room:{roomId}:vote:{voteSessionId}:voters
// Type: Set
// Members: ['userId1', 'userId2']
// TTL: 1 hour

// 7. DJ cooldown (rate limiting)
// Key: room:{roomId}:dj:cooldown:{userId}
// Type: String
// Value: timestamp when user can become DJ again
// TTL: Set to cooldown period (e.g., 5 minutes)

// 8. Pub/Sub channels (for multi-server scaling)
// Channel: room:{roomId}:events
// Messages: JSON events broadcast to all servers
```

---

## 4. Step-by-Step Implementation Plan

### Phase 1: MVP Foundations (Weeks 1-3)

**Goal**: Basic room functionality with naive synchronization

#### Backend Tasks:
1. **Project Setup**
   - Initialize NestJS project with TypeScript
   - Set up PostgreSQL + TypeORM/Prisma
   - Set up Redis client
   - Configure Docker Compose for local development
   - Set up environment variables (.env)

2. **Authentication Module**
   - User registration endpoint (POST /auth/register)
   - Login endpoint (POST /auth/login) → returns JWT
   - JWT strategy with Passport.js
   - User profile endpoint (GET /auth/profile)

3. **Rooms Module**
   - Create room (POST /rooms) → generates unique room code
   - Join room (POST /rooms/:code/join) → validates password if set
   - Leave room (POST /rooms/:code/leave)
   - Get room details (GET /rooms/:code)
   - List user's rooms (GET /rooms/my-rooms)

4. **WebSocket Gateway Setup**
   - Socket.io integration with NestJS
   - JWT authentication on WebSocket handshake
   - Join/leave room events
   - Connection/disconnection handling
   - Basic room broadcasting utility

5. **Chat Module**
   - Receive chat message (WebSocket: chat:message)
   - Broadcast to room members
   - Store in PostgreSQL (optional) or Redis only
   - Retrieve recent messages (GET /rooms/:code/messages)

6. **Basic DJ Selection**
   - Set DJ manually (owner privilege)
   - Store current DJ in Redis + PostgreSQL
   - Broadcast DJ change event

7. **Naive Playback Control**
   - DJ sends play command (WebSocket: playback:start)
   - Server broadcasts immediately to all members
   - No time synchronization yet (will have echo/drift)
   - Support pause, stop events

#### Frontend Tasks:
1. **Project Setup**
   - Initialize React Native project (Expo or React Native CLI)
   - Set up navigation (React Navigation)
   - Install Socket.io client, JWT storage (AsyncStorage)
   - Install audio player (react-native-track-player)

2. **Authentication Screens**
   - Login screen
   - Registration screen
   - JWT token storage and refresh logic

3. **Lobby List Screen**
   - Create room form (name, password optional)
   - Join room by code input
   - List user's active rooms

4. **Room/Chat Screen**
   - Chat message list
   - Chat input
   - Display current DJ
   - Display current track (text only)
   - Leave room button

5. **DJ Controls (Basic)**
   - Play button (DJ only)
   - Pause button (DJ only)
   - Track selection placeholder (hardcoded track ID)

6. **Audio Playback (Naive)**
   - Receive playback:start event
   - Immediately call audioPlayer.play()
   - No sync logic yet

#### Deliverables:
- ✅ Users can create/join password-protected rooms
- ✅ Chat works in real-time
- ✅ DJ can trigger playback on all devices (with noticeable echo/drift)
- ✅ Basic MVP deployed on Ubuntu 22.04 for testing

---

### Phase 2: Robust Audio Synchronization (Weeks 4-6)

**Goal**: Implement NTP-inspired clock sync and coordinated playback

#### Backend Tasks:
1. **Clock Sync Module**
   - Create SyncGateway for handling sync:ping/pong events
   - Store clock offsets and RTT in Redis (per socket)
   - Implement exponential smoothing for offset stability
   - Expose sync metrics endpoint (GET /rooms/:code/sync-metrics)

2. **Enhanced Playback Module**
   - Modify playback:start to include future start timestamp
   - Calculate startAtServerTime = now + buffer (1000ms default)
   - Adjust buffer based on room's max RTT
   - Broadcast with both serverTimestamp and startAtServerTime

3. **Periodic Sync Checks**
   - Server sends periodic state snapshots (every 10s during playback)
   - Include current theoretical playback position
   - Clients can self-correct drift

4. **Join Mid-Song Logic**
   - Calculate elapsed time when new user joins
   - Send current position in state snapshot
   - Client seeks to correct position on join

5. **Network Quality Monitoring**
   - Track RTT per client
   - Warn/kick clients with RTT > threshold (e.g., 1000ms)
   - Log sync quality metrics for debugging

#### Frontend Tasks:
1. **Clock Sync Manager**
   - Implement periodic sync:ping sender (every 30s)
   - Calculate offset using NTP algorithm
   - Apply exponential smoothing
   - Store offset in app state

2. **Synchronized Playback Scheduler**
   - Receive playback:start with startAtServerTime
   - Convert to local time using offset: localStart = serverStart - offset
   - Schedule setTimeout to start playback at exact local time
   - Handle edge case: if localStart is in past (network delay), start immediately

3. **Drift Correction Loop**
   - Every 5-10 seconds during playback:
     - Calculate expected position: expectedPos = startPosition + (now - startTime) / 1000
     - Get actual position: actualPos = audioPlayer.getPosition()
     - If |expectedPos - actualPos| > 50ms:
       - Seek to expectedPos (if drift > 200ms)
       - Or apply time-stretching (if drift < 200ms, for smoother correction)

4. **Seek/Mid-Song Join**
   - Receive room:state with current position
   - Seek audio player to correct position
   - Start drift correction loop

5. **UI Indicators**
   - Show sync status (synced, syncing, out-of-sync)
   - Display RTT and offset in debug overlay
   - Show warning if RTT too high

#### Deliverables:
- ✅ Devices play audio in tight sync (<50ms drift)
- ✅ New users joining mid-song sync correctly
- ✅ Drift auto-corrects over time
- ✅ Sync metrics visible for debugging

---

### Phase 3: Mutiny & Democratic Governance (Weeks 7-8)

**Goal**: Implement voting system for DJ selection and removal

#### Backend Tasks:
1. **Vote Module**
   - Create vote session (POST /rooms/:code/votes)
   - Cast vote (POST /votes/:sessionId/cast)
   - Get vote results (GET /votes/:sessionId)
   - Auto-close vote when threshold reached
   - Prevent double voting (check Redis set)

2. **DJ Election Flow**
   - Start election (WebSocket: vote:start-election)
   - Broadcast to all members
   - Collect votes in Redis
   - When threshold reached, assign new DJ
   - Update room_dj_history table
   - Broadcast vote:complete with new DJ

3. **Mutiny Flow**
   - Any member can start mutiny (WebSocket: vote:start-mutiny)
   - Check cooldown/rate limits
   - Collect votes (simple yes/no)
   - Calculate threshold (e.g., >50% of active members)
   - If successful:
     - Remove current DJ
     - Trigger new DJ election (or randomize)
     - Update DJ history with reason='mutiny'
   - Broadcast mutiny result

4. **Randomize DJ**
   - Endpoint: POST /rooms/:code/randomize-dj
   - Select random active member
   - Assign DJ role
   - Broadcast DJ change

5. **DJ Cooldown**
   - Set Redis key with TTL when user removed as DJ
   - Check cooldown before allowing re-election
   - Configurable per room (settings.djCooldownMinutes)

#### Frontend Tasks:
1. **Vote UI Components**
   - Vote initiation button (Start Election / Call Mutiny)
   - Vote casting UI (list of members or yes/no for mutiny)
   - Real-time vote count display
   - Vote result modal

2. **DJ Selection Screen**
   - List of room members
   - Vote button for each member
   - "Randomize DJ" button
   - Show current vote counts

3. **Mutiny Flow**
   - "Call Mutiny" button (prominent, but requires confirmation)
   - Mutiny vote UI (Yes/No)
   - Show vote progress (e.g., "5/8 votes needed")
   - Handle mutiny success → show new DJ

4. **Notifications**
   - Toast when vote starts
   - Notification when you've been elected DJ
   - Notification when mutiny succeeds/fails

#### Deliverables:
- ✅ Members can vote for DJ
- ✅ Randomize DJ works
- ✅ Mutiny can remove DJ and trigger re-election
- ✅ Cooldowns prevent spam
- ✅ Vote results broadcast in real-time

---

### Phase 4: Music Source Integration (Weeks 9-11)

**Goal**: Integrate real music playback (choose one strategy)

#### Option A: Spotify SDK (Recommended for MVP)

**Backend Tasks:**
1. Spotify OAuth flow (redirect to Spotify login)
2. Store Spotify access/refresh tokens per user
3. Search Spotify tracks (proxy to Spotify API)
4. Validate track availability before playback

**Frontend Tasks:**
1. Integrate Spotify SDK (react-native-spotify-remote)
2. OAuth login flow
3. Track search UI
4. Play tracks via Spotify SDK with same sync logic
5. Handle Spotify Premium requirement (warn users)

**Pros:**
- Legal, licensed music
- Large catalog
- Good SDK support

**Cons:**
- Requires Spotify Premium for all users
- DRM limitations (can't stream raw audio between devices)
- Each user needs Spotify account

#### Option B: YouTube Music API

**Tasks:**
1. Integrate YouTube Data API for search
2. Extract audio URL (violates TOS, risky)
3. Stream audio via react-native-video

**Pros:**
- Free for users
- Large catalog

**Cons:**
- TOS violation (YouTube doesn't allow audio extraction)
- Buffering issues
- Unreliable sync due to streaming

#### Option C: Local File Streaming (Alternative)

**Tasks:**
1. DJ selects file from device
2. Upload file to server (or use WebRTC peer-to-peer)
3. Server streams to all members
4. Clients download and cache file before playback

**Pros:**
- Full control, no licensing issues
- Works offline (after download)
- No third-party dependencies

**Cons:**
- Limited catalog (user's own music)
- Large bandwidth usage
- Slower start (download time)

**Recommendation**: Start with **Spotify SDK** for MVP (legal, best UX). Add local file support later as fallback.

#### Deliverables:
- ✅ DJ can search and select tracks from music source
- ✅ Tracks play across all devices in sync
- ✅ Handle source-specific errors (e.g., track not available)

---

### Phase 5: Production Hardening & UX Polish (Weeks 12-14)

**Goal**: Production-ready deployment, monitoring, error handling

#### Backend Tasks:
1. **Deployment**
   - Dockerize NestJS app
   - Set up PostgreSQL + Redis in Docker Compose
   - Configure nginx reverse proxy
   - SSL/TLS certificates (Let's Encrypt)
   - Deploy to Ubuntu 22.04 server
   - Set up PM2 for process management and clustering

2. **Monitoring & Logging**
   - Integrate Winston logger with structured logging
   - Set up Prometheus metrics:
     - Active connections
     - Room count
     - Average RTT per room
     - Clock offset distribution
     - Message throughput
   - Set up Grafana dashboards
   - Alert rules (e.g., high error rate, DB connection loss)

3. **Error Handling**
   - Global exception filter
   - WebSocket error handling (emit errors to client)
   - Database connection retry logic
   - Redis failover handling

4. **Performance Optimization**
   - Database query optimization (explain analyze)
   - Add indexes for slow queries
   - Redis connection pooling
   - Horizontal scaling test (2+ backend servers with Redis Pub/Sub)

5. **Security**
   - Rate limiting (express-rate-limit)
   - Input validation on all endpoints
   - SQL injection prevention (parameterized queries)
   - XSS prevention (sanitize chat messages)
   - CORS configuration
   - Helmet.js for security headers

6. **Testing**
   - Unit tests for core sync logic
   - Integration tests for vote flow
   - Load testing with Socket.io-client (simulate 100+ clients)

#### Frontend Tasks:
1. **Error Handling**
   - Network error recovery (auto-reconnect WebSocket)
   - Display user-friendly error messages
   - Offline mode handling
   - Audio playback error handling

2. **UX Polish**
   - Loading states for all async operations
   - Skeleton screens
   - Animations for DJ changes, votes
   - Haptic feedback (vote cast, DJ change)
   - Dark mode support

3. **Reconnection Logic**
   - Auto-reconnect on disconnect
   - Resume room state on reconnect
   - Re-sync clock after reconnect
   - Notify user of connection status

4. **Performance**
   - Optimize re-renders (React.memo, useMemo)
   - Lazy load screens
   - Image optimization
   - Bundle size optimization

5. **Testing**
   - E2E tests (Detox or Maestro)
   - Sync accuracy testing (measure actual drift)
   - Multi-device testing (physical devices)

6. **Analytics**
   - Track key events (room created, DJ changed, mutiny)
   - Crash reporting (Sentry)
   - Performance monitoring (React Native Performance)

#### Deliverables:
- ✅ Production deployment on Ubuntu 22.04
- ✅ Monitoring dashboards operational
- ✅ <1% error rate under normal load
- ✅ Polished UI with smooth animations
- ✅ App handles network interruptions gracefully
- ✅ Load tested with 50+ concurrent users per room

---

## 5. Synchronization Logic - Code Examples

### 5.1 Backend: Clock Sync Handler (NestJS)

```typescript
// src/sync/sync.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

interface SyncPingPayload {
  clientT0: number;
}

interface SyncPongPayload {
  clientT0: number;
  serverT1: number;
  serverT2: number;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
@Injectable()
export class SyncGateway {
  @WebSocketServer()
  server: Server;

  constructor(private redisService: RedisService) {}

  @SubscribeMessage('sync:ping')
  async handleSyncPing(
    @MessageBody() payload: SyncPingPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { clientT0 } = payload;

    // Server timestamps
    const serverT1 = Date.now(); // When received
    const serverT2 = Date.now(); // When sending (virtually same, but separated for protocol)

    // Send pong back to client
    const response: SyncPongPayload = {
      clientT0,
      serverT1,
      serverT2,
    };

    client.emit('sync:pong', response);

    // Note: Client will calculate offset, but we could also calculate server-side
    // and store in Redis for monitoring purposes
  }

  @SubscribeMessage('sync:report')
  async handleSyncReport(
    @MessageBody() payload: { offset: number; rtt: number },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const { offset, rtt } = payload;
    const userId = client.data.userId; // Attached during auth

    // Store sync metrics in Redis for monitoring
    await this.redisService.hset(
      `socket:${client.id}:user`,
      'clockOffset',
      offset.toString(),
    );

    await this.redisService.hset(
      `socket:${client.id}:user`,
      'lastRtt',
      rtt.toString(),
    );

    // Optional: Aggregate metrics for room
    const roomId = client.data.roomId;
    if (roomId) {
      await this.redisService.hset(
        `room:${roomId}:metrics`,
        `user:${userId}:rtt`,
        rtt.toString(),
      );
    }
  }
}
```

### 5.2 Backend: Playback Controller (NestJS)

```typescript
// src/playback/playback.gateway.ts
import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { RoomsService } from '../rooms/rooms.service';

interface PlaybackStartPayload {
  trackId: string;
  trackSource: 'spotify' | 'youtube' | 'local';
  startPosition?: number; // Seconds, default 0
}

interface PlaybackStartBroadcast {
  event: 'playback:start';
  trackId: string;
  trackSource: string;
  startAtServerTime: number; // Unix ms timestamp
  startPosition: number; // Seconds
  serverTimestamp: number; // Current server time for verification
}

@WebSocketGateway()
@Injectable()
export class PlaybackGateway {
  @WebSocketServer()
  server: Server;

  // Sync buffer: time between command and scheduled playback start
  // This should be greater than max RTT in the room
  private readonly SYNC_BUFFER_MS = 1000; // 1 second default

  constructor(
    private redisService: RedisService,
    private roomsService: RoomsService,
  ) {}

  @SubscribeMessage('playback:start')
  async handlePlaybackStart(
    @MessageBody() payload: PlaybackStartPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const userId = client.data.userId;
    const roomId = client.data.roomId;

    if (!roomId) {
      throw new UnauthorizedException('Not in a room');
    }

    // Verify user is current DJ
    const currentDjId = await this.redisService.hget(
      `room:${roomId}:state`,
      'currentDjId',
    );

    if (currentDjId !== userId) {
      throw new UnauthorizedException('Only DJ can control playback');
    }

    const { trackId, trackSource, startPosition = 0 } = payload;

    // Calculate future start time
    const serverNow = Date.now();

    // Optional: Adjust buffer based on room's max RTT
    const maxRtt = await this.getMaxRttForRoom(roomId);
    const syncBuffer = Math.max(this.SYNC_BUFFER_MS, maxRtt * 2); // At least 2x max RTT

    const startAtServerTime = serverNow + syncBuffer;

    // Update room state in Redis
    await this.redisService.hmset(`room:${roomId}:state`, {
      currentTrackId: trackId,
      currentTrackSource: trackSource,
      playbackState: 'playing',
      startedAtServerTime: startAtServerTime.toString(),
      startPosition: startPosition.toString(),
      lastUpdateTime: serverNow.toString(),
    });

    // Broadcast to all room members
    const broadcast: PlaybackStartBroadcast = {
      event: 'playback:start',
      trackId,
      trackSource,
      startAtServerTime,
      startPosition,
      serverTimestamp: Date.now(), // Current time when sending
    };

    this.server.to(roomId).emit('playback:start', broadcast);

    console.log(
      `[Playback] Room ${roomId}: Starting track ${trackId} at server time ${startAtServerTime}`,
    );
  }

  @SubscribeMessage('playback:pause')
  async handlePlaybackPause(
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const roomId = client.data.roomId;
    const userId = client.data.userId;

    // Verify DJ permissions
    const currentDjId = await this.redisService.hget(
      `room:${roomId}:state`,
      'currentDjId',
    );

    if (currentDjId !== userId) {
      throw new UnauthorizedException('Only DJ can control playback');
    }

    // Update state
    await this.redisService.hset(
      `room:${roomId}:state`,
      'playbackState',
      'paused',
    );

    // Broadcast
    this.server.to(roomId).emit('playback:pause', {
      serverTimestamp: Date.now(),
    });
  }

  // Helper: Get maximum RTT in room for adaptive sync buffer
  private async getMaxRttForRoom(roomId: string): Promise<number> {
    const metrics = await this.redisService.hgetall(`room:${roomId}:metrics`);

    if (!metrics) return 100; // Default 100ms if no data

    const rttValues = Object.keys(metrics)
      .filter(key => key.endsWith(':rtt'))
      .map(key => parseInt(metrics[key], 10))
      .filter(val => !isNaN(val));

    return rttValues.length > 0 ? Math.max(...rttValues) : 100;
  }
}
```

### 5.3 Frontend: Clock Sync Manager (React Native)

```typescript
// src/services/ClockSyncManager.ts
import { Socket } from 'socket.io-client';

interface SyncPongPayload {
  clientT0: number;
  serverT1: number;
  serverT2: number;
}

export class ClockSyncManager {
  private socket: Socket;
  private clockOffset: number = 0; // milliseconds (client - server)
  private currentRtt: number = 0; // milliseconds
  private syncInterval: NodeJS.Timeout | null = null;

  // Smoothing factor for exponential moving average
  private readonly SMOOTHING_FACTOR = 0.3;

  // Sync frequency
  private readonly SYNC_INTERVAL_MS = 30000; // 30 seconds
  private readonly SYNC_INTERVAL_PLAYING_MS = 10000; // 10 seconds during playback

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on('sync:pong', (payload: SyncPongPayload) => {
      this.handleSyncPong(payload);
    });
  }

  /**
   * Start periodic clock synchronization
   * @param isPlaying - Sync more frequently during playback
   */
  public startSync(isPlaying: boolean = false): void {
    this.stopSync(); // Clear existing interval

    // Initial sync
    this.sendSyncPing();

    // Periodic sync
    const interval = isPlaying
      ? this.SYNC_INTERVAL_PLAYING_MS
      : this.SYNC_INTERVAL_MS;

    this.syncInterval = setInterval(() => {
      this.sendSyncPing();
    }, interval);
  }

  public stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  private sendSyncPing(): void {
    const clientT0 = Date.now();
    this.socket.emit('sync:ping', { clientT0 });
  }

  private handleSyncPong(payload: SyncPongPayload): void {
    const { clientT0, serverT1, serverT2 } = payload;
    const clientT3 = Date.now();

    // Calculate round-trip time (RTT)
    // RTT = (t3 - t0) - (t2 - t1)
    // This removes server processing time from the measurement
    const rtt = (clientT3 - clientT0) - (serverT2 - serverT1);

    // Calculate clock offset
    // Offset = ((t1 - t0) + (t2 - t3)) / 2
    // Positive offset means client clock is ahead of server
    const offset = ((serverT1 - clientT0) + (serverT2 - clientT3)) / 2;

    // Apply exponential smoothing to reduce noise
    // This prevents sudden jumps from network jitter
    if (this.clockOffset === 0) {
      // First measurement, no smoothing
      this.clockOffset = offset;
    } else {
      this.clockOffset =
        this.SMOOTHING_FACTOR * offset +
        (1 - this.SMOOTHING_FACTOR) * this.clockOffset;
    }

    this.currentRtt = rtt;

    // Report metrics to server (optional)
    this.socket.emit('sync:report', {
      offset: this.clockOffset,
      rtt: this.currentRtt,
    });

    console.log(
      `[Sync] Offset: ${this.clockOffset.toFixed(2)}ms, RTT: ${rtt.toFixed(2)}ms`,
    );
  }

  /**
   * Convert server timestamp to local timestamp
   */
  public serverTimeToLocal(serverTime: number): number {
    return serverTime - this.clockOffset;
  }

  /**
   * Convert local timestamp to server timestamp
   */
  public localTimeToServer(localTime: number): number {
    return localTime + this.clockOffset;
  }

  /**
   * Get current clock offset (for debugging/UI)
   */
  public getOffset(): number {
    return this.clockOffset;
  }

  /**
   * Get current RTT (for debugging/UI)
   */
  public getRtt(): number {
    return this.currentRtt;
  }
}
```

### 5.4 Frontend: Synchronized Audio Playback (React Native)

```typescript
// src/services/SyncedAudioPlayer.ts
import TrackPlayer, { State } from 'react-native-track-player';
import { ClockSyncManager } from './ClockSyncManager';

interface PlaybackStartEvent {
  trackId: string;
  trackSource: string;
  startAtServerTime: number; // Unix ms
  startPosition: number; // Seconds
  serverTimestamp: number;
}

export class SyncedAudioPlayer {
  private syncManager: ClockSyncManager;
  private driftCorrectionInterval: NodeJS.Timeout | null = null;

  // Playback metadata
  private currentTrackId: string | null = null;
  private startedAtLocalTime: number = 0;
  private trackStartPosition: number = 0;

  // Drift correction thresholds
  private readonly DRIFT_THRESHOLD_MS = 50; // Ignore drift below this
  private readonly SEEK_THRESHOLD_MS = 200; // Seek if drift exceeds this
  private readonly DRIFT_CHECK_INTERVAL_MS = 5000; // Check every 5 seconds

  constructor(syncManager: ClockSyncManager) {
    this.syncManager = syncManager;
    this.initializePlayer();
  }

  private async initializePlayer(): Promise<void> {
    await TrackPlayer.setupPlayer();
    console.log('[Audio] Player initialized');
  }

  /**
   * Handle synchronized playback start from server
   */
  public async handlePlaybackStart(event: PlaybackStartEvent): Promise<void> {
    const {
      trackId,
      trackSource,
      startAtServerTime,
      startPosition,
      serverTimestamp,
    } = event;

    console.log(
      `[Audio] Received playback start: track=${trackId}, serverStart=${startAtServerTime}`,
    );

    // Convert server start time to local time
    const localStartTime = this.syncManager.serverTimeToLocal(startAtServerTime);
    const nowLocal = Date.now();
    const delayMs = localStartTime - nowLocal;

    console.log(
      `[Audio] Scheduling playback in ${delayMs}ms (localStart=${localStartTime})`,
    );

    // Load track
    await this.loadTrack(trackId, trackSource);

    // Store metadata
    this.currentTrackId = trackId;
    this.startedAtLocalTime = localStartTime;
    this.trackStartPosition = startPosition;

    if (delayMs > 0) {
      // Schedule future playback
      setTimeout(() => {
        this.startPlayback(startPosition);
      }, delayMs);
    } else {
      // Start time is in the past (network delay exceeded buffer)
      // Calculate how far into the track we should be
      const elapsedSeconds = Math.abs(delayMs) / 1000;
      const adjustedPosition = startPosition + elapsedSeconds;

      console.warn(
        `[Audio] Start time in past by ${Math.abs(delayMs)}ms, seeking to ${adjustedPosition}s`,
      );

      this.startPlayback(adjustedPosition);
    }

    // Start drift correction loop
    this.startDriftCorrection();
  }

  /**
   * Handle pause event
   */
  public async handlePlaybackPause(): Promise<void> {
    await TrackPlayer.pause();
    this.stopDriftCorrection();
    console.log('[Audio] Paused');
  }

  /**
   * Handle stop event
   */
  public async handlePlaybackStop(): Promise<void> {
    await TrackPlayer.stop();
    await TrackPlayer.reset();
    this.stopDriftCorrection();
    this.currentTrackId = null;
    console.log('[Audio] Stopped');
  }

  /**
   * Join mid-song: seek to current position
   */
  public async joinMidSong(
    trackId: string,
    trackSource: string,
    startedAtServerTime: number,
    startPosition: number,
    currentServerTime: number,
  ): Promise<void> {
    // Load track
    await this.loadTrack(trackId, trackSource);

    // Calculate how long the track has been playing
    const localStartTime = this.syncManager.serverTimeToLocal(startedAtServerTime);
    const nowLocal = Date.now();
    const elapsedMs = nowLocal - localStartTime;
    const elapsedSeconds = elapsedMs / 1000;

    // Calculate current position
    const currentPosition = startPosition + elapsedSeconds;

    console.log(
      `[Audio] Joining mid-song: elapsed=${elapsedSeconds.toFixed(2)}s, position=${currentPosition.toFixed(2)}s`,
    );

    // Store metadata
    this.currentTrackId = trackId;
    this.startedAtLocalTime = localStartTime;
    this.trackStartPosition = startPosition;

    // Seek and play
    await TrackPlayer.seekTo(currentPosition);
    await TrackPlayer.play();

    // Start drift correction
    this.startDriftCorrection();
  }

  /**
   * Periodically check and correct drift
   */
  private startDriftCorrection(): void {
    this.stopDriftCorrection();

    this.driftCorrectionInterval = setInterval(async () => {
      await this.correctDrift();
    }, this.DRIFT_CHECK_INTERVAL_MS);
  }

  private stopDriftCorrection(): void {
    if (this.driftCorrectionInterval) {
      clearInterval(this.driftCorrectionInterval);
      this.driftCorrectionInterval = null;
    }
  }

  /**
   * Check current position vs. expected position and correct if needed
   */
  private async correctDrift(): Promise<void> {
    const state = await TrackPlayer.getState();

    if (state !== State.Playing) {
      return; // Only correct during playback
    }

    // Calculate expected position
    const nowLocal = Date.now();
    const elapsedMs = nowLocal - this.startedAtLocalTime;
    const elapsedSeconds = elapsedMs / 1000;
    const expectedPosition = this.trackStartPosition + elapsedSeconds;

    // Get actual position
    const actualPosition = await TrackPlayer.getPosition();

    // Calculate drift
    const driftSeconds = actualPosition - expectedPosition;
    const driftMs = driftSeconds * 1000;

    console.log(
      `[Audio] Drift check: expected=${expectedPosition.toFixed(3)}s, actual=${actualPosition.toFixed(3)}s, drift=${driftMs.toFixed(2)}ms`,
    );

    // Only correct if drift exceeds threshold
    if (Math.abs(driftMs) < this.DRIFT_THRESHOLD_MS) {
      return; // Drift is acceptable
    }

    if (Math.abs(driftMs) > this.SEEK_THRESHOLD_MS) {
      // Large drift: seek to correct position
      console.log(`[Audio] Large drift detected, seeking to ${expectedPosition.toFixed(3)}s`);
      await TrackPlayer.seekTo(expectedPosition);
    } else {
      // Small drift: could apply time-stretching here (not implemented in this example)
      // Time-stretching would gradually speed up/slow down playback by ~1-2%
      // to smooth out the correction without an audible seek
      console.log(`[Audio] Small drift detected, would apply time-stretching`);

      // For now, just seek (acceptable for 50-200ms range)
      await TrackPlayer.seekTo(expectedPosition);
    }
  }

  /**
   * Load track based on source
   */
  private async loadTrack(trackId: string, trackSource: string): Promise<void> {
    await TrackPlayer.reset();

    // Different loading logic based on source
    switch (trackSource) {
      case 'spotify':
        // Load from Spotify SDK (requires separate integration)
        // For now, placeholder
        console.warn('[Audio] Spotify playback not implemented');
        break;

      case 'youtube':
        // Load YouTube audio URL
        console.warn('[Audio] YouTube playback not implemented');
        break;

      case 'local':
        // Load local file URL
        await TrackPlayer.add({
          id: trackId,
          url: trackId, // Assuming trackId is file URI
          title: 'Local Track',
        });
        break;

      default:
        throw new Error(`Unknown track source: ${trackSource}`);
    }
  }

  /**
   * Start playback at specific position
   */
  private async startPlayback(position: number): Promise<void> {
    if (position > 0) {
      await TrackPlayer.seekTo(position);
    }
    await TrackPlayer.play();
    console.log(`[Audio] Playing from position ${position.toFixed(3)}s`);
  }
}
```

### 5.5 Frontend: Integration in React Component

```typescript
// src/screens/RoomScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button } from 'react-native';
import { useSocket } from '../hooks/useSocket';
import { ClockSyncManager } from '../services/ClockSyncManager';
import { SyncedAudioPlayer } from '../services/SyncedAudioPlayer';

export const RoomScreen: React.FC = () => {
  const socket = useSocket();
  const syncManagerRef = useRef<ClockSyncManager | null>(null);
  const audioPlayerRef = useRef<SyncedAudioPlayer | null>(null);

  const [syncOffset, setSyncOffset] = useState<number>(0);
  const [syncRtt, setSyncRtt] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  useEffect(() => {
    if (!socket) return;

    // Initialize managers
    syncManagerRef.current = new ClockSyncManager(socket);
    audioPlayerRef.current = new SyncedAudioPlayer(syncManagerRef.current);

    // Start clock sync
    syncManagerRef.current.startSync();

    // Listen for playback events
    socket.on('playback:start', (event) => {
      audioPlayerRef.current?.handlePlaybackStart(event);
      setIsPlaying(true);

      // Increase sync frequency during playback
      syncManagerRef.current?.startSync(true);
    });

    socket.on('playback:pause', () => {
      audioPlayerRef.current?.handlePlaybackPause();
      setIsPlaying(false);

      // Decrease sync frequency when paused
      syncManagerRef.current?.startSync(false);
    });

    socket.on('playback:stop', () => {
      audioPlayerRef.current?.handlePlaybackStop();
      setIsPlaying(false);
    });

    socket.on('room:state', (state) => {
      // Handle joining mid-song
      if (state.playbackState === 'playing') {
        audioPlayerRef.current?.joinMidSong(
          state.currentTrackId,
          state.currentTrackSource,
          state.startedAtServerTime,
          state.startPosition,
          state.serverTimestamp,
        );
        setIsPlaying(true);
      }
    });

    // Update sync metrics for UI
    const metricsInterval = setInterval(() => {
      if (syncManagerRef.current) {
        setSyncOffset(syncManagerRef.current.getOffset());
        setSyncRtt(syncManagerRef.current.getRtt());
      }
    }, 1000);

    return () => {
      clearInterval(metricsInterval);
      syncManagerRef.current?.stopSync();
      socket.off('playback:start');
      socket.off('playback:pause');
      socket.off('playback:stop');
      socket.off('room:state');
    };
  }, [socket]);

  // DJ controls
  const handlePlay = () => {
    socket?.emit('playback:start', {
      trackId: 'test-track-id',
      trackSource: 'local',
      startPosition: 0,
    });
  };

  const handlePause = () => {
    socket?.emit('playback:pause');
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, marginBottom: 20 }}>Room</Text>

      {/* Sync status */}
      <View style={{ marginBottom: 20 }}>
        <Text>Clock Offset: {syncOffset.toFixed(2)} ms</Text>
        <Text>RTT: {syncRtt.toFixed(2)} ms</Text>
        <Text>Playing: {isPlaying ? 'Yes' : 'No'}</Text>
      </View>

      {/* DJ Controls (show only if user is DJ) */}
      <View>
        <Button title="Play" onPress={handlePlay} />
        <Button title="Pause" onPress={handlePause} />
      </View>
    </View>
  );
};
```

---

## 6. Key Assumptions & Considerations

### 6.1 Assumptions
1. **Network Quality**: Users have stable Wi-Fi or 4G/5G with <500ms RTT
2. **Device Capability**: Modern smartphones (2018+) with sufficient CPU/memory
3. **User Distribution**: Most lobbies will have 5-20 users (scale design for up to 50)
4. **Physical Proximity**: For best experience, users should be in same room/area (reduces phase cancellation from speaker placement)

### 6.2 Known Challenges & Mitigations

| Challenge | Mitigation |
|-----------|-----------|
| **Variable network latency** | Adaptive sync buffer based on max RTT; periodic re-sync |
| **Clock drift over time** | Periodic clock sync (30s idle, 10s during playback) |
| **Different audio hardware delays** | Accept some variance; user calibration option (future) |
| **Spotify DRM restrictions** | Each user plays via their own Spotify Premium account |
| **Users joining mid-song** | Calculate elapsed time, seek to correct position |
| **DJ disconnect** | Auto-elect new DJ or pause playback; configurable |
| **Battery drain** | Optimize sync frequency; use efficient audio codecs |

### 6.3 Future Enhancements
- **Audio calibration**: Per-device delay offset (manual or automatic)
- **Spatial audio**: Account for user positions for phase alignment
- **Advanced time-stretching**: Smoother drift correction without seeking
- **Bluetooth LE Audio Local Mode**: Hardware-level sync (<20ms) for local gatherings (see BLUETOOTH_ANALYSIS.md)
- **P2P mode**: Local network WebRTC for reduced latency
- **Offline mode**: Download tracks in advance for zero buffering
- **Ultrasonic calibration**: Use inaudible tones for precision local sync

---

## 7. Success Metrics

### 7.1 Technical Metrics
- **Sync Accuracy**: <50ms drift between devices (95th percentile)
- **Clock Sync RTT**: <200ms average RTT per client
- **Uptime**: >99.5% server availability
- **Connection Success**: >95% successful WebSocket connections
- **Error Rate**: <1% of playback commands fail

### 7.2 User Experience Metrics
- **Time to Join**: <5 seconds from code entry to room entry
- **Time to Sync**: <2 seconds from playback start to all devices playing
- **Perceived Echo**: <10% of users report echo (survey)
- **Battery Impact**: <5% additional battery drain per hour

---

## Conclusion

This architecture provides a **production-ready foundation** for GrooveBox, balancing:
- **Developer productivity** (React Native + NestJS TypeScript stack)
- **Real-time performance** (Socket.io + Redis for sub-100ms latency)
- **Scalability** (horizontal scaling with Redis Pub/Sub, PostgreSQL for durability)
- **Synchronization accuracy** (NTP-inspired clock sync + adaptive drift correction)

The phased implementation plan ensures you can:
1. **Launch MVP quickly** (Weeks 1-3) with basic features
2. **Achieve tight sync** (Weeks 4-6) with robust clock synchronization
3. **Add governance** (Weeks 7-8) with voting and mutiny
4. **Integrate music sources** (Weeks 9-11) for real content
5. **Production harden** (Weeks 12-14) for launch

The code examples provide **concrete, implementable patterns** for the most critical components: clock synchronization and coordinated playback scheduling.

**Next Steps**:
1. Set up development environment (Docker, PostgreSQL, Redis, Node.js)
2. Initialize NestJS backend project
3. Initialize React Native mobile project
4. Implement Phase 1 tasks in parallel (backend + frontend)
5. Test sync accuracy with physical devices early and often

This architecture is **ready for implementation**. All major technical decisions are justified, and the synchronization logic is detailed enough for an engineer to code directly from this document.
