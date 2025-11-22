# GrooveBox Implementation Checklist

Use this checklist to track your progress through the implementation phases.

## Phase 1: MVP Foundations (Weeks 1-3)

### Backend Setup
- [ ] Initialize NestJS project with TypeScript
  ```bash
  npm i -g @nestjs/cli
  nest new groovebox-backend
  ```
- [ ] Set up Docker Compose with PostgreSQL + Redis
- [ ] Configure environment variables (.env, .env.example)
- [ ] Install core dependencies:
  - [ ] `@nestjs/websockets socket.io`
  - [ ] `@nestjs/passport passport-jwt`
  - [ ] `@nestjs/typeorm typeorm pg`
  - [ ] `redis ioredis`
- [ ] Create database schema (see ARCHITECTURE.md Section 3.1)
- [ ] Set up TypeORM entities

### Authentication Module
- [ ] Create User entity
- [ ] POST /auth/register endpoint
- [ ] POST /auth/login endpoint (returns JWT)
- [ ] JWT authentication strategy
- [ ] GET /auth/profile endpoint
- [ ] Password hashing (bcrypt)

### Rooms Module
- [ ] Create Room and RoomMember entities
- [ ] POST /rooms - Create room with unique code generator
- [ ] POST /rooms/:code/join - Join room (validate password)
- [ ] POST /rooms/:code/leave - Leave room
- [ ] GET /rooms/:code - Get room details
- [ ] GET /rooms/my-rooms - List user's rooms

### WebSocket Gateway
- [ ] Create WebSocket gateway with Socket.io
- [ ] JWT authentication on handshake
- [ ] Connection handler (store userId in socket.data)
- [ ] Disconnection handler (cleanup Redis)
- [ ] Room join/leave events
- [ ] Test with Postman/Socket.io client

### Chat Module
- [ ] WebSocket event: `chat:message`
- [ ] Broadcast message to room members
- [ ] (Optional) Store messages in PostgreSQL
- [ ] GET /rooms/:code/messages - Recent messages

### Basic DJ Selection
- [ ] Redis key for current DJ: `room:{id}:state.currentDjId`
- [ ] POST /rooms/:code/set-dj (owner only)
- [ ] WebSocket event: `dj:changed`
- [ ] Update room_dj_history table

### Naive Playback
- [ ] WebSocket event: `playback:start` (DJ only)
- [ ] Broadcast to room (no sync yet)
- [ ] WebSocket event: `playback:pause`
- [ ] WebSocket event: `playback:stop`
- [ ] Update Redis room state

### Frontend Setup
- [ ] Initialize React Native project
  ```bash
  npx react-native init GrooveBox --template react-native-template-typescript
  ```
- [ ] Install dependencies:
  - [ ] `@react-navigation/native`
  - [ ] `socket.io-client`
  - [ ] `@react-native-async-storage/async-storage`
  - [ ] `react-native-track-player`
- [ ] Set up navigation (Stack + Tab)

### Auth Screens
- [ ] Login screen
- [ ] Registration screen
- [ ] JWT storage in AsyncStorage
- [ ] Auth context (React Context)
- [ ] Auto-login on app start

### Lobby Screens
- [ ] Lobby list screen
- [ ] Create room modal/screen
- [ ] Join room by code input
- [ ] Display user's rooms

### Room/Chat Screen
- [ ] Chat message list (FlatList)
- [ ] Chat input
- [ ] WebSocket connection on room join
- [ ] Display current DJ indicator
- [ ] Leave room button

### DJ Controls
- [ ] Play button (visible only to DJ)
- [ ] Pause button (visible only to DJ)
- [ ] Track selection placeholder

### Naive Audio Playback
- [ ] Initialize react-native-track-player
- [ ] Listen for `playback:start` event
- [ ] Call `TrackPlayer.play()` immediately
- [ ] Listen for `playback:pause` event

### Phase 1 Testing
- [ ] Create room from one device
- [ ] Join room from another device
- [ ] Send chat messages
- [ ] Set DJ
- [ ] Trigger playback (expect echo/drift - this is expected!)
- [ ] Deploy backend to Ubuntu 22.04 test server

---

## Phase 2: Robust Audio Synchronization (Weeks 4-6)

### Backend: Clock Sync Module
- [ ] Create `sync.gateway.ts`
- [ ] WebSocket event: `sync:ping` handler
- [ ] WebSocket event: `sync:pong` response
- [ ] Store clock offset in Redis: `socket:{id}:user.clockOffset`
- [ ] Store RTT in Redis: `socket:{id}:user.lastRtt`
- [ ] WebSocket event: `sync:report` handler (optional)

### Backend: Enhanced Playback
- [ ] Modify `playback:start` to calculate `startAtServerTime`
- [ ] Implement adaptive sync buffer (based on max RTT)
- [ ] Add `serverTimestamp` to broadcasts
- [ ] Create helper: `getMaxRttForRoom(roomId)`

### Backend: State Snapshots
- [ ] Periodic state broadcast (every 10s during playback)
- [ ] Calculate theoretical playback position
- [ ] Emit `playback:sync` event with position

### Backend: Join Mid-Song
- [ ] On room join, check if music playing
- [ ] Calculate elapsed time since start
- [ ] Send `room:state` with current position

### Frontend: Clock Sync Manager
- [ ] Create `ClockSyncManager.ts` class
- [ ] Implement `sendSyncPing()` method
- [ ] Implement `handleSyncPong()` with NTP algorithm
- [ ] Exponential smoothing for offset
- [ ] Start/stop sync with configurable intervals
- [ ] Expose `serverTimeToLocal()` method

### Frontend: Synced Audio Player
- [ ] Create `SyncedAudioPlayer.ts` class
- [ ] Implement `handlePlaybackStart(event)`
- [ ] Schedule playback with `setTimeout`
- [ ] Handle past start times (calculate catch-up position)
- [ ] Implement `joinMidSong()` method
- [ ] Seek to calculated position

### Frontend: Drift Correction
- [ ] Implement `startDriftCorrection()` loop (every 5s)
- [ ] Calculate expected vs. actual position
- [ ] Seek if drift > 200ms
- [ ] (Future) Time-stretching for drift < 200ms

### Frontend: Integration
- [ ] Update RoomScreen to use ClockSyncManager
- [ ] Update RoomScreen to use SyncedAudioPlayer
- [ ] Start sync on room join
- [ ] Increase sync frequency during playback
- [ ] Display sync metrics (offset, RTT) in UI

### Phase 2 Testing
- [ ] Test with 3+ physical devices
- [ ] Measure sync accuracy (record and compare audio)
- [ ] Test join mid-song
- [ ] Test with varying network conditions (throttle Wi-Fi)
- [ ] Verify drift correction works over 5+ minutes
- [ ] Target: <50ms drift between devices

---

## Phase 3: Mutiny & Democratic Governance (Weeks 7-8)

### Backend: Vote Module
- [ ] Create Vote entity
- [ ] POST /rooms/:code/votes - Start vote session
- [ ] POST /votes/:sessionId/cast - Cast vote
- [ ] GET /votes/:sessionId - Get vote results
- [ ] Redis vote tracking with atomic operations

### Backend: DJ Election
- [ ] WebSocket event: `vote:start-election`
- [ ] Broadcast vote to all members
- [ ] Track votes in Redis: `room:{id}:vote:{sessionId}`
- [ ] Auto-complete when threshold reached
- [ ] Assign new DJ
- [ ] Update `room_dj_history`
- [ ] WebSocket event: `vote:complete`

### Backend: Mutiny System
- [ ] WebSocket event: `vote:start-mutiny`
- [ ] Check rate limits and cooldowns
- [ ] Track yes/no votes
- [ ] Calculate threshold (e.g., >50%)
- [ ] On success: remove DJ, trigger new election
- [ ] Update DJ history with reason='mutiny'
- [ ] WebSocket event: `mutiny:result`

### Backend: Randomize DJ
- [ ] POST /rooms/:code/randomize-dj
- [ ] Select random active member
- [ ] Assign DJ role
- [ ] Broadcast change

### Backend: DJ Cooldown
- [ ] Set Redis key with TTL on DJ removal
- [ ] Check cooldown before allowing re-election
- [ ] Configurable per room

### Frontend: Vote UI
- [ ] Vote initiation modal
- [ ] Member selection list (for DJ election)
- [ ] Yes/No buttons (for mutiny)
- [ ] Real-time vote count display
- [ ] Vote result modal/toast

### Frontend: DJ Selection Screen
- [ ] List all room members
- [ ] Vote button for each member
- [ ] "Randomize DJ" button
- [ ] Display current vote counts

### Frontend: Mutiny Flow
- [ ] "Call Mutiny" button (with confirmation)
- [ ] Mutiny vote UI
- [ ] Vote progress bar (X/Y votes needed)
- [ ] Handle mutiny result

### Frontend: Notifications
- [ ] Toast when vote starts
- [ ] Toast when elected DJ
- [ ] Toast when mutiny succeeds/fails
- [ ] Sound/haptic feedback

### Phase 3 Testing
- [ ] Test DJ election with 5+ users
- [ ] Test mutiny (successful)
- [ ] Test mutiny (failed)
- [ ] Test randomize DJ
- [ ] Test cooldowns
- [ ] Test edge case: DJ disconnects during vote

---

## Phase 4: Music Source Integration (Weeks 9-11)

### Option A: Spotify SDK (Recommended)

#### Backend
- [ ] Register app in Spotify Developer Dashboard
- [ ] Implement Spotify OAuth flow
- [ ] Store access/refresh tokens (encrypted)
- [ ] Create endpoints:
  - [ ] GET /spotify/authorize - Redirect to Spotify
  - [ ] GET /spotify/callback - Handle OAuth callback
  - [ ] GET /spotify/search?q={query} - Search tracks
  - [ ] GET /spotify/track/:id - Get track details
- [ ] Validate Spotify Premium before playback

#### Frontend
- [ ] Install `react-native-spotify-remote`
- [ ] Implement OAuth flow (open browser)
- [ ] Handle deep link callback
- [ ] Store Spotify tokens
- [ ] Track search screen
- [ ] Track selection (DJ only)
- [ ] Play via Spotify SDK with sync logic
- [ ] Handle errors (no Premium, track unavailable)

### Option B: Local File Streaming (Alternative)

#### Backend
- [ ] POST /rooms/:code/upload-track - Upload audio file
- [ ] Store file in S3 or local storage
- [ ] Generate presigned URL for download
- [ ] Stream file to clients

#### Frontend
- [ ] File picker (DJ only)
- [ ] Upload progress indicator
- [ ] Download track to cache before playback
- [ ] Play local file with sync logic

### Phase 4 Testing
- [ ] Search and play Spotify tracks
- [ ] Test with non-Premium accounts (should show error)
- [ ] Test with unavailable tracks
- [ ] Verify sync still works with real music
- [ ] Test across different genres/bitrates

---

## Phase 5: Production Hardening (Weeks 12-14)

### Backend: Deployment
- [ ] Create Dockerfile for NestJS app
- [ ] Create docker-compose.yml (app, PostgreSQL, Redis)
- [ ] Set up nginx reverse proxy
- [ ] Configure SSL with Let's Encrypt
- [ ] Deploy to Ubuntu 22.04 server
- [ ] Set up PM2 for process management
- [ ] Configure PM2 clustering (multiple Node processes)

### Backend: Monitoring
- [ ] Install Winston logger
- [ ] Structured logging (JSON format)
- [ ] Install Prometheus client
- [ ] Expose /metrics endpoint
- [ ] Track metrics:
  - [ ] Active connections
  - [ ] Active rooms
  - [ ] Average RTT
  - [ ] Clock offset distribution
  - [ ] Message throughput
- [ ] Set up Grafana dashboards
- [ ] Configure alerts (Slack/email)

### Backend: Error Handling
- [ ] Global exception filter
- [ ] WebSocket error handling
- [ ] Database connection retry
- [ ] Redis reconnection logic
- [ ] Graceful shutdown (close connections)

### Backend: Performance
- [ ] Database query optimization (EXPLAIN ANALYZE)
- [ ] Add missing indexes
- [ ] Redis connection pooling
- [ ] Test horizontal scaling (2+ servers with Redis Pub/Sub)

### Backend: Security
- [ ] Install express-rate-limit
- [ ] Rate limit by IP and user ID
- [ ] Input validation on all endpoints (class-validator)
- [ ] SQL injection prevention (always use parameterized queries)
- [ ] XSS prevention (sanitize chat messages)
- [ ] CORS configuration (whitelist mobile app)
- [ ] Install Helmet.js

### Backend: Testing
- [ ] Unit tests for clock sync logic
- [ ] Unit tests for vote threshold calculation
- [ ] Integration tests for room join/leave
- [ ] Integration tests for DJ election
- [ ] Load test with Socket.io-client (100+ clients)

### Frontend: Error Handling
- [ ] WebSocket reconnection logic
- [ ] Display connection status indicator
- [ ] Offline mode handling
- [ ] Audio playback error handling
- [ ] Retry failed API requests

### Frontend: UX Polish
- [ ] Loading states (skeletons)
- [ ] Animations (DJ change, votes)
- [ ] Haptic feedback
- [ ] Dark mode support
- [ ] Accessibility (screen reader labels)

### Frontend: Performance
- [ ] Optimize re-renders (React.memo, useMemo)
- [ ] Lazy load screens
- [ ] Image optimization
- [ ] Analyze bundle size (react-native-bundle-visualizer)

### Frontend: Testing
- [ ] E2E tests with Detox or Maestro
- [ ] Sync accuracy test (physical devices)
- [ ] Multi-device testing (iOS + Android)

### Frontend: Analytics
- [ ] Install analytics SDK (Mixpanel, Amplitude)
- [ ] Track events:
  - [ ] Room created
  - [ ] Room joined
  - [ ] DJ changed
  - [ ] Mutiny initiated
  - [ ] Track played
- [ ] Install crash reporting (Sentry)

### Production Launch Checklist
- [ ] Backend deployed to production server
- [ ] Database backups configured (daily)
- [ ] SSL certificate auto-renewal working
- [ ] Monitoring dashboards operational
- [ ] Error alerting working (test it!)
- [ ] Mobile app submitted to App Store / Play Store
- [ ] Privacy policy published
- [ ] Terms of service published
- [ ] Support email set up
- [ ] Load test passed (50+ users per room)

---

## Optional Future Enhancements

### Advanced Sync Features
- [ ] Audio calibration per device (manual offset)
- [ ] Automatic latency detection via ultrasonic signal
- [ ] Advanced time-stretching (smoother drift correction)

### Social Features
- [ ] User profiles with avatars
- [ ] Friend system
- [ ] Room history and favorites
- [ ] Public room discovery

### Audio Features
- [ ] Equalizer controls (DJ only)
- [ ] Crossfade between tracks
- [ ] Playlist support
- [ ] Queue system (members can suggest tracks)

### Scalability
- [ ] Multi-region deployment
- [ ] CDN for audio files
- [ ] Redis cluster for high availability
- [ ] Database read replicas

### Mobile Features
- [ ] Background playback
- [ ] Lock screen controls
- [ ] Widget for quick room access
- [ ] Share room via QR code

---

## Quick Reference

### Local Development Setup
```bash
# Backend
cd groovebox-backend
docker-compose up -d  # Start PostgreSQL + Redis
npm install
npm run start:dev

# Frontend
cd groovebox-mobile
npm install
npx react-native run-ios  # or run-android
```

### Testing Sync Accuracy
1. Connect 3+ devices to same room
2. DJ starts playback
3. Record audio from all devices simultaneously
4. Import recordings into DAW (e.g., Audacity)
5. Align waveforms visually
6. Measure time difference (should be <50ms)

### Deployment Commands
```bash
# Build and deploy backend
docker build -t groovebox-backend .
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose logs -f backend

# Monitor metrics
curl http://localhost:3000/metrics
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| High drift (>200ms) | Check RTT, verify clock sync is running |
| Echo effect | Sync buffer too short, increase SYNC_BUFFER_MS |
| Devices out of sync after 5+ min | Drift correction not running, check interval |
| WebSocket disconnects | Check firewall, increase ping timeout |
| Spotify playback fails | Verify Premium account, check token refresh |
| High server latency | Check database query performance, add indexes |

---

**Last Updated**: 2025-11-22
**Document Version**: 1.0
