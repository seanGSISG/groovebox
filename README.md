# GrooveBox 🎵

**Turn multiple smartphones into a single, synchronized speaker system.**

GrooveBox is a mobile application (iOS + Android) that enables users to create shared listening experiences by synchronizing music playback across multiple devices with millisecond precision. Perfect for parties, gatherings, or anywhere you want to amplify the sound without expensive equipment.

## Key Features

- 🔊 **Synchronized Playback**: All devices play the same track in tight sync (<50ms drift)
- 🎧 **Democratic DJ**: Vote for who controls the music
- 🗳️ **Mutiny System**: Don't like the current DJ? Call a vote to replace them
- 💬 **Live Chat**: Communicate with everyone in your room
- 🔐 **Password-Protected Rooms**: Private or public listening sessions
- 🎵 **Music Integration**: Spotify support (with more sources coming)

## Architecture

- **Mobile App**: React Native (iOS + Android)
- **Backend**: Node.js (NestJS) with Socket.io
- **Database**: PostgreSQL + Redis
- **Deployment**: Ubuntu 22.04 with Docker

## Documentation

### Core Documents
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete technical architecture, tech stack justification, database schema, synchronization algorithms, and code examples
- **[IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)** - Phase-by-phase implementation checklist with detailed tasks

### Quick Links
- [Tech Stack Recommendation](./ARCHITECTURE.md#1-tech-stack-recommendation)
- [Database Schema](./ARCHITECTURE.md#3-database-schema-design)
- [Synchronization Logic](./ARCHITECTURE.md#5-synchronization-logic---code-examples)
- [Implementation Roadmap](./ARCHITECTURE.md#4-step-by-step-implementation-plan)

## How It Works

### The Challenge
Playing the same audio file on multiple devices sounds simple, but network latency and clock drift cause devices to fall out of sync, creating an echo effect instead of amplified sound.

### The Solution
GrooveBox uses a sophisticated synchronization system:

1. **Clock Synchronization**: Each device periodically syncs its clock with the server using an NTP-inspired protocol, calculating the time offset between local and server time.

2. **Scheduled Playback**: When the DJ presses "Play", the server doesn't immediately start playback. Instead, it:
   - Calculates a future start time (e.g., 1 second from now)
   - Broadcasts this timestamp to all devices
   - Each device converts the server timestamp to local time using its calculated offset
   - All devices schedule playback for that precise local moment

3. **Drift Correction**: Even with synchronized clocks, small drift accumulates over time. Every 5-10 seconds, devices check their playback position against the expected position and make micro-corrections.

**Result**: All devices start and stay synchronized within 50ms, creating a unified audio experience.

## Project Structure (Planned)

```
groovebox/
├── ARCHITECTURE.md                    # Complete technical architecture
├── IMPLEMENTATION_CHECKLIST.md        # Phased implementation tasks
├── README.md                          # This file
│
├── backend/                           # NestJS backend (Node.js + TypeScript)
│   ├── src/
│   │   ├── auth/                     # Authentication module
│   │   ├── rooms/                    # Room management
│   │   ├── sync/                     # Clock synchronization
│   │   ├── playback/                 # Playback control
│   │   ├── votes/                    # Voting system (DJ election, mutiny)
│   │   └── chat/                     # Real-time chat
│   ├── docker-compose.yml            # PostgreSQL + Redis
│   └── Dockerfile
│
└── mobile/                            # React Native app (iOS + Android)
    ├── src/
    │   ├── screens/                  # UI screens
    │   ├── services/                 # Business logic
    │   │   ├── ClockSyncManager.ts   # Clock synchronization
    │   │   └── SyncedAudioPlayer.ts  # Synchronized audio playback
    │   ├── hooks/                    # React hooks
    │   └── components/               # Reusable UI components
    └── package.json
```

## Development Roadmap

### Phase 1: MVP Foundations (Weeks 1-3)
- ✅ Basic room creation and joining
- ✅ Real-time chat
- ✅ Simple DJ controls
- ✅ Naive playback (with expected drift)

### Phase 2: Audio Synchronization (Weeks 4-6)
- ⏳ NTP-inspired clock sync
- ⏳ Coordinated playback scheduling
- ⏳ Drift correction
- ⏳ Join mid-song support

### Phase 3: Democratic Governance (Weeks 7-8)
- ⏳ DJ election voting
- ⏳ Mutiny system
- ⏳ Randomize DJ
- ⏳ Cooldowns and rate limiting

### Phase 4: Music Integration (Weeks 9-11)
- ⏳ Spotify SDK integration
- ⏳ Track search and selection
- ⏳ Local file streaming (alternative)

### Phase 5: Production Hardening (Weeks 12-14)
- ⏳ Deployment and monitoring
- ⏳ Security hardening
- ⏳ Performance optimization
- ⏳ Testing and QA

## Getting Started

### Prerequisites
- Node.js 18+
- Docker and Docker Compose
- React Native development environment
- (Optional) Spotify Developer account

### Backend Setup
```bash
cd backend
docker-compose up -d          # Start PostgreSQL + Redis
npm install
npm run start:dev
```

### Mobile App Setup
```bash
cd mobile
npm install
npx react-native run-ios      # or run-android
```

See [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) for detailed setup instructions.

## Key Technical Decisions

### Why React Native?
- Excellent audio control libraries
- First-class WebSocket support
- Faster development than native
- Code sharing with Node.js backend (TypeScript)

### Why NestJS?
- Production-ready structure
- Native Socket.io integration
- TypeScript-first (reduces bugs in critical sync logic)
- Excellent documentation and community

### Why PostgreSQL + Redis?
- **PostgreSQL**: Durable storage for users, rooms, vote history
- **Redis**: Real-time state (active DJ, current track, vote counts), pub/sub for horizontal scaling

## Synchronization Deep Dive

For a complete understanding of the synchronization system, see:
- [Clock Sync Protocol](./ARCHITECTURE.md#23-clock-synchronization-loop)
- [Playback Flow](./ARCHITECTURE.md#22-critical-flow-play-command-execution)
- [Code Examples](./ARCHITECTURE.md#5-synchronization-logic---code-examples)

## Contributing

This is currently a personal/team project. Contribution guidelines will be added after the MVP launch.

## License

TBD - To be determined after initial development

## Contact

For questions or feedback, please open an issue in this repository.

---

**Status**: 🚧 In Planning Phase
**Target MVP Launch**: Q2 2025
**Last Updated**: 2025-11-22
